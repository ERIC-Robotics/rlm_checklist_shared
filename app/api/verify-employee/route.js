import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function POST(request) {
  try {
    const { employeeCode } = await request.json();
    if (!employeeCode || typeof employeeCode !== "string") {
      return NextResponse.json({ valid: false, error: "Employee code is required" }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(
      "SELECT employee_code, name FROM employees WHERE employee_code = ? AND is_active = 1",
    );
    const employee = stmt.get(employeeCode.trim().toUpperCase());

    if (!employee) {
      return NextResponse.json({ valid: false, error: "Invalid employee code" }, { status: 401 });
    }

    return NextResponse.json({
      valid: true,
      employee: { code: employee.employee_code, name: employee.name },
    });
  } catch (error) {
    console.error("Employee verification error:", error);
    return NextResponse.json({ valid: false, error: "Server error" }, { status: 500 });
  }
}
