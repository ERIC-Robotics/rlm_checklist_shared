import { neon } from "@neondatabase/serverless";

let sql;
const initializations = new Map();

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add your Neon/PostgreSQL connection string to .env.local.");
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

async function initialize(client, name, statements) {
  if (!initializations.has(name)) {
    const pending = client.transaction(statements).catch((error) => {
      initializations.delete(name);
      throw error;
    });
    initializations.set(name, pending);
  }
  return initializations.get(name);
}

async function initializeAuth(client) {
  await initialize(client, "auth", [
    client`
      CREATE TABLE IF NOT EXISTS employees (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        employee_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        designation TEXT NOT NULL DEFAULT '',
        aadhaar_ciphertext TEXT,
        is_active SMALLINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    client`ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT ''`,
    client`ALTER TABLE employees ADD COLUMN IF NOT EXISTS aadhaar_ciphertext TEXT`,
    client`
      CREATE TABLE IF NOT EXISTS employee_registration_approvals (
        employee_code TEXT PRIMARY KEY REFERENCES employees(employee_code) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `,
  ]);
}

async function initializeTrials(client) {
  await initializeAuth(client);
  await initialize(client, "trials", [
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
    client`ALTER TABLE trials ADD COLUMN IF NOT EXISTS agenda_submitted BOOLEAN NOT NULL DEFAULT FALSE`,
    client`ALTER TABLE trials ADD COLUMN IF NOT EXISTS pre_trial_submitted BOOLEAN NOT NULL DEFAULT FALSE`,
    client`
      CREATE TABLE IF NOT EXISTS deleted_trials (
        trial_id TEXT PRIMARY KEY,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    client`CREATE SEQUENCE IF NOT EXISTS trial_custom_id_serial_seq START WITH 1 INCREMENT BY 1`,
    client`CREATE INDEX IF NOT EXISTS trials_updated_at_idx ON trials (updated_at DESC)`,
  ]);
}

async function initializeTickets(client) {
  await initializeAuth(client);
  await initialize(client, "tickets", [
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
        form_version TEXT NOT NULL DEFAULT '',
        resolved_by TEXT NOT NULL DEFAULT '',
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    client`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
    client`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS form_version TEXT NOT NULL DEFAULT ''`,
    client`
      CREATE TABLE IF NOT EXISTS support_ticket_attachments (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES support_tickets(ticket_id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content_base64 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    client`CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets (created_at DESC)`,
  ]);
}

export async function getDb(scope = "all") {
  const client = getSql();
  if (scope === "auth") {
    await initializeAuth(client);
  } else if (scope === "trials") {
    await initializeTrials(client);
  } else if (scope === "tickets") {
    await initializeTickets(client);
  } else if (scope === "all") {
    await Promise.all([
      initializeAuth(client),
      initializeTrials(client),
      initializeTickets(client),
    ]);
  } else {
    throw new Error(`Unknown database initialization scope: ${scope}`);
  }
  return client;
}
