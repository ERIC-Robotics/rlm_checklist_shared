import { NextResponse } from "next/server";
import { getSessionEmployee } from "../../../lib/session";
import { sendTrialPdfEmail } from "../../../lib/mailer";

export const runtime = "nodejs";

function fmt(v) {
  if (!v) return "—";
  if (typeof v === "string") return v.trim() || "—";
  if (typeof v === "object") {
    if (v.from || v.to) return [v.from, v.to].filter(Boolean).join(" to ");
    if (v.start || v.end) return [v.start, v.end].filter(Boolean).join(" – ");
    if (v.choice) return v.otherText ? `${v.choice} — ${v.otherText}` : v.choice;
    if (v.selected) {
      const items = Object.entries(v.selected).filter(([, c]) => c).map(([k]) => k);
      if (v.otherText) items.push(v.otherText);
      return items.join(", ") || "—";
    }
  }
  return "—";
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function teamNames(roster) {
  if (!roster || typeof roster !== "object") return "—";
  const names = [];
  if (Array.isArray(roster.selectedEmployees)) roster.selectedEmployees.forEach((m) => m.name && names.push(m.name));
  if (Array.isArray(roster.externalMembers)) roster.externalMembers.forEach((m) => m.name && names.push(m.name));
  if (roster.legacyNames) names.push(roster.legacyNames);
  return names.join(", ") || "—";
}

function formatTrialSummary(payload, employee, label) {
  const a = payload.answers || {};
  const location = fmt(a[2]);
  const blockDate = fmtDate(a[1]);
  const reachingTime = fmt(a[9]);
  const assemblyStart = fmt(a[13]);
  const assemblyEnd = fmt(a[14]);
  const robotPowerOn = fmt(a[16]);
  const ptwNumber = fmt(a[10]);
  const movementStart = fmt(a[18]);
  const trackCleared = fmt(a[23]);
  const remarks = typeof a[40] === "string" ? a[40].trim() : "";
  const postApprover = fmt(a[41]);
  const team = teamNames(a[5]);

  const narrative = [
    `The test track trial was conducted at ${location}.`,
    reachingTime !== "—" ? `The team reached the station at ${reachingTime}.` : "",
    assemblyStart !== "—" && assemblyEnd !== "—" ? `Robot assembly started at ${assemblyStart} and was completed by ${assemblyEnd}.` : "",
    robotPowerOn !== "—" ? `The robot was powered on at ${robotPowerOn}.` : "",
    ptwNumber !== "—" ? `The Permit to Work (PTW) was opened. PTW No: ${ptwNumber}.` : "",
    movementStart !== "—" ? `Actual testing commenced at ${movementStart}.` : "",
    trackCleared !== "—" ? `The track was cleared at ${trackCleared}.` : "",
  ].filter(Boolean).join(" ");

  const lines = [
    `Test Track Trial – Summary`,
    ``,
    `Location: ${location}`,
    `Date: ${blockDate}`,
    `Trial ID: ${label}`,
    `Submitted By: ${employee.name} (${employee.code})`,
    team !== "—" ? `Team Members: ${team}` : "",
    ``,
    narrative,
  ].filter((l) => l !== "");

  if (remarks) lines.push(``, `Key Observations / Remarks: ${remarks}`);
  if (postApprover !== "—") lines.push(``, `Post-Trial Approved By: ${postApprover}`);

  return lines.join("\n").trim();
}

export async function POST(request) {
  let employee;
  try {
    employee = await getSessionEmployee(request);
  } catch (error) {
    console.error("Session error:", error);
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

  if (!payload?.trialId) {
    return NextResponse.json({ ok: false, error: "Missing trial data" }, { status: 400 });
  }

  const to = (process.env.TRIAL_REPORT_EMAIL || "").trim();
  if (!to) {
    console.error("TRIAL_REPORT_EMAIL is not set");
    return NextResponse.json({ ok: false, error: "TRIAL_REPORT_EMAIL is not configured." }, { status: 500 });
  }

  const label = payload.customTrialId || payload.trialId;
  const summaryText = formatTrialSummary(payload, employee, label);

  const result = await sendTrialPdfEmail({
    pdfBuffer: null,
    filename: "",
    subject: `Trial Submitted: ${label}`,
    text: summaryText,
    recipients: [to],
  });

  if (!result.ok) {
    console.error("Trial email failed:", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  console.log("Trial email sent via", result.provider, "to:", to);
  return NextResponse.json({ ok: true, to, provider: result.provider });
}
