import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

export const SESSION_COOKIE = "rm_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const EMPLOYEE_CACHE_TTL_MS = 30_000;
const EMPLOYEE_CACHE_MAX_ENTRIES = 500;
const employeeCache = new Map();

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

function sign(value) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createSessionToken(employee) {
  const payload = Buffer.from(
    JSON.stringify({
      code: employee.code,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? cookie.slice(name.length + 1) : "";
}

export async function findActiveEmployee(employeeCode) {
  const code = employeeCode.trim().toUpperCase();
  const cached = employeeCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const db = await getDb();
    const employees = await db`
      SELECT employee_code, name
      FROM employees
      WHERE employee_code = ${code}
        AND is_active = 1
    `;
    const employee = employees[0];
    return employee ? { code: employee.employee_code, name: employee.name } : null;
  })();

  if (employeeCache.size >= EMPLOYEE_CACHE_MAX_ENTRIES) {
    const oldestCode = employeeCache.keys().next().value;
    if (oldestCode) employeeCache.delete(oldestCode);
  }
  employeeCache.set(code, { promise, expiresAt: Date.now() + EMPLOYEE_CACHE_TTL_MS });
  try {
    return await promise;
  } catch (error) {
    if (employeeCache.get(code)?.promise === promise) employeeCache.delete(code);
    throw error;
  }
}

export async function getSessionEmployee(request) {
  const token = readCookie(request, SESSION_COOKIE);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  let expectedSignature;
  try {
    expectedSignature = sign(payload);
  } catch (error) {
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) return null;
    throw error;
  }
  const supplied = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  let session;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !session ||
    typeof session.code !== "string" ||
    typeof session.exp !== "number" ||
    session.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return findActiveEmployee(session.code);
}
