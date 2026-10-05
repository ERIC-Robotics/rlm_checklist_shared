import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { sendTicketEmail } from "../../../lib/mailer";
import { getSessionEmployee } from "../../../lib/session";
import { mapSupportTicket } from "../../../lib/supportTickets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to view support tickets." }, { status: 401 });

    const db = await getDb();
    const rows = await db`
      SELECT ticket_id, status, raised_by, employee, employee_code, issue_type,
             date_location, mast_number, description, trial_id, resolved_by,
             resolved_at, created_at, updated_at
      FROM support_tickets
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ tickets: rows.map(mapSupportTicket) });
  } catch (error) {
    console.error("Shared ticket list error:", error);
    return NextResponse.json({ error: "Could not load shared tickets." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ ok: false, error: "Sign in before sending a support ticket." }, { status: 401 });

    let submittedTicket;
    try {
      submittedTicket = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (
      typeof submittedTicket?.dateLocation !== "string" ||
      !submittedTicket.dateLocation.trim() ||
      typeof submittedTicket?.mastNumber !== "string" ||
      !submittedTicket.mastNumber.trim() ||
      !["Software", "Hardware"].includes(submittedTicket?.issueType) ||
      typeof submittedTicket?.description !== "string" ||
      !submittedTicket.description.trim()
    ) {
      return NextResponse.json({ ok: false, error: "All five ticket fields are required." }, { status: 400 });
    }

    const db = await getDb();
    const rows = await db`
      WITH next_ticket AS (
        SELECT nextval('support_ticket_number_seq') AS id
      )
      INSERT INTO support_tickets (
        id, ticket_id, status, raised_by, employee, employee_code, issue_type,
        date_location, mast_number, description, trial_id
      )
      SELECT
        next_ticket.id,
        'TKT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(next_ticket.id::text, 6, '0'),
        'Open', ${employee.name}, ${employee.name}, ${employee.code},
        ${submittedTicket.issueType}, ${submittedTicket.dateLocation.trim()},
        ${submittedTicket.mastNumber.trim()}, ${submittedTicket.description.trim()},
        ${typeof submittedTicket.trialId === "string" ? submittedTicket.trialId.slice(0, 200) : ""}
      FROM next_ticket
      RETURNING ticket_id, status, raised_by, employee, employee_code, issue_type,
                date_location, mast_number, description, trial_id, resolved_by,
                resolved_at, created_at, updated_at
    `;
    const ticket = mapSupportTicket(rows[0]);
    const mailResult = await sendTicketEmail({ ticket });

    return NextResponse.json({
      ok: true,
      ticket,
      emailTo: mailResult.ok ? mailResult.to : "",
      emailError: mailResult.ok ? "" : mailResult.error,
    });
  } catch (error) {
    console.error("Ticket submission error:", error);
    return NextResponse.json({ ok: false, error: "Could not process ticket." }, { status: 500 });
  }
}
