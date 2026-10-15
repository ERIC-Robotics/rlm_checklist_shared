"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FormClient from "./FormClient";
import { useAuth } from "../components/AuthProvider";

const VERSION_OPTIONS = ["Trolly", "V2.2"];

export default function ProtectedForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { employee, loading } = useAuth();
  const [selected, setSelected] = useState("");
  const [pickError, setPickError] = useState("");

  // Version is already chosen when the URL carries it (after picking here,
  // or when opening a trial from History).
  const chosenVersion = searchParams?.get("version") || "";
  const hasTrialId = Boolean(searchParams?.get("trialId"));
  const versionReady = Boolean(chosenVersion) || hasTrialId;

  useEffect(() => {
    if (loading) return;
    if (employee) return;

    const current = searchParams?.toString();
    const next = `/form${current ? `?${current}` : ""}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, employee, router, searchParams]);

  function handleContinue() {
    if (!selected) {
      setPickError("Please select a version.");
      return;
    }
    if (employee?.code && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(`rm:trial-version:v1:${employee.code}`, selected);
      } catch {}
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("trialId");
    params.set("version", selected);
    router.replace(`/form?${params.toString()}`);
  }

  if (loading) {
    return (
      <main className="landing">
        <div className="landing-bg" aria-hidden="true" />
        <section className="landing-card" aria-busy="true">
          <div className="landing-badge">Loading</div>
          <h1 className="landing-title" style={{ fontSize: 34 }}>
            Checking session…
          </h1>
          <p className="landing-desc">Please wait.</p>
        </section>
      </main>
    );
  }

  if (!employee) return null;

  // Choose the checklist version before opening a new form.
  if (!versionReady) {
    return (
      <main className="landing">
        <div className="landing-bg" aria-hidden="true" />
        <section className="landing-card">
          <div className="landing-badge">Select version</div>
          <h1 className="landing-title" style={{ fontSize: 34 }}>
            RailwayMitra
          </h1>
          <p className="landing-desc">
            {employee.name ? `Welcome, ${employee.name}. ` : ""}Select the version to open the checklist.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            <select
              className="q-input"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setPickError("");
              }}
              aria-label="Select version"
              style={{ width: "100%", boxSizing: "border-box" }}
            >
              <option value="">Select version</option>
              {VERSION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="auth-btn"
              onClick={handleContinue}
              style={{ backgroundColor: "#f4c430", color: "#2a2002", border: "none", justifyContent: "center" }}
            >
              <span className="auth-btn-text">Continue</span>
            </button>
            {pickError ? <p className="auth-error">{pickError}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  // Version chosen -> open the form. The old in-form dropdown is hidden.
  return (
    <>
      <style>{`.railway-nav { display: none !important; }`}</style>
      <FormClient />
    </>
  );
}
