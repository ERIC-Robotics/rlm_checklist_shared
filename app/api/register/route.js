import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../../../lib/db";
import { sendEmployeeRegistrationEmail } from "../../../lib/mailer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const employeeCode =
      typeof body?.employeeCode === "string"
        ? body.employeeCode.trim().toUpperCase()
        : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!/^[A-Z0-9-]{2,32}$/.test(employeeCode)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid employee code (2–32 letters, numbers, or hyphens)." },
        { status: 400 },
      );
    }
    if (!name || name.length > 120) {
      return NextResponse.json(
        { ok: false, error: "Enter your name (up to 120 characters)." },
        { status: 400 },
      );
    }

    const configuredOrigin = process.env.APP_BASE_URL || new URL(request.url).origin;
    const appOrigin = new URL(configuredOrigin);
    if (
      !["http:", "https:"].includes(appOrigin.protocol) ||
      (process.env.NODE_ENV === "production" && appOrigin.protocol !== "https:")
    ) {
      return NextResponse.json(
        { ok: false, error: "APP_BASE_URL must be a valid HTTPS origin in production." },
        { status: 503 },
      );
    }

    const db = await getDb("auth");
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const createdRows = await db`
      WITH new_employee AS (
        INSERT INTO employees (employee_code, name, designation, is_active)
        VALUES (${employeeCode}, ${name}, '', 0)
        ON CONFLICT (employee_code) DO NOTHING
        RETURNING employee_code
      )
      INSERT INTO employee_registration_approvals (
        employee_code, token_hash, expires_at
      )
      SELECT employee_code, ${tokenHash}, ${expiresAt}
      FROM new_employee
      RETURNING employee_code
    `;
    if (!createdRows.length) {
      return NextResponse.json(
        { ok: false, error: "That employee code is already registered or awaiting approval." },
        { status: 409 },
      );
    }

    const approvalUrl = new URL(
      `/register/approve?token=${encodeURIComponent(token)}`,
      appOrigin,
    ).toString();
    const notification = await sendEmployeeRegistrationEmail({
      employeeCode,
      name,
      approvalUrl,
    });
    if (!notification.ok) {
      await db`
        DELETE FROM employees
        WHERE employee_code = ${employeeCode}
          AND is_active = 0
          AND EXISTS (
            SELECT 1 FROM employee_registration_approvals
            WHERE employee_code = ${employeeCode}
              AND token_hash = ${tokenHash}
          )
      `;
      return NextResponse.json(
        { ok: false, error: `Registration email could not be sent: ${notification.error}` },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        employee: { code: employeeCode, name },
        pendingApproval: true,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Employee registration failed:", error);
    return NextResponse.json(
      { ok: false, error: "Could not register the employee. Please try again." },
      { status: 500 },
    );
  }
}
