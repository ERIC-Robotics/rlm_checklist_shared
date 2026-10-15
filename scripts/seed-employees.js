const { loadEnvConfig } = require("@next/env");
const { neon } = require("@neondatabase/serverless");

loadEnvConfig(process.cwd());

const employees = [
  ["16056", "Azhar", "Jr. Engineer"],
  ["2401", "Pratik", "Executive"],
  ["2351", "Kunal", "Team Lead Software"],
  ["2407", "Parmeet", "Team Lead ML"],
  ["2440", "Vasundara", "Associate Program Manager"],
  ["2415", "Shubham", "Executive"],
  ["2491", "Gyanendra Singh", "Testing Engineer"],
  ["2482", "Tushar Sharma", "Intern"],
  ["2477", "Kapil Prajapati", "Intern"],
  ["2479", "Prashant Kumar", "Robot Mechanical Technician"],
  ["2427", "Abhishek Singh", "Executive"],
  ["1521", "Rohit", "Founder"],
  ["1522", "Chirag", "Founder"],
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
      designation TEXT NOT NULL DEFAULT '',
      aadhaar_ciphertext TEXT,
      is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS aadhaar_ciphertext TEXT`;
  for (const [code, name, designation] of employees) {
    await sql`
      INSERT INTO employees (employee_code, name, designation)
      VALUES (${code}, ${name}, ${designation})
      ON CONFLICT (employee_code) DO UPDATE
      SET name = EXCLUDED.name, designation = EXCLUDED.designation
    `;
  }

  console.log(`Seeded ${employees.length} sample employees into the configured PostgreSQL database.`);
}

seedEmployees().catch((error) => {
  console.error("Failed to seed employees:", error);
  process.exitCode = 1;
});
