import { NextResponse } from "next/server";
import { canEditAgenda } from "../../../../lib/agendaAccess";
import { decryptAadhaar } from "../../../../lib/aadhaarCrypto.mjs";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) {
      return NextResponse.json({ error: "Sign in before printing employee Aadhaar numbers." }, { status: 401 });
    }
    if (!canEditAgenda(employee.code)) {
      return NextResponse.json({ error: "Full Aadhaar printing is restricted to PMO users." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const employeeCodes = body?.employeeCodes;
    if (
      !Array.isArray(employeeCodes) ||
      employeeCodes.length > 100 ||
      employeeCodes.some((code) => typeof code !== "string" || code.length > 32)
    ) {
      return NextResponse.json({ error: "The employee list is invalid." }, { status: 400 });
    }

    if (!employeeCodes.length) return NextResponse.json({ aadhaars: {} });

    const db = await getDb("auth");
    const rows = (await Promise.all(employeeCodes.map((code) => db`
      SELECT employee_code, aadhaar_ciphertext
      FROM employees
      WHERE is_active = 1 AND employee_code = ${code}
    `))).flat();

    const aadhaars = Object.fromEntries(
      rows
        .filter((row) => row.aadhaar_ciphertext)
        .map((row) => [row.employee_code, decryptAadhaar(row.aadhaar_ciphertext)]),
    );
    return NextResponse.json({ aadhaars }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Print Aadhaar lookup error:", error);
    return NextResponse.json({ error: "Could not load Aadhaar numbers for printing." }, { status: 500 });
  }
}
