"use client";

import { useRef, useSyncExternalStore } from "react";

function safeParse(raw, fallback) {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const cache = new Map();

/**
 * Reads a JSON value from localStorage without causing hydration mismatches.
 * - Server snapshot always returns `defaultValue`.
 * - Client snapshot reads localStorage, then updates after hydration.
 */
export function useLocalStorageJson(key, defaultValue) {
  const defaultRef = useRef(defaultValue);

  const subscribe = (cb) => {
    if (typeof window === "undefined") return () => {};
    const onStorage = (e) => {
      if (!e || e.key !== key) return;
      cb();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  };

  const getSnapshot = () => {
    if (typeof window === "undefined") return defaultRef.current;
    const raw = window.localStorage.getItem(key);

    const cached = cache.get(key);
    if (cached && cached.raw === raw) return cached.value;

    const parsed = safeParse(raw, defaultRef.current);
    cache.set(key, { raw, value: parsed });
    return parsed;
  };

  const getServerSnapshot = () => defaultRef.current;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
