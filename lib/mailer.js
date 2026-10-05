import nodemailer from "nodemailer";

function readEnv() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const from = process.env.MAIL_FROM || user;
  const to =
    process.env.MAIL_TO ||
    process.env.TEAM_LEAD_EMAILS ||
    "";

  return { host, port, user, pass, secure, from, to };
}

let cachedTransporter = null;

function getTransporter(env) {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: env.user && env.pass ? { user: env.user, pass: env.pass } : undefined,
  });
  return cachedTransporter;
}

// Turns nodemailer/SMTP errors into a message a non-technical user can
// actually act on, instead of a raw "SMTP" stack trace.
function friendlyError(err) {
  const code = err?.code || "";
  const msg = String(err?.message || err || "");

  if (code === "EAUTH" || /invalid login|auth/i.test(msg)) {
    return "Email login was rejected by the mail server. Check SMTP_USER / SMTP_PASS (for Gmail, use an App Password, not your normal password).";
  }
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /connect/i.test(msg)) {
    return "Could not reach the mail server. Check SMTP_HOST and SMTP_PORT, and that the host running this app allows outbound SMTP connections.";
  }
  if (code === "ESOCKET" || /certificate|ssl|tls/i.test(msg)) {
    return "Secure connection to the mail server failed. Try matching SMTP_PORT (465) with SMTP_SECURE=true, or 587 with SMTP_SECURE=false.";
  }
  if (/missing credentials|user|pass/i.test(msg)) {
    return "Email is not configured yet. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in your environment.";
  }
  return `Could not send email: ${msg}`;
}

// Cleans a comma-separated list of emails.
function cleanEmails(value) {
  return String(value || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .join(",");
}

// Decides who receives the ticket based on the issue type.
//   Hardware -> Hardware team lead
//   Software -> Software team lead
//   anything else -> default team lead list
function getTicketRecipients(issueType, env) {
  const type = String(issueType || "").trim().toLowerCase();

  if (type === "hardware") {
    return cleanEmails(process.env.HARDWARE_LEAD_EMAIL || env.to);
  }
  if (type === "software") {
    return cleanEmails(process.env.SOFTWARE_LEAD_EMAIL || env.to);
  }
  return cleanEmails(process.env.TEAM_LEAD_EMAILS || env.to);
}

// Sends the trial PDF by email. Returns { ok: true } or { ok: false, error }.
export async function sendTrialPdfEmail({ pdfBuffer, filename, subject, text }) {
  const env = readEnv();

  if (!env.host || !env.user || !env.pass || !env.to) {
    return {
      ok: false,
      error:
        "Email is not configured on the server. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_TO (see .env.example).",
    };
  }

  try {
    const transporter = getTransporter(env);
    await transporter.sendMail({
      from: env.from,
      to: env.to,
      subject,
      text,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return { ok: true, to: env.to };
  } catch (err) {
    console.error("SMTP send error:", err);
    return { ok: false, error: friendlyError(err) };
  }
}

export async function sendTicketEmail({ ticket }) {
  const env = readEnv();
  const recipients = getTicketRecipients(ticket.issueType, env);

  if (!env.host || !env.user || !env.pass) {
    return { ok: false, error: "Email is not configured on the server." };
  }
  if (!recipients.length) {
    return { ok: false, error: "Ticket recipients are not configured on the server." };
  }
  try {
    const transporter = getTransporter(env);
    const body = [
      "A support ticket was raised.",
      "",
      `Ticket ID: ${ticket.ticketId || "-"}`,
      `Raised by: ${ticket.raisedBy || ticket.employee || "-"}`,
      `Employee Code: ${ticket.employeeCode || "-"}`,
      `Issue Type: ${ticket.issueType || "-"}`,
      `Date and location of issue: ${ticket.dateLocation || ticket.when || "-"}`,
      `Mast number: ${ticket.mastNumber || ticket.module || "-"}`,
      `Description: ${ticket.description || "-"}`,
      `Trial ID: ${ticket.trialId || "-"}`,
    ].join("\n");
    await transporter.sendMail({
      from: env.from,
      to: recipients,
      subject: `New ${ticket.issueType || ""} Support Ticket: ${ticket.ticketId || "Ticket"}`.replace(/\s+/g, " "),
      text: body,
    });
    return { ok: true, to: recipients };
  } catch (err) {
    console.error("Ticket email error:", err);
    return { ok: false, error: friendlyError(err) };
  }
}
