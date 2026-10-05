import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to open shared trials." }, { status: 401 });

    const { trialId } = await params;
    const db = await getDb();
    const rows = await db`
      SELECT trial_id, title, state, version, custom_trial_id, submitted,
             created_at, updated_at
      FROM trials
      WHERE trial_id = ${trialId}
    `;
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "Trial not found." }, { status: 404 });
    return NextResponse.json({
      trial: {
        trialId: row.trial_id,
        title: row.title,
        ...row.state,
        version: row.version,
        customTrialId: row.custom_trial_id,
        submitted: row.submitted,
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
    const state = body?.state;
    const meta = body?.meta || {};
    if (!state || typeof state !== "object" || Array.isArray(state) || !state.answers || typeof state.answers !== "object") {
      return NextResponse.json({ error: "Trial answers are required." }, { status: 400 });
    }

    const version = state.version === "V2.2" || meta.version === "V2.2" ? "V2.2" : "Trolly";
    const title = typeof meta.title === "string" ? meta.title.slice(0, 500) : "Untitled trial";
    const customTrialId = typeof state.customTrialId === "string" ? state.customTrialId.slice(0, 200) : "";
    const submitted = state.submitted === true;
    const createdAt = state.createdAt && !Number.isNaN(Date.parse(state.createdAt))
      ? new Date(state.createdAt).toISOString()
      : new Date().toISOString();
    const updatedAt = new Date().toISOString();

    const db = await getDb();
    await db`
      INSERT INTO trials (
        trial_id, title, state, version, custom_trial_id, submitted,
        owner_code, created_at, updated_at
      )
      VALUES (
        ${trialId}, ${title}, ${JSON.stringify({ ...state, version, createdAt, updatedAt })}::jsonb,
        ${version}, ${customTrialId}, ${submitted}, ${employee.code}, ${createdAt}, ${updatedAt}
      )
      ON CONFLICT (trial_id) DO UPDATE SET
        title = EXCLUDED.title,
        state = EXCLUDED.state,
        version = EXCLUDED.version,
        custom_trial_id = EXCLUDED.custom_trial_id,
        submitted = EXCLUDED.submitted,
        updated_at = EXCLUDED.updated_at
    `;

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
    const db = await getDb();
    const rows = await db`
      DELETE FROM trials
      WHERE trial_id = ${trialId}
      RETURNING trial_id
    `;
    if (!rows.length) return NextResponse.json({ error: "Trial not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shared trial delete error:", error);
    return NextResponse.json({ error: "Could not delete this shared trial." }, { status: 500 });
  }
}
