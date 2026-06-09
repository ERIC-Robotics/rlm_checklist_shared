"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "rm:employee:v1";

const AuthContext = createContext({ employee: null, loading: false });

function readEmployee() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.code && parsed.name) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeEmployee(employee) {
  if (typeof window === "undefined") return;
  if (employee) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(employee));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export default function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(() => readEmployee());

  const login = useCallback(async (employeeCode) => {
    const res = await fetch("/api/verify-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeCode }),
    });
    const data = await res.json();
    if (!data.valid) {
      throw new Error(data.error || "Invalid employee code");
    }
    const emp = { code: data.employee.code, name: data.employee.name };
    writeEmployee(emp);
    setEmployee(emp);
  }, []);

  const logout = useCallback(() => {
    writeEmployee(null);
    setEmployee(null);
  }, []);

  const value = useMemo(() => ({ employee, loading: false, login, logout }), [employee, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
