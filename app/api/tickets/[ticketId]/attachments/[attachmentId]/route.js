import { NextResponse } from "next/server";
import { getDb } from "../../../../../../lib/db";
import { getSessionEmployee } from "../../../../../../lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    const employee = await getSessionEmployee(request);
    if (!employee) return NextResponse.json({ error: "Sign in to view ticket attachments." }, { status: 401 });

    const { ticketId, attachmentId } = await params;
    const db = await getDb("tickets");
    const rows = await db`
      SELECT filename, content_type, content_base64
      FROM support_ticket_attachments
      WHERE ticket_id = ${ticketId} AND id = ${attachmentId}
    `;
    if (!rows.length) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

    const attachment = rows[0];
    const filename = String(attachment.filename || "attachment").replace(/[\r\n"]/g, "_");
    return new Response(Buffer.from(attachment.content_base64, "base64"), {
      headers: {
        "Content-Type": attachment.content_type,
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Ticket attachment retrieval error:", error);
    return NextResponse.json({ error: "Could not load this ticket attachment." }, { status: 500 });
  }
}
