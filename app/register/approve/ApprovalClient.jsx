"use client";

import { useState } from "react";

export default function ApprovalClient({ token }) {
  const [status, setStatus] = useState("ready");
  const [message, setMessage] = useState("");

  async function approveRegistration() {
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/register/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Could not approve the registration.");
      }
      setStatus("approved");
      setMessage(`${result.employeeName}'s account is approved. They can now sign in.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not approve the registration.");
    }
  }

  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true" />
      <section className="landing-card" style={{ margin: "auto" }}>
        <div className="landing-badge">Manager approval</div>
        <h1 className="landing-title">Employee Registration</h1>
        <p className="landing-desc">
          {status === "ready"
            ? "Review this request and approve the employee to allow sign-in."
            : message}
        </p>
        {status === "ready" ? (
          <button
            className="auth-btn"
            type="button"
            onClick={approveRegistration}
            disabled={!token}
            style={{
              marginTop: 20,
              backgroundColor: "#f4c430",
              color: "#2a2002",
              border: "none",
              justifyContent: "center",
            }}
          >
            <span className="auth-btn-text">Approve Registration</span>
          </button>
        ) : null}
        {status === "submitting" ? <p role="status">Approving…</p> : null}
        {status === "error" || !token ? (
          <p className="auth-error" role="alert">
            {message || "This approval link is missing or invalid."}
          </p>
        ) : null}
        {status === "approved" ? (
          <p role="status" style={{ marginTop: 16, color: "#166534" }}>
            Approval complete.
          </p>
        ) : null}
      </section>
    </main>
  );
}
