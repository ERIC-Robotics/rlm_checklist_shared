import { neon } from "@neondatabase/serverless";

let sql;
let initialization;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add your Neon/PostgreSQL connection string to .env.local.");
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

export async function getDb() {
  const client = getSql();
  if (!initialization) {
    initialization = client.transaction([
      client`
        CREATE TABLE IF NOT EXISTS employees (
          id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          employee_code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          is_active SMALLINT NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      client`
        CREATE TABLE IF NOT EXISTS trials (
          trial_id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT 'Untitled trial',
          state JSONB NOT NULL,
          version TEXT NOT NULL DEFAULT 'Trolly',
          custom_trial_id TEXT NOT NULL DEFAULT '',
          submitted BOOLEAN NOT NULL DEFAULT FALSE,
          owner_code TEXT NOT NULL REFERENCES employees(employee_code),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      client`CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq`,
      client`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id BIGINT PRIMARY KEY,
          ticket_id TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'Open',
          raised_by TEXT NOT NULL,
          employee TEXT NOT NULL,
          employee_code TEXT NOT NULL REFERENCES employees(employee_code),
          issue_type TEXT NOT NULL,
          date_location TEXT NOT NULL,
          mast_number TEXT NOT NULL,
          description TEXT NOT NULL,
          trial_id TEXT NOT NULL DEFAULT '',
          resolved_by TEXT NOT NULL DEFAULT '',
          resolved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `,
      client`
        CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx
        ON support_tickets (created_at DESC)
      `,
      client`
        CREATE INDEX IF NOT EXISTS trials_updated_at_idx
        ON trials (updated_at DESC)
      `,
    ]).then(() => client).catch((error) => {
      initialization = null;
      throw error;
    });
  }
  return initialization;
}
