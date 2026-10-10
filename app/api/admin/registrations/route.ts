import {
  createTenDigitCode,
  getDatabase,
  getRegistrationStatus,
  normalizeEmail,
  normalizePhone,
  requireAdmin,
  storageError,
} from "@/lib/kult-server";

export async function GET(request: Request) {
  try {
    if (!(await requireAdmin(request))) {
      return Response.json({ error: "Organizer access required." }, { status: 401 });
    }
    const sql = await getDatabase();
    const [registrations, companions, tickets] = await sql.transaction(
      [
        sql`SELECT id, full_name, age, phone, email, companion_count, ticket_price, total_amount,
                   verified, arrived, created_at
            FROM registrations ORDER BY created_at DESC`,
        sql`SELECT id, registration_id, full_name, age, phone FROM companions ORDER BY registration_id, full_name`,
        sql`SELECT id, registration_id, holder_name, ticket_number, enabled, arrived, organizer_note
            FROM tickets ORDER BY registration_id, ticket_number`,
      ],
      { readOnly: true },
    );
    const status = await getRegistrationStatus();
    return Response.json({ registrations, companions, tickets, status });
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
      setting?: "allowOverCapacity" | "eventConfig";
      ticketPrice?: number;
      capacityLimit?: number;
      ticketId?: string;
      ticketField?: "enabled" | "arrived";
      ticketNote?: string;
    };
    if (payload.setting === "allowOverCapacity" && typeof payload.value === "boolean") {
      const sql = await getDatabase();
      await sql`
        UPDATE event_settings
        SET allow_over_capacity = ${payload.value}, updated_at = NOW()
        WHERE id = 1
      `;
      return Response.json({ ok: true, status: await getRegistrationStatus() });
    }
    if (payload.setting === "eventConfig") {
      const ticketPrice = Number(payload.ticketPrice);
      const capacityLimit = Number(payload.capacityLimit);
      if (!Number.isInteger(ticketPrice) || ticketPrice < 1 || ticketPrice > 1000000) {
        return Response.json({ error: "Ticket price must be a whole number between ₹1 and ₹10,00,000." }, { status: 400 });
      }
      if (!Number.isInteger(capacityLimit) || capacityLimit < 1 || capacityLimit > 10000) {
        return Response.json({ error: "Ticket limit must be a whole number between 1 and 10,000." }, { status: 400 });
      }
      const sql = await getDatabase();
      await sql`
        UPDATE event_settings
        SET ticket_price = ${ticketPrice}, capacity_limit = ${capacityLimit}, updated_at = NOW()
        WHERE id = 1
      `;
      return Response.json({ ok: true, status: await getRegistrationStatus() });
    }
    if (payload.ticketId && typeof payload.ticketNote === "string") {
      const note = payload.ticketNote.trim();
      if (note.length > 500) {
        return Response.json({ error: "Ticket notes can contain up to 500 characters." }, { status: 400 });
      }
      const sql = await getDatabase();
      const updated = await sql`
        UPDATE tickets SET organizer_note = ${note}, updated_at = NOW()
        WHERE id = ${payload.ticketId}
        RETURNING id
      `;
      if (!updated[0]) return Response.json({ error: "Ticket not found." }, { status: 404 });
      return Response.json({ ok: true, note });
    }
    if (payload.ticketId && ["enabled", "arrived"].includes(payload.ticketField ?? "") && typeof payload.value === "boolean") {
      const sql = await getDatabase();
      const updated = payload.ticketField === "enabled"
        ? await sql`UPDATE tickets SET enabled = ${payload.value}, updated_at = NOW() WHERE id = ${payload.ticketId} RETURNING registration_id`
        : await sql`UPDATE tickets SET arrived = ${payload.value}, arrived_at = ${payload.value ? new Date().toISOString() : null}, updated_at = NOW() WHERE id = ${payload.ticketId} RETURNING registration_id`;
      if (!updated[0]) return Response.json({ error: "Ticket not found." }, { status: 404 });
      await sql`
        UPDATE registrations
        SET arrived = NOT EXISTS (
          SELECT 1 FROM tickets
          WHERE registration_id = ${String(updated[0].registration_id)} AND enabled = TRUE AND arrived = FALSE
        ), updated_at = NOW()
        WHERE id = ${String(updated[0].registration_id)}
      `;
      return Response.json({ ok: true });
    }
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

export async function POST(request: Request) {
  try {
    if (!(await requireAdmin(request))) {
      return Response.json({ error: "Organizer access required." }, { status: 401 });
    }
    const payload = (await request.json()) as {
      fullName?: string;
      age?: number | string;
      phone?: string;
      email?: string;
    };
    const fullName = payload.fullName?.trim() ?? "";
    const age = Number(payload.age);
    const phone = payload.phone?.trim() ?? "";
    const email = payload.email?.trim() ?? "";
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);

    if (fullName.length < 2 || fullName.length > 80) {
      return Response.json({ error: "Please enter a valid full name." }, { status: 400 });
    }
    if (!Number.isInteger(age) || age < 1) {
      return Response.json({ error: "Please enter a valid age." }, { status: 400 });
    }
    if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
      return Response.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const sql = await getDatabase();
    const duplicate = await sql`
      SELECT normalized_phone, normalized_email FROM registrations
      WHERE normalized_phone = ${normalizedPhone} OR normalized_email = ${normalizedEmail}
      LIMIT 1
    `;
    if (duplicate[0]) {
      const field = duplicate[0].normalized_phone === normalizedPhone ? "phone" : "email";
      return Response.json({ error: `A registration already exists with this ${field}.` }, { status: 409 });
    }

    const registrationId = crypto.randomUUID();
    const clientRegistrationId = `admin-${crypto.randomUUID()}`;
    const ticketId = crypto.randomUUID();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = createTenDigitCode();
      try {
        const inserted = await sql`
          WITH capacity_lock AS MATERIALIZED (
            SELECT pg_advisory_xact_lock(676735)
          ),
          settings AS MATERIALIZED (
            SELECT allow_over_capacity, capacity_limit, ticket_price
            FROM event_settings, capacity_lock
            WHERE id = 1
          ),
          attendance AS MATERIALIZED (
            SELECT COALESCE(SUM(1 + companion_count), 0)::int AS participant_count
            FROM registrations, capacity_lock
          ),
          inserted_registration AS (
            INSERT INTO registrations (
              id, code, client_registration_id, full_name, phone, email,
              age, normalized_phone, normalized_email, companion_count, payment_confirmation_sent,
              ticket_price, total_amount
            )
            SELECT
              ${registrationId}, ${code}, ${clientRegistrationId}, ${fullName}, ${phone}, ${email},
              ${age}, ${normalizedPhone}, ${normalizedEmail}, 0, TRUE,
              settings.ticket_price, settings.ticket_price
            FROM settings, attendance
            WHERE settings.allow_over_capacity
               OR attendance.participant_count + 1 <= settings.capacity_limit
            RETURNING id
          ),
          inserted_ticket AS (
            INSERT INTO tickets (id, registration_id, holder_name, ticket_number)
            SELECT ${ticketId}, inserted_registration.id, ${fullName}, 1
            FROM inserted_registration
            RETURNING id
          )
          SELECT id FROM inserted_registration
        `;
        if (!inserted[0]) {
          return Response.json(
            { error: "The ticket limit has been reached. Increase the limit or enable additional registrations first." },
            { status: 409 },
          );
        }
        const created = await sql`
          SELECT id, full_name, age, phone, email, companion_count, ticket_price, total_amount,
                 verified, arrived, created_at
          FROM registrations WHERE id = ${registrationId} LIMIT 1
        `;
        return Response.json({ registration: created[0] }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("registrations_code_key") && attempt < 3) continue;
        if (message.includes("normalized_phone") || message.includes("normalized_email")) {
          return Response.json({ error: "A registration already exists with this phone number or email." }, { status: 409 });
        }
        throw error;
      }
    }
    return Response.json({ error: "Could not create the registration. Please try again." }, { status: 503 });
  } catch (error) {
    return storageError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await requireAdmin(request))) {
      return Response.json({ error: "Organizer access required." }, { status: 401 });
    }
    const payload = (await request.json()) as { id?: string };
    if (!payload.id?.trim()) {
      return Response.json({ error: "Registration id is required." }, { status: 400 });
    }
    const sql = await getDatabase();
    const deleted = await sql`DELETE FROM registrations WHERE id = ${payload.id.trim()} RETURNING id`;
    if (!deleted[0]) {
      return Response.json({ error: "Registration not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return storageError(error);
  }
}
