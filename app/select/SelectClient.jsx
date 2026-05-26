"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

const STORAGE_KEY = "rm:selectedVersion";
const OPTIONS = [
  { value: "RailwayMitra V2.2", label: "RailwayMitra V2.2" },
  { value: "RailwayMitra V2.3", label: "RailwayMitra V2.3" },
  { value: "Railway Trolley", label: "Railway Trolley" },
];

function safeNextPath(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/form";
  return raw;
}

function withVersion(nextPath, version) {
  try {
    const url = new URL(nextPath, window.location.origin);
    url.searchParams.set("version", version);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `/form?version=${encodeURIComponent(version)}`;
  }
}

export default function SelectClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [version, setVersion] = useState(() => {
    if (typeof window === "undefined") return OPTIONS[0].value;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && OPTIONS.some((o) => o.value === saved)) return saved;
    return OPTIONS[0].value;
  });

  const next = useMemo(() => safeNextPath(searchParams?.get("next")), [searchParams]);

  useEffect(() => {
    if (loading) return;
    if (user) return;
    router.replace(`/login?next=${encodeURIComponent(`/select?next=${encodeURIComponent(next)}`)}`);
  }, [loading, user, router, next]);

  function continueToForm() {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, version);
    router.replace(withVersion(next, version));
  }

  if (loading || !user) return null;

  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true" />
      <div className="landing-grid">
        <section className="landing-card">
          <div className="landing-badge">Required</div>
          <h1 className="landing-title">Trial SOP Checklist</h1>
          <p className="landing-subtitle">RailwayMitra - POC2</p>
          <p className="landing-desc">Select the RailwayMitra version to continue to the form.</p>

          <div className="landing-authbox" role="region" aria-label="Select Version">
            <label className="select-label">
              Version
              <select className="select-input" value={version} onChange={(e) => setVersion(e.target.value)}>
                {OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="auth-btn auth-btn-continue" type="button" onClick={continueToForm}>
              Continue
            </button>
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
