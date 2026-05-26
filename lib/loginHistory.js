"use client";

const STORAGE_KEY = "rm:loginHistory:v1";
const SESSION_KEY = "rm:loginRecorded:v1";
const NAMES_KEY = "rm:userNames:v1";
const MAX_EVENTS = 50;

function safeParseJson(raw, fallback) {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deriveNameFromEmail(email) {
  if (typeof email !== "string") return "";
  const trimmed = email.trim();
  if (!trimmed) return "";
  const local = trimmed.split("@")[0] || "";
  const cleaned = local
    .replace(/[._-]+/g, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeDisplayName(name) {
  if (typeof name !== "string") return "";
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  // Title-case, but keep digits/symbols as-is.
  return cleaned.replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_, first, rest) => `${first.toUpperCase()}${String(rest).toLowerCase()}`);
}

function readKnownNames() {
  if (typeof window === "undefined") return {};
  const obj = safeParseJson(window.localStorage.getItem(NAMES_KEY), {});
  return obj && typeof obj === "object" ? obj : {};
}

function writeKnownNames(next) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAMES_KEY, JSON.stringify(next));
}

export function setKnownUserName({ uid, email, name }) {
  if (typeof window === "undefined") return;
  const safeName = normalizeDisplayName(name);
  if (!safeName) return;
  const next = readKnownNames();
  if (uid && typeof uid === "string") next[`uid:${uid}`] = safeName;
  if (email && typeof email === "string") next[`email:${email.trim().toLowerCase()}`] = safeName;
  writeKnownNames(next);
}

function getKnownUserName(uid, email) {
  const known = readKnownNames();
  if (uid && typeof uid === "string" && typeof known[`uid:${uid}`] === "string") return known[`uid:${uid}`];
  if (email && typeof email === "string") {
    const key = `email:${email.trim().toLowerCase()}`;
    if (typeof known[key] === "string") return known[key];
  }
  return "";
}

function safeUserName(user) {
  if (!user) return "Unknown";
  const known = getKnownUserName(user.uid || "", user.email || "");
  if (known) return known;
  const name = (user.displayName || "").trim();
  if (name) return name;
  const email = (user.email || "").trim();
  if (email) return deriveNameFromEmail(email) || email;
  return (user.uid || "Unknown").slice(0, 12);
}

export function listLoginEvents() {
  if (typeof window === "undefined") return [];
  const arr = safeParseJson(window.localStorage.getItem(STORAGE_KEY), []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((e) => e && typeof e === "object")
    .map((e) => ({
      uid: typeof e.uid === "string" ? e.uid : "",
      email: typeof e.email === "string" ? e.email : "",
      name: (() => {
        const rawName = typeof e.name === "string" ? e.name.trim() : "";
        const rawEmail = typeof e.email === "string" ? e.email.trim() : "";
        const known = getKnownUserName(e.uid, rawEmail);
        if (known) return known;
        if (rawName && rawName !== rawEmail) return rawName;
        return deriveNameFromEmail(rawEmail) || rawName;
      })(),
      at: typeof e.at === "string" ? e.at : "",
    }))
    .filter((e) => e.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export function recordLoginEvent(user) {
  if (typeof window === "undefined") return;
  if (!user) return;

  // Avoid duplicating events for the same tab session.
  if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
  window.sessionStorage.setItem(SESSION_KEY, "1");

  setKnownUserName({ uid: user.uid || "", email: user.email || "", name: (user.displayName || "").trim() });

  const nextEvent = {
    uid: user.uid || "",
    email: user.email || "",
    name: safeUserName(user),
    at: new Date().toISOString(),
  };

  const existing = listLoginEvents();
  const deduped = [nextEvent, ...existing].filter(Boolean).slice(0, MAX_EVENTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  window.dispatchEvent(new Event("rm:loginHistoryUpdated"));
}

export function clearLoginEvents() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(NAMES_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event("rm:loginHistoryUpdated"));
}

export function clearLoginSessionFlag() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SESSION_KEY);
}
