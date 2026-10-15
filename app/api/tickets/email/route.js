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
    await getDb("trials");
    const db = await getDb("tickets");
    const rows = await db`
      SELECT support_tickets.ticket_id, support_tickets.status, support_tickets.raised_by,
             support_tickets.employee, support_tickets.employee_code, support_tickets.issue_type,
             support_tickets.date_location, support_tickets.mast_number,
             support_tickets.description, support_tickets.trial_id,
             trials.custom_trial_id,
             COALESCE(NULLIF(support_tickets.form_version, ''), trials.version, '') AS form_version,
             support_tickets.resolved_by, support_tickets.resolved_at,
             support_tickets.created_at, support_tickets.updated_at
      FROM support_tickets
      LEFT JOIN trials ON trials.trial_id = support_tickets.trial_id
      WHERE support_tickets.ticket_id = ${body.ticketId.trim()}
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
