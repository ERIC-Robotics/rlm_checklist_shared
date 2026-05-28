"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

export default function HistoryClient() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [trials] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem("rm:trials");
      if (!stored) return [];
      const trialsObj = JSON.parse(stored);
      return Object.values(trialsObj).sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
      );
    } catch {
      return [];
    }
  });
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/history");
      return;
    }
  }, [loading, user, router]);

  const filteredTrials = trials.filter((t) => {
    const q14_type = t.answers?.["14"] || "";
    const q16_date = t.answers?.["16"] || "";
    const q17_loc = t.answers?.["17"] || "";
    const q21_team = t.answers?.["21"] || "";
    
    const searchString = `${t.trialTitle} ${q14_type} ${q16_date} ${q17_loc} ${q21_team}`.toLowerCase();
    return searchString.includes(search.toLowerCase());
  });

  function formatIso(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  if (loading || !user) return null;

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto", fontFamily: "var(--font-ui), sans-serif", minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '40px' }}>
        <button 
          onClick={() => router.push("/form")}
          style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid var(--border)", background: "white", cursor: "pointer", fontWeight: "bold" }}
        >
          ← Back to Form
        </button>
        <h1 style={{ fontSize: "28px", color: "var(--accent)" }}>Trial History</h1>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <input 
          type="text" 
          placeholder="Search by date, trial type, location, or team member name..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "14px 20px", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "16px", background: "white", boxShadow: "var(--shadow)" }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredTrials.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-sub)", background: "white", borderRadius: "12px", border: "1px solid var(--border)" }}>
            No trials found matching your search.
          </div>
        ) : (
          filteredTrials.map((t) => {
            const loc = t.answers?.["17"] || "Unknown Location";
            const type = t.answers?.["14"] || "Unspecified Type";
            const date = t.answers?.["16"] || formatIso(t.createdAt).split(' ')[0] || "Unknown Date";
            const team = t.answers?.["21"] || "No team members listed";

            return (
              <div key={t.trialId} style={{ background: "white", borderRadius: "16px", border: "1px solid var(--border)", padding: "24px", boxShadow: "var(--shadow)", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "var(--accent)" }}>{t.trialTitle}</div>
                  <div style={{ display: 'flex', gap: '16px', color: "var(--text-sub)", fontSize: "14px", flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong>Date:</strong> {date}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong>Type:</strong> {type}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong>Location:</strong> {loc}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-light)", marginTop: '4px' }}>
                    <strong>Team:</strong> {team}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-light)", marginTop: '8px' }}>
                    Created: {formatIso(t.createdAt)} &nbsp;|&nbsp; Progress: {t.answeredCount} / {t.totalQuestions} ({t.pct}%)
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    onClick={() => router.push(`/form?version=${encodeURIComponent(t.version || 'RailwayMitra V2.3')}&trialId=${t.trialId}`)}
                    style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid var(--accent)", background: "var(--accent)", color: "white", fontWeight: "bold", cursor: "pointer" }}
                  >
                    Open Trial
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
