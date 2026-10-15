import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { createSessionToken, findActiveEmployee, SESSION_COOKIE, sessionCookieOptions } from "../../../lib/session";

export async function POST(request) {
  try {
    const { employeeCode } = await request.json();
    if (!employeeCode || typeof employeeCode !== "string") {
      return NextResponse.json({ valid: false, error: "Employee code is required" }, { status: 400 });
    }

    const employee = await findActiveEmployee(employeeCode);

    if (!employee) {
      const db = await getDb("auth");
      const pending = await db`
        SELECT employee_code
        FROM employees
        WHERE employee_code = ${employeeCode.trim().toUpperCase()}
          AND is_active = 0
      `;
      if (pending.length) {
        return NextResponse.json(
          { valid: false, error: "Your registration is waiting for manager approval." },
          { status: 403 },
        );
      }
      return NextResponse.json({ valid: false, error: "Invalid employee code" }, { status: 401 });
    }

    const response = NextResponse.json({
      valid: true,
      employee: { code: employee.code, name: employee.name, designation: employee.designation },
    });
    response.cookies.set(SESSION_COOKIE, createSessionToken({
      code: employee.code,
      name: employee.name,
    }), sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Employee verification error:", error);

    if (error?.message?.includes("DATABASE_URL")) {
      return NextResponse.json(
        {
          valid: false,
          error: "Database is not configured. Add DATABASE_URL to the app environment before using employee login.",
        },
        { status: 503 }
      );
    }

    if (error?.message?.includes("AUTH_SECRET")) {
      return NextResponse.json(
        {
          valid: false,
          error: "Login signing secret is not configured. Add AUTH_SECRET (at least 32 characters) to the app environment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}
