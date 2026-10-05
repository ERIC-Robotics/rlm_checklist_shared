"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

const LEGACY_STORAGE_KEY = "rlm_demo_support_tickets_v1";

export default function TicketsClient() {
  const router = useRouter();
  const { employee, loading } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState("");
  const [search, setSearch] = useState("");
  const [resolverDrafts, setResolverDrafts] = useState({});
  const [mailState, setMailState] = useState({});

  useEffect(() => {
    if (loading) return;
    if (!employee) {
      router.replace("/login?next=/tickets");
      return;
    }
  }, [loading, employee, router]);

  useEffect(() => {
    if (loading || !employee) return;

    async function refresh() {
      let migrationError = "";
      try {
        const stored = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (stored) {
          const legacyTickets = JSON.parse(stored);
          if (!Array.isArray(legacyTickets)) throw new Error("Saved local tickets are not in a readable format.");
          const migrationResponse = await fetch("/api/tickets/migrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tickets: legacyTickets }),
          });
          const migrationResult = await migrationResponse.json();
          if (!migrationResponse.ok) {
            throw new Error(migrationResult.error || "Could not move saved local tickets to shared storage.");
          }
          window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      } catch (error) {
        migrationError = error instanceof Error
          ? `Some tickets saved on this device could not be moved to shared storage: ${error.message}`
          : "Some tickets saved on this device could not be moved to shared storage.";
      }

      try {
        const response = await fetch("/api/tickets", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load shared tickets.");
        setTickets(result.tickets);
        setTicketsError(migrationError);
      } catch (error) {
        setTicketsError(error instanceof Error ? error.message : "Could not load shared tickets.");
      } finally {
        setTicketsLoading(false);
      }
    }

    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, [loading, employee]);

  const filteredTickets = tickets.filter((t) => {
    const searchString = `${t.ticketId || ""} ${t.description || t.title || ""} ${t.issueType || ""} ${t.mastNumber || t.module || ""} ${t.dateLocation || t.when || ""} ${t.employee || ""} ${t.raisedBy || ""}`.toLowerCase();
    return searchString.includes(search.toLowerCase());
  });

  function formatIso(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  }

  async function updateStatus(ticketId, status, resolvedBy = "") {
    setTicketsError("");
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolvedBy }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update the ticket.");
      setTickets((current) => current.map((ticket) =>
        ticket.ticketId === ticketId ? result.ticket : ticket
      ));
    } catch (error) {
      setTicketsError(error instanceof Error ? error.message : "Could not update the ticket.");
    }
  }

  async function deleteTicket(ticketId, title) {
    if (!window.confirm(`Delete ticket "${title || ticketId}"?\n\nThis cannot be undone.`)) return;
    setTicketsError("");
    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the ticket.");
      setTickets((current) => current.filter((ticket) => ticket.ticketId !== ticketId));
    } catch (error) {
      setTicketsError(error instanceof Error ? error.message : "Could not delete the ticket.");
    }
  }

  async function emailTeamLead(t) {
    setMailState((prev) => ({ ...prev, [t.ticketId]: { busy: true } }));
    try {
      const res = await fetch("/api/tickets/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: t.ticketId }),
      });
      const data = await res.json().catch(() => ({}));
      setMailState((prev) => ({
        ...prev,
        [t.ticketId]: data.ok
          ? { ok: true, text: `Emailed to ${data.to}` }
          : { ok: false, text: data.error || "Email could not be sent." },
      }));
    } catch {
      setMailState((prev) => ({ ...prev, [t.ticketId]: { ok: false, text: "Could not reach the server." } }));
    }
  }

  function resolveTicket(ticketId, defaultName = "") {
    const name = (resolverDrafts[ticketId] ?? defaultName ?? "").trim();
    updateStatus(ticketId, "Resolved", name || defaultName || employee?.name || "Team member");
  }

  function statusColor(status) {
    if (status === "Resolved") return { bg: "#e6f7ee", fg: "#0a7a42" };
    return { bg: "#fdecec", fg: "#b3261e" }; // Open / default
  }

  if (loading || !employee) return null;

  const summary = {
    total: tickets.length,
    open: tickets.filter((t) => (t.status || "Open") === "Open").length,
    resolved: tickets.filter((t) => t.status === "Resolved").length,
  };

  return (
    <div className="tickets-shell">
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
        <button
          onClick={() => router.push("/form")}
          style={{
            padding: "10px 16px",
            borderRadius: "12px",
            border: "1px solid rgba(15, 23, 42, 0.12)",
            background: "rgba(255,255,255,0.82)",
            cursor: "pointer",
            fontWeight: 800,
            color: "#111827",
            boxShadow: "0 8px 16px rgba(15, 23, 42, 0.04)",
          }}
        >
          ← Back to Form
        </button>
        <h1 style={{ fontSize: "clamp(28px, 3vw, 38px)", color: "#111827", margin: 0, letterSpacing: "-0.04em" }}>
          Support Tickets
        </h1>
      </div>

      {ticketsError ? (
        <div role="alert" style={{ marginBottom: "18px", color: "#b3261e", fontWeight: 700 }}>
          {ticketsError}
        </div>
      ) : null}

      <div className="ticket-summary-grid">
        {[
          { label: "Total", value: summary.total, tone: "#e7ebff", text: "#1d4ed8" },
          { label: "Open", value: summary.open, tone: "#fdecec", text: "#b3261e" },
          { label: "Resolved", value: summary.resolved, tone: "#e6f7ee", text: "#0a7a42" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: item.tone,
              border: "1px solid rgba(15, 23, 42, 0.05)",
              borderRadius: "18px",
              padding: "16px 18px",
              boxShadow: "0 10px 20px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: item.text, opacity: 0.8 }}>
              {item.label}
            </div>
            <div style={{ marginTop: "10px", fontSize: "28px", fontWeight: 900, color: "#111827", lineHeight: 1 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginBottom: "22px",
          padding: "16px 18px",
          background: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(15, 23, 42, 0.06)",
          borderRadius: "18px",
          boxShadow: "0 14px 30px rgba(15, 23, 42, 0.04)",
        }}
      >
        <input
          type="text"
          placeholder="Search by ticket ID, description, issue type, or mast number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            borderRadius: "12px",
            background: "linear-gradient(180deg, #ffffff, #fffaf2)",
            padding: "14px 18px",
            fontSize: "15px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {ticketsLoading ? (
          <div style={{ padding: "42px 22px", textAlign: "center", color: "#4b5563" }}>
            Loading shared tickets…
          </div>
        ) : filteredTickets.length === 0 ? (
          <div
            style={{
              padding: "42px 22px",
              textAlign: "center",
              color: "#4b5563",
              background: "rgba(255,255,255,0.82)",
              borderRadius: "18px",
              border: "1px solid rgba(15, 23, 42, 0.06)",
              boxShadow: "0 12px 26px rgba(15, 23, 42, 0.04)",
            }}
          >
            {tickets.length === 0 ? "No shared tickets have been raised yet." : "No tickets found matching your search."}
          </div>
        ) : (
          filteredTickets.map((t) => {
            const colors = statusColor(t.status);
            const mail = mailState[t.ticketId];
            return (
              <div
                key={t.ticketId}
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,250,245,0.96))",
                  borderRadius: "20px",
                  border: "1px solid rgba(15, 23, 42, 0.06)",
                  padding: "22px 20px",
                  boxShadow: "0 18px 38px rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div className="ticket-card-main">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "18px", fontWeight: 900, color: "#111827", letterSpacing: "-0.02em" }}>
                      {t.title || `${t.issueType || "Support"} issue`}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: colors.fg,
                        background: colors.bg,
                        padding: "5px 10px",
                        borderRadius: "999px",
                      }}
                    >
                      {t.status || "Open"}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7280" }}>
                    {t.ticketId}
                  </div>

                  <div style={{ display: "flex", gap: "14px", color: "#374151", fontSize: "14px", flexWrap: "wrap" }}>
                    <span><strong>Type:</strong> {t.issueType || "—"}</span>
                    <span><strong>Mast number:</strong> {t.mastNumber || t.module || "—"}</span>
                    <span><strong>Date/location:</strong> {t.dateLocation || t.when || "—"}</span>
                  </div>

                  <div style={{ fontSize: "15px", color: "#111827", lineHeight: 1.6, maxWidth: "80ch" }}>
                    {t.description || t.title || "—"}
                  </div>

                  <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.7 }}>
                    Raised by {t.raisedBy || t.employee || "Demo User"} · {formatIso(t.createdAt)}
                    {t.trialId ? ` · Trial: ${t.trialId}` : ""}
                  </div>

                  {t.resolvedBy ? (
                    <div style={{ fontSize: "12px", color: "#374151" }}>
                      Resolved by <strong>{t.resolvedBy}</strong> · {formatIso(t.resolvedAt)}
                    </div>
                  ) : null}

                  {mail && !mail.busy ? (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: mail.ok ? "#0a7a42" : "#b3261e" }}>
                      {mail.ok ? "✓ " : "✗ "}{mail.text}
                    </div>
                  ) : null}
                </div>

                <div className="ticket-card-actions">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <label htmlFor={`resolved-by-${t.ticketId}`} style={{ fontSize: "12px", fontWeight: 800, color: "#374151" }}>
                      Resolved by
                    </label>
                    <input
                      id={`resolved-by-${t.ticketId}`}
                      type="text"
                      value={resolverDrafts[t.ticketId] ?? t.resolvedBy ?? ""}
                      onChange={(e) => setResolverDrafts((prev) => ({ ...prev, [t.ticketId]: e.target.value }))}
                      placeholder="Type name"
                      style={{
                        flex: 1,
                        minWidth: "150px",
                        padding: "9px 10px",
                        borderRadius: "10px",
                        border: "1px solid rgba(15, 23, 42, 0.1)",
                        background: "rgba(255,255,255,0.9)",
                        fontSize: "14px",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => updateStatus(t.ticketId, "Open")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(15, 23, 42, 0.1)",
                        background: "#ffffff",
                        cursor: "pointer",
                        fontWeight: 700,
                        color: "#111827",
                      }}
                    >
                      Open
                    </button>
                    <button
                      onClick={() => resolveTicket(t.ticketId, employee?.name || "Team member")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(10, 122, 66, 0.2)",
                        background: "#e6f7ee",
                        color: "#0a7a42",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Mark Resolved
                    </button>
                  </div>

                  {/* NEW: email the team lead + delete */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => emailTeamLead(t)}
                      disabled={mail?.busy}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(29, 78, 216, 0.25)",
                        background: "#e7ebff",
                        color: "#1d4ed8",
                        cursor: mail?.busy ? "default" : "pointer",
                        fontWeight: 800,
                        opacity: mail?.busy ? 0.6 : 1,
                      }}
                    >
                      {mail?.busy ? "Sending…" : "✉ Email team lead"}
                    </button>
                    <button
                      onClick={() => deleteTicket(t.ticketId, t.title)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(179, 38, 30, 0.25)",
                        background: "#fdecec",
                        color: "#b3261e",
                        cursor: "pointer",
                        fontWeight: 800,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}