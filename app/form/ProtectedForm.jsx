"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FormClient from "./FormClient";
import { useAuth } from "../components/AuthProvider";

export default function ProtectedForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) return;

    const current = searchParams?.toString();
    const next = `/form${current ? `?${current}` : ""}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, user, router, searchParams]);



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

  if (!user) return null;
  return <FormClient />;
}
