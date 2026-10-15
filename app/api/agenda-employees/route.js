import { NextResponse } from "next/server";
import { decryptAadhaar } from "../../../lib/aadhaarCrypto.mjs";
import { getDb } from "../../../lib/db";
import { getSessionEmployee } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) {
      return NextResponse.json({ error: "Sign in to view the employee agenda." }, { status: 401 });
    }

    const db = await getDb("auth");
    const rows = await db`
      SELECT employee_code, name, designation, aadhaar_ciphertext
      FROM employees
      WHERE is_active = 1
        AND employee_code NOT IN ('16055', '16064')
      ORDER BY name, employee_code
    `;

    return NextResponse.json({
      employees: rows.map((row) => ({
        code: row.employee_code,
        name: row.name,
        designation: row.designation || "",
        aadhaarLast4: row.aadhaar_ciphertext
          ? decryptAadhaar(row.aadhaar_ciphertext).slice(-4)
          : "",
      })),
    });
  } catch (error) {
    console.error("Agenda employee list error:", error);
    return NextResponse.json({ error: "Could not load the employee agenda list." }, { status: 500 });
  }
}

