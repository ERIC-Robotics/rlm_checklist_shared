"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { assertFirebaseConfigured, auth, googleProvider } from "../../lib/firebaseClient";
import { useAuth } from "../components/AuthProvider";
import { useLocalStorageJson } from "../../lib/useLocalStorageJson";
import { setKnownUserName } from "../../lib/loginHistory";

const EMPTY_EMAILS = [];

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const savedEmailsRaw = useLocalStorageJson("rm:savedEmails", EMPTY_EMAILS);
  const savedEmails = Array.isArray(savedEmailsRaw) ? savedEmailsRaw : [];

  const next = useMemo(() => {
    const n = searchParams?.get("next");
    return typeof n === "string" && n.startsWith("/") ? n : "/select";
  }, [searchParams]);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function signIn() {
    setError("");
    setSubmitting(true);
    try {
      assertFirebaseConfigured();
      const cred = await signInWithPopup(auth, googleProvider);
      setKnownUserName({
        uid: cred?.user?.uid || "",
        email: cred?.user?.email || "",
        name: (cred?.user?.displayName || "").trim(),
      });
      router.replace(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function signInManual(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Name, email, and password are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      assertFirebaseConfigured();
      let userCred;
      try {
        // Attempt to sign in first
        userCred = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      } catch (signInErr) {
        // If credentials are invalid, they might be a new user (Firebase uses invalid-credential for missing users too)
        if (signInErr.code === 'auth/invalid-credential') {
          try {
            // Attempt to create a new account
            userCred = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
          } catch (createErr) {
            if (createErr.code === 'auth/email-already-in-use') {
              // If the email exists, then the original invalid-credential was truly a bad password
              throw new Error("Incorrect password for this email.");
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }
      
      // Update the user's profile with their name
      if (userCred.user && name.trim()) {
        await updateProfile(userCred.user, { displayName: name.trim() });
      }

      setKnownUserName({
        uid: userCred?.user?.uid || "",
        email: userCred?.user?.email || email.trim(),
        name: name.trim(),
      });
      
      const newEmails = Array.from(new Set([email.trim(), ...savedEmails])).slice(0, 10);
      window.localStorage.setItem("rm:savedEmails", JSON.stringify(newEmails));
      
      router.replace(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else {
        setError(msg);
      }
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
            Sign in to continue. Your trial data remains stored locally on this device.
          </p>

            <div className="landing-authbox" role="region" aria-label="Login">
              <button className="auth-btn auth-btn-google" type="button" onClick={signIn} disabled={submitting}>
                <span className="auth-btn-icon" aria-hidden="true">
                  <GoogleG />
                </span>
                <span className="auth-btn-text">{submitting ? "Signing in…" : "Continue with Google"}</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: '#6b7280', fontSize: '14px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }}></div>
                <div style={{ padding: '0 10px' }}>OR</div>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }}></div>
              </div>

              <form onSubmit={signInManual} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Your Name"
                  className="q-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <datalist id="saved-emails">
                  {savedEmails.map((e) => <option key={e} value={e} />)}
                </datalist>
                <input
                  type="email"
                  placeholder="Email ID"
                  className="q-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  list="saved-emails"
                  disabled={submitting}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <input
                  type="password"
                  placeholder="Password"
                  className="q-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
                <button 
                  className="auth-btn" 
                  type="submit" 
                  disabled={submitting}
                  style={{ backgroundColor: '#f4c430', color: '#2a2002', border: 'none', justifyContent: 'center' }}
                >
                  <span className="auth-btn-text">{submitting ? "Signing in…" : "Sign In"}</span>
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

function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.72 1.22 9.23 3.6l6.9-6.9C35.8 2.42 30.3 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.02 6.23C12.46 13.01 17.77 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.64-.15-3.22-.43-4.75H24v9.01h12.94c-.56 2.98-2.24 5.5-4.77 7.2l7.73 5.98c4.52-4.18 7.08-10.34 7.08-17.44z"
      />
      <path
        fill="#FBBC05"
        d="M10.58 28.45c-.48-1.43-.76-2.96-.76-4.45s.27-3.02.76-4.45l-8.02-6.23C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.68l8.02-6.23z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.3 0 11.6-2.08 15.47-5.67l-7.73-5.98c-2.15 1.45-4.9 2.3-7.74 2.3-6.23 0-11.54-3.51-13.42-8.45l-8.02 6.23C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
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
