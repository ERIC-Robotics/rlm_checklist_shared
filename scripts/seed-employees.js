const { loadEnvConfig } = require("@next/env");
const { neon } = require("@neondatabase/serverless");

loadEnvConfig(process.cwd());

const employees = [
  ["16056", "Azhar"],
  ["16055", "Soham"],
  ["2401", "Pratik"],
  ["2351", "Kunal"],
  ["2407", "Parmeet"],
  ["16064", "Ankit"],
  ["2440", "Vasundara"],
  ["2415", "Shubham"],
  ["2491", "Gyanendra Singh"],
  ["2482", "Tushar Sharma"],
  ["2477", "Kapil Prajapati"],
  ["2479", "Prashant Kumar"],
  ["2427", "Abhishek Singh"],
];

async function seedEmployees() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in .env.local or the environment.");
  }

  const sql = neon(process.env.DATABASE_URL);
  await sql`
    CREATE TABLE IF NOT EXISTS employees (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      employee_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  for (const [code, name] of employees) {
    await sql`
      INSERT INTO employees (employee_code, name)
      VALUES (${code}, ${name})
      ON CONFLICT (employee_code) DO NOTHING
    `;
  }

  console.log(`Seeded ${employees.length} sample employees into the configured PostgreSQL database.`);
}

seedEmployees().catch((error) => {
  console.error("Failed to seed employees:", error);
  process.exitCode = 1;
});
