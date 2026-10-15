import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import { getSessionEmployee } from "../../../../lib/session";
import { mapSupportTicket } from "../../../../lib/supportTickets";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to update support tickets." }, { status: 401 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (!["Open", "Resolved"].includes(body?.status)) {
      return NextResponse.json({ error: "Ticket status must be Open or Resolved." }, { status: 400 });
    }
    const resolvedBy = body.status === "Resolved" && typeof body.resolvedBy === "string"
      ? body.resolvedBy.trim().slice(0, 200)
      : "";
    if (body.status === "Resolved" && !resolvedBy) {
      return NextResponse.json({ error: "Enter the name of the person resolving this ticket." }, { status: 400 });
    }

    const { ticketId } = await params;
    await getDb("trials");
    const db = await getDb("tickets");
    const rows = await db`
      UPDATE support_tickets
      SET status = ${body.status},
          resolved_by = ${resolvedBy},
          resolved_at = ${body.status === "Resolved" ? new Date().toISOString() : null},
          updated_at = NOW()
      WHERE ticket_id = ${ticketId}
      RETURNING ticket_id, status, raised_by, employee, employee_code, issue_type,
                date_location, mast_number, description, trial_id, form_version, resolved_by,
                resolved_at, created_at, updated_at
    `;
    if (!rows.length) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    const ticket = mapSupportTicket(rows[0]);
    if (ticket.trialId) {
      const trialRows = await db`
        SELECT version, custom_trial_id FROM trials WHERE trial_id = ${ticket.trialId}
      `;
      ticket.formVersion ||= trialRows[0]?.version || "";
      ticket.customTrialId = trialRows[0]?.custom_trial_id || "";
    }
    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("Shared ticket update error:", error);
    return NextResponse.json({ error: "Could not update this shared ticket." }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to delete support tickets." }, { status: 401 });

    const { ticketId } = await params;
    const db = await getDb("tickets");
    const rows = await db`
      DELETE FROM support_tickets
      WHERE ticket_id = ${ticketId}
      RETURNING ticket_id
    `;
    if (!rows.length) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Shared ticket delete error:", error);
    return NextResponse.json({ error: "Could not delete this shared ticket." }, { status: 500 });
  }
}
