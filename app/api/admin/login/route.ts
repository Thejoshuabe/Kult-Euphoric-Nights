import {
  ORGANIZER_CODE,
  createSessionToken,
  getDatabase,
  hashToken,
  makeAdminCookie,
  storageError,
} from "@/lib/kult-server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { code?: string };
    if (!ORGANIZER_CODE) {
      return Response.json({ error: "Organizer access has not been configured yet." }, { status: 503 });
    }
    const now = Math.floor(Date.now() / 1000);
    const sql = await getDatabase();
    const clientKey = `${request.headers.get("x-forwarded-for") ?? "unknown"}|${request.headers.get("user-agent") ?? "unknown"}`;
    const fingerprint = await hashToken(clientKey);
    const attempts = await sql`
      SELECT attempt_count, window_start FROM admin_login_attempts
      WHERE fingerprint = ${fingerprint} LIMIT 1
    `;
    if (
      attempts[0] &&
      Number(attempts[0].window_start) > now - 15 * 60 &&
      Number(attempts[0].attempt_count) >= 8
    ) {
      return Response.json(
        { error: "Too many attempts. Please wait 15 minutes before trying again." },
        { status: 429 },
      );
    }
    if (payload.code !== ORGANIZER_CODE) {
      await sql`
        INSERT INTO admin_login_attempts (fingerprint, attempt_count, window_start)
        VALUES (${fingerprint}, 1, ${now})
        ON CONFLICT (fingerprint) DO UPDATE SET
          attempt_count = CASE
            WHEN admin_login_attempts.window_start < ${now - 15 * 60} THEN 1
            ELSE admin_login_attempts.attempt_count + 1
          END,
          window_start = CASE
            WHEN admin_login_attempts.window_start < ${now - 15 * 60} THEN ${now}
            ELSE admin_login_attempts.window_start
          END
      `;
      return Response.json({ error: "That organizer code is not correct." }, { status: 401 });
    }
    const token = createSessionToken();
    const tokenHash = await hashToken(token);
    const expiresAt = now + 8 * 60 * 60;
    await sql.transaction([
      sql`DELETE FROM admin_sessions WHERE expires_at <= ${now}`,
      sql`DELETE FROM admin_login_attempts WHERE fingerprint = ${fingerprint}`,
      sql`INSERT INTO admin_sessions (token_hash, expires_at) VALUES (${tokenHash}, ${expiresAt})`,
    ]);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": makeAdminCookie(token), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return storageError(error);
  }
}
