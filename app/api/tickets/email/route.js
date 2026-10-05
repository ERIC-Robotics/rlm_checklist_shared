import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { sendTicketEmail } from "../../../../lib/mailer";
import { getSessionEmployee } from "../../../../lib/session";
import { mapSupportTicket } from "../../../../lib/supportTickets";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ ok: false, error: "Sign in before emailing a support ticket." }, { status: 401 });

    const body = await request.json();
    if (typeof body?.ticketId !== "string" || !body.ticketId.trim()) {
      return NextResponse.json({ ok: false, error: "A ticket ID is required." }, { status: 400 });
    }
    const db = await getDb();
    const rows = await db`
      SELECT ticket_id, status, raised_by, employee, employee_code, issue_type,
             date_location, mast_number, description, trial_id, resolved_by,
             resolved_at, created_at, updated_at
      FROM support_tickets
      WHERE ticket_id = ${body.ticketId.trim()}
    `;
    if (!rows.length) return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });

    const result = await sendTicketEmail({ ticket: mapSupportTicket(rows[0]) });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, to: result.to });
  } catch (error) {
    console.error("Ticket email request error:", error);
    return NextResponse.json({ ok: false, error: "Could not send the ticket email." }, { status: 500 });
  }
}
