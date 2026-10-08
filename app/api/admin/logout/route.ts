import {
  ADMIN_COOKIE,
  clearAdminCookie,
  getCookie,
  getDatabase,
  hashToken,
} from "@/lib/kult-server";

export async function POST(request: Request) {
  const token = getCookie(request, ADMIN_COOKIE);
  if (token) {
    const tokenHash = await hashToken(token);
    const sql = await getDatabase();
    await sql`DELETE FROM admin_sessions WHERE token_hash = ${tokenHash}`;
  }
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": clearAdminCookie(), "Cache-Control": "no-store" } },
  );
}
