import { NextResponse } from "next/server";
import {
  decryptExternalMemberAadhaars,
  encryptExternalMemberAadhaars,
} from "../../../../lib/aadhaarCrypto.mjs";
import { canEditAgenda } from "../../../../lib/agendaAccess";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to open shared trials." }, { status: 401 });

    const { trialId } = await params;
    const db = await getDb("trials");
    const rows = await db`
      SELECT trial_id, title, state, version, custom_trial_id, submitted, agenda_submitted, pre_trial_submitted,
             owner_code, created_at, updated_at
      FROM trials
      WHERE trial_id = ${trialId}
    `;
    const row = rows[0];
    if (
      !row ||
      (row.agenda_submitted !== true &&
        row.pre_trial_submitted !== true &&
        row.owner_code !== employee.code &&
        !canEditAgenda(employee.code))
    ) {
      return NextResponse.json(
        { error: "You cannot access this unpublished trial." },
        { status: row ? 403 : 404 },
      );
    }
    return NextResponse.json({
      trial: {
        trialId: row.trial_id,
        title: row.title,
        ...decryptExternalMemberAadhaars(row.state),
        version: row.version,
        customTrialId: row.custom_trial_id,
        submitted: row.submitted,
        agendaSubmitted: row.agenda_submitted,
        preTrialSubmitted: row.pre_trial_submitted,
        ownerCode:
          row.owner_code === employee.code || canEditAgenda(employee.code)
            ? row.owner_code
            : "",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Shared trial load error:", error);
    return NextResponse.json({ error: "Could not load this trial." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to save shared trials." }, { status: 401 });

    const { trialId } = await params;
    if (!trialId || trialId.length > 160) {
      return NextResponse.json({ error: "Invalid trial ID." }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    let state = body?.state;
    const meta = body?.meta || {};
    if (!state || typeof state !== "object" || Array.isArray(state) || !state.answers || typeof state.answers !== "object") {
      return NextResponse.json({ error: "Trial answers are required." }, { status: 400 });
    }
    const db = await getDb("trials");
    const isPmo = canEditAgenda(employee.code);
    const existingRows = await db`
      SELECT state, agenda_submitted, pre_trial_submitted, owner_code
      FROM trials
      WHERE trial_id = ${trialId}
    `;
    const existingTrial = existingRows[0];
    if (
      existingTrial &&
      existingTrial.agenda_submitted !== true &&
      existingTrial.pre_trial_submitted !== true &&
      existingTrial.owner_code !== employee.code &&
      !isPmo
    ) {
      return NextResponse.json(
        { error: "You cannot edit this unpublished trial." },
        { status: 403 },
      );
    }
    if (!canEditAgenda(employee.code)) {
      const savedAnswers = existingTrial?.state?.answers;
      const answers = { ...state.answers };
      for (const questionNum of [1, 2, 3, 4, 5]) {
        if (savedAnswers && Object.hasOwn(savedAnswers, questionNum)) {
          answers[questionNum] = savedAnswers[questionNum];
        } else {
          delete answers[questionNum];
        }
      }
      state = {
        ...state,
        answers,
        agendaSubmitted: existingTrial?.agenda_submitted === true,
        preTrialSubmitted:
          state.preTrialSubmitted === true ||
          existingTrial?.pre_trial_submitted === true,
      };
    }

    const externalMembers =
      state.answers?.[5]?.externalMembers || state.answers?.[4]?.externalMembers;
    if (
      Array.isArray(externalMembers) &&
      externalMembers.some((member) => member?.aadhaar && !/^\d{12}$/.test(member.aadhaar))
    ) {
      return NextResponse.json({ error: "External Aadhaar numbers must contain exactly 12 digits." }, { status: 400 });
    }

    const version = state.version === "V2.2" || meta.version === "V2.2" ? "V2.2" : "Trolly";
    const title = typeof meta.title === "string" ? meta.title.slice(0, 500) : "Untitled trial";
    const customTrialId = typeof state.customTrialId === "string" ? state.customTrialId.slice(0, 200) : "";
    const submitted = state.submitted === true;
    const agendaSubmitted = state.agendaSubmitted === true || meta.agendaSubmitted === true;
    const preTrialSubmitted =
      state.preTrialSubmitted === true ||
      meta.preTrialSubmitted === true;
    const createdAt = state.createdAt && !Number.isNaN(Date.parse(state.createdAt))
      ? new Date(state.createdAt).toISOString()
      : new Date().toISOString();
    const updatedAt = new Date().toISOString();

    const savedRows = await db`
      INSERT INTO trials (
        trial_id, title, state, version, custom_trial_id, submitted, agenda_submitted, pre_trial_submitted,
        owner_code, created_at, updated_at
      )
      SELECT
        ${trialId}, ${title}, ${JSON.stringify(encryptExternalMemberAadhaars({ ...state, version, createdAt, updatedAt }))}::jsonb,
        ${version}, ${customTrialId}, ${submitted}, ${agendaSubmitted}, ${preTrialSubmitted}, ${employee.code}, ${createdAt}, ${updatedAt}
      WHERE NOT EXISTS (
        SELECT 1 FROM deleted_trials WHERE trial_id = ${trialId}
      )
      ON CONFLICT (trial_id) DO UPDATE SET
        title = EXCLUDED.title,
        state = EXCLUDED.state,
        version = EXCLUDED.version,
        custom_trial_id = EXCLUDED.custom_trial_id,
        submitted = EXCLUDED.submitted,
        agenda_submitted = EXCLUDED.agenda_submitted,
        pre_trial_submitted = EXCLUDED.pre_trial_submitted,
        updated_at = EXCLUDED.updated_at
      WHERE trials.owner_code = ${employee.code}
         OR ${isPmo} = TRUE
         OR trials.agenda_submitted = TRUE
         OR trials.pre_trial_submitted = TRUE
      RETURNING trial_id
    `;
    if (!savedRows.length) {
      return NextResponse.json(
        { error: "Trial was deleted or you do not have permission to edit it." },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    console.error("Shared trial save error:", error);
    return NextResponse.json({ error: "Could not save this trial to the shared database." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to delete shared trials." }, { status: 401 });

    const { trialId } = await params;
    const db = await getDb("trials");
    const rows = await db`
      SELECT owner_code, agenda_submitted
      FROM trials
      WHERE trial_id = ${trialId}
    `;
    const row = rows[0];
    if (
      !row ||
      (!row.agenda_submitted &&
        row.owner_code !== employee.code &&
        !canEditAgenda(employee.code))
    ) {
      return NextResponse.json(
        { error: "You cannot delete this unpublished trial." },
        { status: row ? 403 : 404 },
      );
    }
    await db.transaction([
      db`
        INSERT INTO deleted_trials (trial_id)
        VALUES (${trialId})
        ON CONFLICT (trial_id) DO NOTHING
      `,
      db`DELETE FROM trials WHERE trial_id = ${trialId}`,
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shared trial delete error:", error);
    return NextResponse.json({ error: "Could not delete this shared trial." }, { status: 500 });
  }
}
