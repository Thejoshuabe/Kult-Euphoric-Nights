import { getDatabase, requireAdmin, storageError } from "@/lib/kult-server";

function ticketIdFromScan(value: string) {
  const trimmed = value.trim();
  const prefixed = trimmed.match(/^KULT-TICKET:([a-zA-Z0-9-]{16,80})$/);
  if (prefixed) return prefixed[1];
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/^\/ticket\/([a-zA-Z0-9-]{16,80})$/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin(request))) {
      return Response.json({ error: "Organizer access required." }, { status: 401 });
    }
    const payload = (await request.json()) as { scanData?: string };
    const ticketId = ticketIdFromScan(payload.scanData ?? "");
    if (!ticketId) {
      return Response.json({ error: "This is not a valid KULT ticket QR code." }, { status: 400 });
    }

    const sql = await getDatabase();
    const rows = await sql`
      SELECT
        tickets.id,
        tickets.registration_id,
        tickets.holder_name,
        tickets.ticket_number,
        tickets.enabled,
        tickets.arrived,
        registrations.verified,
        registrations.full_name AS registration_name
      FROM tickets
      JOIN registrations ON registrations.id = tickets.registration_id
      WHERE tickets.id = ${ticketId}
      LIMIT 1
    `;
    if (!rows[0]) return Response.json({ error: "Ticket not found." }, { status: 404 });
    const ticket = rows[0];
    if (!Boolean(ticket.verified)) {
      return Response.json({ error: "Payment for this registration has not been verified." }, { status: 409 });
    }
    if (!Boolean(ticket.enabled)) {
      return Response.json({ error: "This ticket has been disabled by an organizer." }, { status: 409 });
    }
    if (Boolean(ticket.arrived)) {
      return Response.json({
        ok: true,
        alreadyArrived: true,
        holderName: String(ticket.holder_name),
        ticketNumber: Number(ticket.ticket_number),
        registrationName: String(ticket.registration_name),
      });
    }

    await sql.transaction([
      sql`UPDATE tickets SET arrived = TRUE, arrived_at = NOW(), updated_at = NOW() WHERE id = ${ticketId}`,
      sql`UPDATE registrations
          SET arrived = NOT EXISTS (
            SELECT 1 FROM tickets
            WHERE registration_id = ${String(ticket.registration_id)} AND enabled = TRUE AND arrived = FALSE AND id <> ${ticketId}
          ), updated_at = NOW()
          WHERE id = ${String(ticket.registration_id)}`,
    ]);
    return Response.json({
      ok: true,
      alreadyArrived: false,
      holderName: String(ticket.holder_name),
      ticketNumber: Number(ticket.ticket_number),
      registrationName: String(ticket.registration_name),
    });
  } catch (error) {
    return storageError(error);
  }
}
