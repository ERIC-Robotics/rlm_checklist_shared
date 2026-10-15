import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { encryptAadhaar, getAadhaarEncryptionKey } from "../lib/aadhaarCrypto.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function readHiddenAadhaar() {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command in a terminal so the Aadhaar input can stay hidden.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (character) => {
      if (character === "\u0003") {
        finish(new Error("Aadhaar entry cancelled."));
      } else if (character === "\r" || character === "\n") {
        finish();
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else if (/^\d$/.test(character)) {
        value += character;
      }
    };

    stdout.write("Enter the 12-digit Aadhaar (input hidden): ");
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function setEmployeeAadhaar() {
  const employeeCode = process.argv[2]?.trim().toUpperCase();
  if (!employeeCode) {
    throw new Error("Usage: npm run set:employee-aadhaar -- <employee-code>");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in .env.local or the environment.");
  }
  getAadhaarEncryptionKey();

  const sql = neon(process.env.DATABASE_URL);
  await sql`
    CREATE TABLE IF NOT EXISTS employees (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      employee_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      designation TEXT NOT NULL DEFAULT '',
      aadhaar_ciphertext TEXT,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS aadhaar_ciphertext TEXT`;
  const employees = await sql`
    SELECT employee_code
    FROM employees
    WHERE employee_code = ${employeeCode}
  `;
  if (!employees.length) {
    throw new Error(`Employee ${employeeCode} was not found in the configured database.`);
  }

  const aadhaar = await readHiddenAadhaar();
  const encrypted = encryptAadhaar(aadhaar);
  await sql`
    UPDATE employees
    SET aadhaar_ciphertext = ${encrypted}
    WHERE employee_code = ${employeeCode}
  `;
  console.log(`Encrypted Aadhaar saved for employee ${employeeCode}.`);
}

setEmployeeAadhaar().catch((error) => {
  console.error("Failed to save Aadhaar:", error);
  process.exitCode = 1;
});
