import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";

export const runtime = "nodejs";

function isValidDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export async function POST(request) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to migrate saved tickets." }, { status: 401 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (!Array.isArray(body?.tickets) || body.tickets.length > 500) {
      return NextResponse.json({ error: "The saved ticket list is invalid or too large to migrate." }, { status: 400 });
    }

    for (const ticket of body.tickets) {
      if (
        typeof ticket?.ticketId !== "string" ||
        !/^TKT-\d{4}-\d{6}$/.test(ticket.ticketId) ||
        !["Open", "Resolved"].includes(ticket.status || "Open") ||
        !["Software", "Hardware"].includes(ticket.issueType) ||
        typeof ticket.dateLocation !== "string" || !ticket.dateLocation.trim() ||
        typeof ticket.mastNumber !== "string" || !ticket.mastNumber.trim() ||
        typeof ticket.description !== "string" || !ticket.description.trim() ||
        (ticket.createdAt && !isValidDate(ticket.createdAt)) ||
        (ticket.resolvedAt && !isValidDate(ticket.resolvedAt))
      ) {
        return NextResponse.json({ error: "A locally saved ticket has invalid or missing fields; no tickets were migrated." }, { status: 400 });
      }
    }

    const db = await getDb("tickets");
    let imported = 0;
    for (const ticket of body.tickets) {
      const rows = await db`
        WITH next_ticket AS (
          SELECT nextval('support_ticket_number_seq') AS id
        )
        INSERT INTO support_tickets (
          id, ticket_id, status, raised_by, employee, employee_code, issue_type,
          date_location, mast_number, description, trial_id, form_version, resolved_by,
          resolved_at, created_at
        )
        SELECT
          next_ticket.id, ${ticket.ticketId}, ${ticket.status || "Open"},
          ${typeof ticket.raisedBy === "string" && ticket.raisedBy.trim() ? ticket.raisedBy.trim() : employee.name},
          ${employee.name}, ${employee.code}, ${ticket.issueType},
          ${ticket.dateLocation.trim()}, ${ticket.mastNumber.trim()},
          ${ticket.description.trim()}, ${typeof ticket.trialId === "string" ? ticket.trialId.slice(0, 200) : ""},
          ${["Trolly", "V2.2"].includes(ticket.formVersion) ? ticket.formVersion : ""},
          ${typeof ticket.resolvedBy === "string" ? ticket.resolvedBy.slice(0, 200) : ""},
          ${ticket.resolvedAt && isValidDate(ticket.resolvedAt) ? new Date(ticket.resolvedAt).toISOString() : null},
          ${ticket.createdAt && isValidDate(ticket.createdAt) ? new Date(ticket.createdAt).toISOString() : new Date().toISOString()}
        FROM next_ticket
        ON CONFLICT (ticket_id) DO NOTHING
        RETURNING ticket_id
      `;
      imported += rows.length;
    }

    return NextResponse.json({ ok: true, imported });
  } catch (error) {
    console.error("Legacy ticket migration error:", error);
    return NextResponse.json({ error: "Could not migrate locally saved tickets." }, { status: 500 });
  }
}
