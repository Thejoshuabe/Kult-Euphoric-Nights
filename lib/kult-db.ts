import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type SqlClient = NeonQueryFunction<false, false>;

let schemaPromise: Promise<void> | null = null;

export function getSql(): SqlClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");
  return neon(connectionString);
}

export async function ensureSchema() {
  if (!schemaPromise) {
    const sql = getSql();
    schemaPromise = sql
      .transaction([
        sql`CREATE TABLE IF NOT EXISTS registrations (
          id TEXT PRIMARY KEY,
          code VARCHAR(10) NOT NULL UNIQUE,
          client_registration_id TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          normalized_phone TEXT NOT NULL UNIQUE,
          normalized_email TEXT NOT NULL UNIQUE,
          companion_count SMALLINT NOT NULL DEFAULT 0,
          payment_confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
          verified BOOLEAN NOT NULL DEFAULT FALSE,
          arrived BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        sql`CREATE TABLE IF NOT EXISTS companions (
          id TEXT PRIMARY KEY,
          registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
          full_name TEXT NOT NULL,
          phone TEXT
        )`,
        sql`CREATE INDEX IF NOT EXISTS idx_companions_registration_id ON companions(registration_id)`,
        sql`CREATE TABLE IF NOT EXISTS admin_sessions (
          token_hash TEXT PRIMARY KEY,
          expires_at BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        sql`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)`,
        sql`CREATE TABLE IF NOT EXISTS admin_login_attempts (
          fingerprint TEXT PRIMARY KEY,
          attempt_count SMALLINT NOT NULL DEFAULT 0,
          window_start BIGINT NOT NULL
        )`,
        sql`CREATE TABLE IF NOT EXISTS event_settings (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          allow_over_capacity BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        sql`INSERT INTO event_settings (id, allow_over_capacity)
            VALUES (1, FALSE)
            ON CONFLICT (id) DO NOTHING`,
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  return schemaPromise;
}
