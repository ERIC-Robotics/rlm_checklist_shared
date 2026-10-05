"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { employee, login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");

  const next = useMemo(() => {
    const n = searchParams?.get("next");
    return typeof n === "string" && n.startsWith("/") ? n : "/form";
  }, [searchParams]);

  useEffect(() => {
    if (employee) router.replace(next);
  }, [employee, next, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!employeeCode.trim()) {
      setError("Please enter your employee code.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await login(employeeCode.trim());
      router.replace(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true" />
      <div className="landing-grid">
        <section className="landing-card">
          <div className="landing-badge">Required</div>
          <h1 className="landing-title">Trial SOP Checklist</h1>
          <p className="landing-subtitle">RailwayMitra - POC2</p>
          <p className="landing-desc">
            Enter your employee code to continue. Trials and history are shared with your team.
          </p>

          <div className="landing-authbox" role="region" aria-label="Login">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Employee Code"
                className="q-input"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                disabled={submitting}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box', textTransform: 'uppercase' }}
              />
              <button
                className="auth-btn"
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: '#f4c430', color: '#2a2002', border: 'none', justifyContent: 'center' }}
              >
                <span className="auth-btn-text">{submitting ? "Verifying…" : "Sign In"}</span>
              </button>
            </form>

            {error ? <p className="auth-error" style={{ marginTop: '16px' }}>{error}</p> : null}
          </div>
        </section>

        <section className="landing-collage" aria-label="Checklist preview collage">
          <div className="collage">
            <CollageImage className="i1" src="/Image.jpeg" alt="Rail inspection setup" priority />
            <CollageImage
              className="i2"
              src="/A_yellow_industrial_rail_inspection_202605081307.jpeg"
              alt="Yellow industrial rail inspection"
              priority
            />
            <CollageImage className="i3" src="/IMG_3879.jpeg" alt="Trial photo 1" />
            <CollageImage className="i4" src="/IMG_3880.jpeg" alt="Trial photo 2" />
            <CollageImage className="i5" src="/shared%20image.jpeg" alt="Shared trial image" />
          </div>
        </section>
      </div>
    </main>
  );
}

function CollageImage({ className, src, alt, priority = false }) {
  return (
    <div className={`collage-frame ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="(max-width: 900px) 92vw, 46vw"
        style={{ objectFit: "cover" }}
      />
    </div>
  );
}
