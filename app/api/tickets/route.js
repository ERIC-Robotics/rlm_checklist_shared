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
             support_tickets.created_at, support_tickets.updated_at,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'id', id, 'filename', filename, 'contentType', content_type,
                 'sizeBytes', size_bytes
               ) ORDER BY id)
               FROM support_ticket_attachments
               WHERE support_ticket_attachments.ticket_id = support_tickets.ticket_id
             ), '[]'::json) AS attachments
      FROM support_tickets
      LEFT JOIN trials ON trials.trial_id = support_tickets.trial_id
      ORDER BY support_tickets.created_at DESC
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

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 27 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "The upload request is too large. Attachments must total 25 MB or less." }, { status: 413 });
    }

    let submittedTicket;
    let files = [];
    try {
      if (request.headers.get("content-type")?.includes("multipart/form-data")) {
        const formData = await request.formData();
        submittedTicket = Object.fromEntries(
          ["raisedBy", "dateLocation", "issueType", "happened", "expected", "trialId", "formVersion"]
            .map((field) => [field, formData.get(field)]),
        );
        files = formData.getAll("files").filter((value) => value && typeof value === "object" && "arrayBuffer" in value);
      } else {
        submittedTicket = await request.json();
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (
      typeof submittedTicket?.dateLocation !== "string" ||
      !submittedTicket.dateLocation.trim() ||
      !["Software", "Hardware"].includes(submittedTicket?.issueType) ||
      typeof submittedTicket?.happened !== "string" ||
      !submittedTicket.happened.trim() ||
      typeof submittedTicket?.expected !== "string" ||
      !submittedTicket.expected.trim()
    ) {
      return NextResponse.json({ ok: false, error: "Complete all required ticket questions." }, { status: 400 });
    }

    const raisedBy = typeof submittedTicket?.raisedBy === "string" && submittedTicket.raisedBy.trim()
      ? submittedTicket.raisedBy.trim()
      : employee.name;
    const mastNumber = typeof submittedTicket?.mastNumber === "string" ? submittedTicket.mastNumber.trim() : "";
    const happened = typeof submittedTicket?.happened === "string" ? submittedTicket.happened.trim() : "";
    const expected = typeof submittedTicket?.expected === "string" ? submittedTicket.expected.trim() : "";
    const formVersion = ["Trolly", "V2.2"].includes(submittedTicket?.formVersion)
      ? submittedTicket.formVersion
      : "";
    const description = typeof submittedTicket?.description === "string" && submittedTicket.description.trim()
      ? submittedTicket.description.trim()
      : [happened ? `What happened:\n${happened}` : "", expected ? `What was expected:\n${expected}` : ""]
          .filter(Boolean)
          .join("\n\n");

    const maxAttachments = 10;
    const maxAttachmentBytes = 25 * 1024 * 1024;
    const totalAttachmentBytes = files.reduce((total, file) => total + file.size, 0);
    if (files.length > maxAttachments) {
      return NextResponse.json({ ok: false, error: "Upload no more than 10 photos or videos per ticket." }, { status: 400 });
    }
    if (totalAttachmentBytes > maxAttachmentBytes) {
      return NextResponse.json({ ok: false, error: "Photos and videos must total 25 MB or less." }, { status: 400 });
    }
    if (files.some((file) =>
      file.size <= 0 ||
      (!file.type.startsWith("image/") && !file.type.startsWith("video/")) ||
      file.type === "image/svg+xml"
    )) {
      return NextResponse.json({ ok: false, error: "Only image and video files can be attached." }, { status: 400 });
    }

    await getDb("trials");
    const db = await getDb("tickets");
    const [{ id, year }] = await db`
      SELECT nextval('support_ticket_number_seq') AS id, TO_CHAR(NOW(), 'YYYY') AS year
    `;
    const ticketId = `TKT-${year}-${String(id).padStart(6, "0")}`;
    const ticketQuery = db`
      INSERT INTO support_tickets (
        id, ticket_id, status, raised_by, employee, employee_code, issue_type,
        date_location, mast_number, description, trial_id, form_version
      )
      VALUES (
        ${id}, ${ticketId}, 'Open', ${raisedBy}, ${employee.name}, ${employee.code},
        ${submittedTicket.issueType}, ${submittedTicket.dateLocation.trim()},
        ${mastNumber}, ${description},
        ${typeof submittedTicket.trialId === "string" ? submittedTicket.trialId.slice(0, 200) : ""},
        ${formVersion}
      )
      RETURNING ticket_id, status, raised_by, employee, employee_code, issue_type,
                date_location, mast_number, description, trial_id, form_version, resolved_by,
                resolved_at, created_at, updated_at
    `;
    const preparedFiles = await Promise.all(files.map(async (file) => ({
      file,
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    })));
    const attachmentQueries = preparedFiles.map(({ file, base64 }) => db`
        INSERT INTO support_ticket_attachments (
          ticket_id, filename, content_type, content_base64, size_bytes
        )
        VALUES (
          ${ticketId},
          ${String(file.name || "attachment").slice(0, 255)},
          ${file.type},
          ${base64},
          ${file.size}
        )
        RETURNING id, filename, content_type AS "contentType", size_bytes AS "sizeBytes"
    `);
    const transactionResults = await db.transaction([ticketQuery, ...attachmentQueries]);
    const ticket = mapSupportTicket(transactionResults[0][0]);
    if (ticket.trialId) {
      const trialRows = await db`
        SELECT custom_trial_id FROM trials WHERE trial_id = ${ticket.trialId}
      `;
      ticket.customTrialId = trialRows[0]?.custom_trial_id || "";
    }
    const attachments = transactionResults.slice(1).map((result) => result[0]);
    ticket.attachments = attachments;
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
