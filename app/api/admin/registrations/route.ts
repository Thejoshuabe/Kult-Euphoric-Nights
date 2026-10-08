import { getDatabase, requireAdmin, storageError } from "@/lib/kult-server";

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin(request))) {
      return Response.json({ error: "Organizer access required." }, { status: 401 });
    }
    const sql = await getDatabase();
    const [registrations, companions] = await sql.transaction(
      [
        sql`SELECT id, code, full_name, phone, email, companion_count, verified, arrived, created_at
            FROM registrations ORDER BY created_at DESC`,
        sql`SELECT id, registration_id, full_name, phone FROM companions ORDER BY registration_id, full_name`,
      ],
      { readOnly: true },
    );
    return Response.json({ registrations, companions });
  } catch (error) {
    return storageError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!(await requireAdmin(request))) {
      return Response.json({ error: "Organizer access required." }, { status: 401 });
    }
    const payload = (await request.json()) as {
      id?: string;
      field?: "verified" | "arrived";
      value?: boolean;
    };
    if (!payload.id || !["verified", "arrived"].includes(payload.field ?? "") || typeof payload.value !== "boolean") {
      return Response.json({ error: "Invalid update." }, { status: 400 });
    }
    const sql = await getDatabase();
    if (payload.field === "verified") {
      await sql`UPDATE registrations SET verified = ${payload.value}, updated_at = NOW() WHERE id = ${payload.id}`;
    } else {
      await sql`UPDATE registrations SET arrived = ${payload.value}, updated_at = NOW() WHERE id = ${payload.id}`;
    }
    return Response.json({ ok: true });
  } catch (error) {
    return storageError(error);
  }
}
