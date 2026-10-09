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
        sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS ticket_price INTEGER`,
        sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS total_amount INTEGER`,
        sql`UPDATE registrations SET ticket_price = 599 WHERE ticket_price IS NULL`,
        sql`UPDATE registrations
            SET total_amount = ticket_price * (1 + companion_count)
            WHERE total_amount IS NULL`,
        sql`ALTER TABLE registrations ALTER COLUMN ticket_price SET DEFAULT 599`,
        sql`ALTER TABLE registrations ALTER COLUMN ticket_price SET NOT NULL`,
        sql`ALTER TABLE registrations ALTER COLUMN total_amount SET DEFAULT 599`,
        sql`ALTER TABLE registrations ALTER COLUMN total_amount SET NOT NULL`,
        sql`CREATE TABLE IF NOT EXISTS companions (
          id TEXT PRIMARY KEY,
          registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
          full_name TEXT NOT NULL,
          phone TEXT
        )`,
        sql`CREATE INDEX IF NOT EXISTS idx_companions_registration_id ON companions(registration_id)`,
        sql`CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
          holder_name TEXT NOT NULL,
          ticket_number SMALLINT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          arrived BOOLEAN NOT NULL DEFAULT FALSE,
          arrived_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (registration_id, ticket_number)
        )`,
        sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS organizer_note TEXT NOT NULL DEFAULT ''`,
        sql`CREATE INDEX IF NOT EXISTS idx_tickets_registration_id ON tickets(registration_id)`,
        sql`INSERT INTO tickets (id, registration_id, holder_name, ticket_number)
            SELECT 'legacy-' || md5('registrant:' || registrations.id), registrations.id, registrations.full_name, 1
            FROM registrations
            ON CONFLICT (registration_id, ticket_number) DO NOTHING`,
        sql`INSERT INTO tickets (id, registration_id, holder_name, ticket_number)
            SELECT
              'legacy-' || md5('companion:' || ranked.id),
              ranked.registration_id,
              ranked.full_name,
              ranked.ticket_number
            FROM (
              SELECT
                companions.id,
                companions.registration_id,
                companions.full_name,
                (ROW_NUMBER() OVER (PARTITION BY companions.registration_id ORDER BY companions.id) + 1)::smallint AS ticket_number
              FROM companions
            ) AS ranked
            ON CONFLICT (registration_id, ticket_number) DO NOTHING`,
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
          ticket_price INTEGER NOT NULL DEFAULT 599,
          capacity_limit INTEGER NOT NULL DEFAULT 35,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        sql`ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS ticket_price INTEGER NOT NULL DEFAULT 599`,
        sql`ALTER TABLE event_settings ADD COLUMN IF NOT EXISTS capacity_limit INTEGER NOT NULL DEFAULT 35`,
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
