import { NextResponse } from "next/server";
import { generateTrialPdf } from "../../../lib/generateTrialPdf";
import { sendTrialPdfEmail } from "../../../lib/mailer";
import { getSessionEmployee } from "../../../lib/session";

// Uses Node APIs (pdfkit, nodemailer) — must run on the Node runtime, not Edge.
export const runtime = "nodejs";

export async function POST(request) {
  let employee;
  try {
    employee = await getSessionEmployee(request);
  } catch (error) {
    console.error("Trial submission authentication error:", error);
    return NextResponse.json({ ok: false, error: "Could not verify your session." }, { status: 500 });
  }
  if (!employee) {
    return NextResponse.json({ ok: false, error: "Sign in before submitting a trial." }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !payload.trialId) {
    return NextResponse.json({ ok: false, error: "Missing trial data" }, { status: 400 });
  }

  let pdfBuffer;
  try {
    pdfBuffer = await generateTrialPdf(payload);
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { ok: false, error: "Could not generate the PDF for this trial." },
      { status: 500 },
    );
  }

  const label = payload.customTrialId || payload.trialId;
  const filename = `trial-${label}.pdf`;
  const submittedByLine = `${employee.name} (${employee.code})`;

  const result = await sendTrialPdfEmail({
    pdfBuffer,
    filename,
    subject: `Trial Submitted: ${label}`,
    text: `A trial checklist was submitted.\n\nTrial: ${label}\nSubmitted by: ${submittedByLine}\n\nThe full report is attached as a PDF.`,
  });

  if (!result.ok) {
    // Still return the generated PDF so the client can fall back to a
    // manual download/attach instead of losing the submission entirely.
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        pdfBase64: pdfBuffer.toString("base64"),
        filename,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, to: result.to });
}
