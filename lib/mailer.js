import nodemailer from "nodemailer";
import { getCloudflareContext } from "@opennextjs/cloudflare";

let graphTokenCache = null;

function readGraphConfig() {
  return {
    tenantId: process.env.MS_GRAPH_TENANT_ID?.trim() || "",
    clientId: process.env.MS_GRAPH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET || "",
    from: process.env.MS_GRAPH_FROM_EMAIL?.trim() ||
      process.env.MAIL_FROM?.trim() ||
      process.env.SMTP_USER?.trim() || "",
  };
}

function graphConfigState(config) {
  const fields = [
    ["MS_GRAPH_TENANT_ID", config.tenantId],
    ["MS_GRAPH_CLIENT_ID", config.clientId],
    ["MS_GRAPH_CLIENT_SECRET", config.clientSecret],
    ["MS_GRAPH_FROM_EMAIL or MAIL_FROM", config.from],
  ];
  const configured = fields.filter(([, value]) => Boolean(value)).length;
  return {
    enabled: configured > 0,
    missing: fields.filter(([, value]) => !value).map(([name]) => name),
  };
}

async function getGraphAccessToken(config) {
  if (graphTokenCache && graphTokenCache.expiresAt > Date.now() + 60_000) {
    return graphTokenCache.token;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    const code = result.error || `HTTP ${response.status}`;
    console.error("Microsoft Graph token request failed:", code);
    throw new Error(
      `Microsoft Graph sign-in failed (${code}). Check the tenant ID, client ID, client secret, and Microsoft admin consent.`,
    );
  }

  graphTokenCache = {
    token: result.access_token,
    expiresAt: Date.now() + Math.max(0, Number(result.expires_in) || 3600) * 1000,
  };
  return graphTokenCache.token;
}

function parseRecipientList(value) {
  return String(value || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
}

async function sendGraphEmail({ config, to, subject, text, attachments = [] }) {
  const accessToken = await getGraphAccessToken(config);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: text },
          toRecipients: parseRecipientList(to),
          ...(attachments.length
            ? {
                attachments: attachments.map((attachment) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: attachment.filename,
                  contentType: attachment.contentType || "application/octet-stream",
                  contentBytes: Buffer.from(attachment.content).toString("base64"),
                })),
              }
            : {}),
        },
        saveToSentItems: true,
      }),
    },
  );

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const code = result.error?.code || `HTTP ${response.status}`;
    console.error("Microsoft Graph sendMail failed:", code);
    if (response.status === 403) {
      throw new Error(
        "Microsoft Graph denied sendMail. Confirm Mail.Send application permission has admin consent and the sender mailbox is allowed.",
      );
    }
    throw new Error(`Microsoft Graph could not send the email (${code}).`);
  }
}

async function sendConfiguredEmail({ to, subject, text, attachments = [], smtpEnv }) {
  // Cloudflare's native Email Service avoids SMTP credentials and Microsoft app IDs.
  // Local development has no EMAIL binding, so it falls through to the configured provider.
  let cloudflareEmailBinding = false;
  let cloudflareEmailError = "";
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (env.EMAIL) {
      cloudflareEmailBinding = true;
      const from = smtpEnv.from || "reports@ericrobotics.com";
      const result = await env.EMAIL.send({
        from,
        to: String(to).split(",").map((address) => address.trim()).filter(Boolean),
        subject,
        text,
        ...(attachments.length
          ? {
              attachments: attachments.map((attachment) => ({
                filename: attachment.filename,
                content: Buffer.from(attachment.content).toString("base64"),
                type: attachment.contentType || "application/octet-stream",
                disposition: "attachment",
              })),
            }
          : {}),
      });
      return {
        ok: true,
        to,
        provider: "cloudflare-email",
        messageId: result.messageId,
      };
    }
  } catch (error) {
    if (cloudflareEmailBinding) {
      cloudflareEmailError = error instanceof Error ? error.message : String(error);
      console.error("Cloudflare Email Service send failed:", cloudflareEmailError);
    }
    // Outside a Cloudflare request context, continue with local/legacy providers.
  }

  const graphConfig = readGraphConfig();
  const graphState = graphConfigState(graphConfig);

  if (graphState.enabled) {
    if (graphState.missing.length) {
      return {
        ok: false,
        error: `Microsoft Graph email setup is incomplete. Configure ${graphState.missing.join(", ")} in the deployment environment.`,
      };
    }
    try {
      await sendGraphEmail({ config: graphConfig, to, subject, text, attachments });
      return {
        ok: true,
        to,
        provider: "microsoft-graph",
        ...(cloudflareEmailError ? { fallbackNotice: cloudflareEmailError } : {}),
      };
    } catch (error) {
      console.error("Microsoft Graph email error:", error);
      return { ok: false, error: error instanceof Error ? error.message : "Microsoft Graph could not send the email." };
    }
  }

  if (!smtpEnv.host || !smtpEnv.user || !smtpEnv.pass) {
    if (cloudflareEmailError) {
      return {
        ok: false,
        error: `Cloudflare Email Service could not send the message: ${cloudflareEmailError}. Configure a verified sender domain or complete SMTP settings as a fallback.`,
      };
    }
    return {
      ok: false,
      error: "Email is not configured. Enable Cloudflare Email Sending and set a sender address, or configure an email provider.",
    };
  }

  try {
    const transporter = getTransporter(smtpEnv);
    const info = await transporter.sendMail({
      from: smtpEnv.from,
      to,
      subject,
      text,
      ...(attachments.length ? { attachments } : {}),
    });
    return {
      ok: true,
      to,
      provider: "smtp",
      messageId: info.messageId,
      ...(cloudflareEmailError ? { fallbackNotice: cloudflareEmailError } : {}),
    };
  } catch (err) {
    console.error("SMTP send error:", err);
    const smtpError = friendlyError(err);
    return {
      ok: false,
      error: cloudflareEmailError
        ? `Cloudflare Email Service failed (${cloudflareEmailError}); SMTP fallback failed: ${smtpError}`
        : smtpError,
    };
  }
}

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
      ? "SOFTWARE_LEAD_EMAIL"
      : "MAIL_TO";
    return {
      ok: false,
      error: `Email recipient is missing. Set ${recipientVariable} in the deployment environment.`,
    };
  }
  return sendConfiguredEmail({
    to,
    subject,
    text,
    smtpEnv: env,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: "application/pdf",
    }],
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
    smtpEnv: env,
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
    smtpEnv: env,
  });
}
