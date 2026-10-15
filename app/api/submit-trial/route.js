import { NextResponse } from "next/server";
import { generateTrialPdf } from "../../../lib/generateTrialPdf";
import { SECTIONS } from "../../../lib/checklistData";
import { sendTrialPdfEmail } from "../../../lib/mailer";
import { serializeAnswer } from "../../../lib/serializeAnswer";
import { getSessionEmployee } from "../../../lib/session";

// Uses Node APIs (pdfkit, nodemailer) — must run on the Node runtime, not Edge.
export const runtime = "nodejs";

function formatTrialSummary(payload, employee, label) {
  const lines = [
    `Trial Report: ${label}`,
    `Version: ${payload.version || "-"}`,
    `System Trial ID: ${payload.trialId}`,
    `Submitted At: ${payload.submittedAt || "-"}`,
    `Submitted By: ${employee.name} (${employee.code})`,
    `Completion: ${payload.answeredCount ?? "-"} / ${payload.totalQuestions ?? "-"} (${payload.completionPct ?? "-"}%)`,
    "",
  ];

  for (const section of SECTIONS) {
    lines.push(section.title, "");
    for (const question of section.questions) {
      lines.push(
        `Q${question.num}. ${question.text || ""}`,
        serializeAnswer(question, payload.answers?.[question.num]) || "—",
        "",
      );
    }
  }
  return lines.join("\n").trim();
}

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

  const result = await sendTrialPdfEmail({
    pdfBuffer,
    filename,
    subject: `Trial Submitted: ${label}`,
    text: formatTrialSummary(payload, employee, label),
    recipients: (process.env.SOFTWARE_LEAD_EMAIL || "").split(",").filter(Boolean),
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

  return NextResponse.json({
    ok: true,
    to: result.to,
    provider: result.provider,
    messageId: result.messageId,
    fallbackNotice: result.fallbackNotice,
  });
}
