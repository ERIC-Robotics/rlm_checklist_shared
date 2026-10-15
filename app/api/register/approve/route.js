import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDb } from "../../../../lib/db";
import { clearEmployeeCache } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
      return NextResponse.json(
        { ok: false, error: "This approval link is invalid or expired." },
        { status: 400 },
      );
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const db = await getDb("auth");
    const rows = await db`
      WITH approved_employee AS (
        UPDATE employees
        SET is_active = 1
        WHERE is_active = 0
          AND employee_code = (
            SELECT employee_code
            FROM employee_registration_approvals
            WHERE token_hash = ${tokenHash}
              AND expires_at > NOW()
          )
        RETURNING employee_code, name
      ),
      consumed_approval AS (
        DELETE FROM employee_registration_approvals
        WHERE employee_code IN (
          SELECT employee_code FROM approved_employee
        )
        RETURNING employee_code
      )
      SELECT approved_employee.employee_code, approved_employee.name
      FROM approved_employee
      JOIN consumed_approval USING (employee_code)
    `;
    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "This approval link is invalid, expired, or already used." },
        { status: 400 },
      );
    }

    clearEmployeeCache(rows[0].employee_code);
    return NextResponse.json({ ok: true, employeeName: rows[0].name });
  } catch (error) {
    console.error("Employee registration approval failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not approve this registration. Please try again." },
      { status: 500 },
    );
  }
}
