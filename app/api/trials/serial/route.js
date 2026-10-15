import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) {
      return NextResponse.json(
        { error: "Sign in to create a trial ID." },
        { status: 401 },
      );
    }

    const db = await getDb("trials");
    const rows = await db`
      SELECT nextval('trial_custom_id_serial_seq')::text AS serial
    `;
    return NextResponse.json({ serial: rows[0].serial });
  } catch (error) {
    console.error("Trial ID serial allocation failed:", error);
    return NextResponse.json(
      { error: "Could not allocate the next trial number." },
      { status: 500 },
    );
  }
}
