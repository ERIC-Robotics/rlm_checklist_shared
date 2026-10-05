import { NextResponse } from "next/server";
import { getSessionEmployee, SESSION_COOKIE, sessionCookieOptions } from "../../../lib/session";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ employee: null }, { status: 401 });
    return NextResponse.json({ employee });
  } catch (error) {
    console.error("Session lookup error:", error);
    return NextResponse.json({ error: "Could not verify the current session." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
