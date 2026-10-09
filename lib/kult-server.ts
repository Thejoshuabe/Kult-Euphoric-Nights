import { ensureSchema, getSql } from "@/lib/kult-db";

export const ORGANIZER_CODE = process.env.ORGANIZER_CODE ?? "";
export const ADMIN_COOKIE = "kult_admin_session";
export const CAPACITY_LIMIT = 35;
export const EARLY_BIRD_LIMIT = 35;
const EIGHT_HOURS = 8 * 60 * 60;

export async function getDatabase() {
  await ensureSchema();
  return getSql();
}

export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return digits;
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function createTenDigitCode() {
  const values = crypto.getRandomValues(new Uint8Array(10));
  return `${(values[0] % 9) + 1}${Array.from(values.slice(1), (n) => n % 10).join("")}`;
}

export async function getRegistrationStatus() {
  const sql = await getDatabase();
  const rows = await sql`
    SELECT
      COALESCE(SUM(1 + companion_count), 0)::int AS participant_count,
      COALESCE((SELECT allow_over_capacity FROM event_settings WHERE id = 1), FALSE) AS allow_over_capacity
    FROM registrations
  `;
  const participantCount = Number(rows[0]?.participant_count ?? 0);
  const allowOverCapacity = Boolean(rows[0]?.allow_over_capacity);
  return {
    participantCount,
    capacityLimit: CAPACITY_LIMIT,
    earlyBirdLimit: EARLY_BIRD_LIMIT,
    earlyBirdSoldOut: participantCount >= EARLY_BIRD_LIMIT,
    capacityReached: participantCount >= CAPACITY_LIMIT,
    allowOverCapacity,
    registrationOpen: participantCount < CAPACITY_LIMIT || allowOverCapacity,
  };
}

export function createSessionToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function secureFlag() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function makeAdminCookie(token: string) {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secureFlag()}; SameSite=Strict; Max-Age=${EIGHT_HOURS}`;
}

export function clearAdminCookie() {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly${secureFlag()}; SameSite=Strict; Max-Age=0`;
}

export async function requireAdmin(request: Request) {
  const token = getCookie(request, ADMIN_COOKIE);
  if (!token) return false;
  const tokenHash = await hashToken(token);
  const sql = await getDatabase();
  const rows = await sql`
    SELECT token_hash FROM admin_sessions
    WHERE token_hash = ${tokenHash} AND expires_at > ${Math.floor(Date.now() / 1000)}
    LIMIT 1
  `;
  return rows.length > 0;
}

export function storageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("KULT storage error", message);
  return Response.json(
    { error: "We could not save that right now. Please keep this page open and try again." },
    { status: 503 },
  );
}
