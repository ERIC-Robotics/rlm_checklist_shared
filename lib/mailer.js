import nodemailer from "nodemailer";
import { getCloudflareContext } from "@opennextjs/cloudflare";

let cachedTransporter = null;

function readEnv() {
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim() || "";
  return {
    host: process.env.SMTP_HOST?.trim() || "",
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465,
    user,
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM?.trim() || user || "reports@ericrobotics.com",
    to: process.env.MAIL_TO || process.env.TEAM_LEAD_EMAILS || "",
  };
}

function getTransporter(config) {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}`;
  if (!cachedTransporter || cachedTransporter.key !== key) {
    cachedTransporter = {
      key,
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      }),
    };
  }
  return cachedTransporter.transporter;
}

async function sendConfiguredEmail({ to, subject, text, attachments = [] }) {
  const config = readEnv();
  let cloudflareError = "";
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env?.EMAIL) {
      try {
        const result = await env.EMAIL.send({
          from: config.from,
          to: String(to).split(",").map((address) => address.trim()).filter(Boolean),
          subject,
          text,
          ...(attachments.length
            ? { attachments: attachments.map((attachment) => ({
                filename: attachment.filename,
                content: Buffer.from(attachment.content).toString("base64"),
                type: attachment.contentType || "application/octet-stream",
                disposition: "attachment",
              })) }
            : {}),
        });
        return { ok: true, to, provider: "cloudflare-email", messageId: result.messageId };
      } catch (error) {
        cloudflareError = error instanceof Error ? error.message : String(error);
        console.error("Cloudflare Email send failed; trying SMTP:", cloudflareError);
      }
    }
  } catch (error) {
    // Local development and non-Worker hosts have no Cloudflare request context.
  }

  if (!config.host || !config.user || !config.pass) {
    return {
      ok: false,
      error: cloudflareError
        ? `Cloudflare Email could not send (${cloudflareError}); SMTP fallback is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.`
        : "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.",
    };
  }
  try {
    const result = await getTransporter(config).sendMail({
      from: config.from,
      to,
      subject,
      text,
      ...(attachments.length ? { attachments } : {}),
    });
    return { ok: true, to, provider: "smtp", messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("SMTP send failed:", message);
    const smtpError = error?.code === "EAUTH"
      ? "SMTP login was rejected. Check SMTP_USER and SMTP_PASS."
      : error?.code === "ETIMEDOUT" || error?.code === "ECONNREFUSED"
        ? "Could not reach the SMTP server. Check SMTP_HOST and SMTP_PORT, and confirm the host allows outbound SMTP."
        : `SMTP could not send the message: ${message}`;
    return { ok: false, error: cloudflareError ? `Cloudflare Email failed (${cloudflareError}); ${smtpError}` : smtpError };
  }
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

export async function sendTrialPdfEmail({
  pdfBuffer,
  filename,
  subject,
  text,
  recipients,
  extraRecipients = [],
}) {
  const env = readEnv();
  const to = Array.isArray(recipients)
    ? cleanEmails(recipients.join(","))
    : cleanEmails([env.to, ...extraRecipients].filter(Boolean).join(","));
  if (!to) {
    const recipientVariable = Array.isArray(recipients)
      ? "TRIAL_REPORT_EMAIL"
      : "MAIL_TO";
    return {
      ok: false,
      error: `Email recipient is missing. Set ${recipientVariable} in the deployment environment.`,
    };
  }
  const attachments = pdfBuffer
    ? [{ filename, content: pdfBuffer, contentType: "application/pdf" }]
    : [];
  return sendConfiguredEmail({
    to,
    subject,
    text,
    attachments,
  });
}

export async function sendTicketEmail({ ticket }) {
  const env = readEnv();
  const recipients = getTicketRecipients(ticket.issueType, env);

  if (!recipients.length) {
    const recipientVariable = String(ticket.issueType || "").toLowerCase() === "hardware"
      ? "HARDWARE_LEAD_EMAIL or MAIL_TO"
      : String(ticket.issueType || "").toLowerCase() === "software"
        ? "SOFTWARE_LEAD_EMAIL or MAIL_TO"
        : "TEAM_LEAD_EMAILS or MAIL_TO";
    return {
      ok: false,
      error: `Ticket recipients are missing. Set ${recipientVariable} in the deployment environment, then redeploy.`,
    };
  }
  const body = [
    "A support ticket was raised.",
    "",
    `Ticket ID: ${ticket.ticketId || "-"}`,
    `Raised by: ${ticket.raisedBy || ticket.employee || "-"}`,
    `Employee Code: ${ticket.employeeCode || "-"}`,
    ticket.formVersion ? `Form: ${ticket.formVersion}` : "",
    `Issue Type: ${ticket.issueType || "-"}`,
    `Date and location of issue: ${ticket.dateLocation || ticket.when || "-"}`,
    ticket.mastNumber || ticket.module ? `Mast number: ${ticket.mastNumber || ticket.module}` : "",
    ticket.description ? `Description: ${ticket.description}` : "",
    `Trial ID: ${ticket.customTrialId || ticket.trialId || "-"}`,
  ].filter(Boolean).join("\n");
  return sendConfiguredEmail({
    to: recipients,
    subject: `New ${ticket.issueType || ""} Support Ticket: ${ticket.ticketId || "Ticket"}`.replace(/\s+/g, " "),
    text: body,
  });
}

export async function sendEmployeeRegistrationEmail({ employeeCode, name, approvalUrl }) {
  const env = readEnv();
  const recipient = "reports@ericrobotics.com";

  return sendConfiguredEmail({
    to: recipient,
    subject: "New employee self-registration",
    text: [
      "An employee requested access to the Trial SOP Checklist.",
      "",
      `Employee name: ${name}`,
      `Employee code: ${employeeCode}`,
      "",
      "Approve this employee's access using this one-time link (valid for 7 days):",
      approvalUrl,
      "",
      "The employee cannot sign in until you approve the request.",
    ].join("\n"),
  });
}
