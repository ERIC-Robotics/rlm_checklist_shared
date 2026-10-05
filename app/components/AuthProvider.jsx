"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "rm:employee:v1";

const AuthContext = createContext({ employee: null, loading: true });

function writeEmployee(employee) {
  if (typeof window === "undefined") return;
  if (employee) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(employee));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export default function AuthProvider({ children }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then(async (response) => {
        if (response.status === 401) return null;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not restore your session.");
        return data.employee || null;
      })
      .then((currentEmployee) => {
        if (!active) return;
        writeEmployee(currentEmployee);
        setEmployee(currentEmployee);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        writeEmployee(null);
        setEmployee(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
    fetch("/api/session", { method: "DELETE" })
      .catch((error) => console.error("Logout request failed:", error))
      .finally(() => {
        writeEmployee(null);
        setEmployee(null);
      });
  }, []);

  const value = useMemo(() => ({ employee, loading, login, logout }), [employee, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
