import { getDatabase, storageError } from "@/lib/kult-server";

export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
    if (!/^\d{10}$/.test(code)) {
      return Response.json({ error: "Enter the complete 10-digit registration code." }, { status: 400 });
    }
    const sql = await getDatabase();
    const rows = await sql`
      SELECT verified, arrived FROM registrations WHERE code = ${code} LIMIT 1
    `;
    if (!rows[0]) return Response.json({ found: false }, { status: 404 });
    return Response.json({
      found: true,
      verified: Boolean(rows[0].verified),
      arrived: Boolean(rows[0].arrived),
    });
  } catch (error) {
    return storageError(error);
  }
}
