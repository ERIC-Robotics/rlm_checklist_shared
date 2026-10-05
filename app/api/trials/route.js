import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { getSessionEmployee } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to view shared trials." }, { status: 401 });

    const includeAnswers = new URL(request.url).searchParams.get("include") === "answers";
    const db = await getDb();
    const rows = await db`
      SELECT trial_id, title, state, version, custom_trial_id, submitted,
             created_at, updated_at
      FROM trials
      ORDER BY updated_at DESC
    `;
    const trials = rows.map((row) => ({
      trialId: row.trial_id,
      title: row.title,
      ...(includeAnswers ? row.state : {}),
      version: row.version,
      customTrialId: row.custom_trial_id,
      submitted: row.submitted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return NextResponse.json({ trials });
  } catch (error) {
    console.error("Shared trial list error:", error);
    return NextResponse.json({ error: "Could not load shared trials." }, { status: 500 });
  }
}
