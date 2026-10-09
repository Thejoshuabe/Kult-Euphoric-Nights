import { getDatabase, normalizeName, normalizePhone, storageError } from "@/lib/kult-server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { fullName?: string; phone?: string };
    const fullName = payload.fullName?.trim() ?? "";
    const normalizedPhone = normalizePhone(payload.phone ?? "");
    const normalizedName = normalizeName(fullName);

    if (normalizedName.length < 2) {
      return Response.json({ error: "Enter the registered full name." }, { status: 400 });
    }
    if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
      return Response.json({ error: "Enter the registered phone number." }, { status: 400 });
    }

    const sql = await getDatabase();
    const registrations = await sql`
      SELECT id, full_name, verified
      FROM registrations
      WHERE normalized_phone = ${normalizedPhone}
        AND LOWER(REGEXP_REPLACE(TRIM(full_name), '\\s+', ' ', 'g')) = ${normalizedName}
      LIMIT 1
    `;
    if (!registrations[0]) {
      return Response.json({ found: false }, { status: 404 });
    }

    const registration = registrations[0];
    const verified = Boolean(registration.verified);
    const tickets = verified
      ? await sql`
          SELECT id, holder_name, ticket_number, enabled, arrived
          FROM tickets
          WHERE registration_id = ${String(registration.id)}
          ORDER BY ticket_number
        `
      : [];

    return Response.json({
      found: true,
      verified,
      registrationName: String(registration.full_name),
      tickets: tickets.map((ticket) => ({
        id: String(ticket.id),
        holderName: String(ticket.holder_name),
        ticketNumber: Number(ticket.ticket_number),
        enabled: Boolean(ticket.enabled),
        arrived: Boolean(ticket.arrived),
      })),
    });
  } catch (error) {
    return storageError(error);
  }
}
