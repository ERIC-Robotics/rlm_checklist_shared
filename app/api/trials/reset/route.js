import { NextResponse } from "next/server";
import { canEditAgenda } from "../../../../lib/agendaAccess";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) {
      return NextResponse.json({ error: "Sign in before resetting demo trials." }, { status: 401 });
    }
    if (!canEditAgenda(employee.code)) {
      return NextResponse.json({ error: "Only a PMO user can reset demo trials." }, { status: 403 });
    }

    const db = await getDb("trials");
    await db.transaction([
      db`
        INSERT INTO deleted_trials (trial_id)
        SELECT trial_id FROM trials
        ON CONFLICT (trial_id) DO NOTHING
      `,
      db`DELETE FROM trials`,
      db`SELECT setval('trial_custom_id_serial_seq', 1, FALSE)`,
    ]);

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Demo trial reset failed:", error);
    return NextResponse.json({ error: "Could not reset demo trials." }, { status: 500 });
  }
}
