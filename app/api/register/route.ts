import {
  createTenDigitCode,
  getDatabase,
  getRegistrationStatus,
  normalizeEmail,
  normalizePhone,
  storageError,
} from "@/lib/kult-server";

type CompanionInput = { fullName?: string; age?: number | string; phone?: string };

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      clientRegistrationId?: string;
      fullName?: string;
      age?: number | string;
      phone?: string;
      email?: string;
      companions?: CompanionInput[];
      paymentConfirmationSent?: boolean;
    };
    const fullName = payload.fullName?.trim() ?? "";
    const age = Number(payload.age);
    const phone = payload.phone?.trim() ?? "";
    const email = payload.email?.trim() ?? "";
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);
    const companions = Array.isArray(payload.companions) ? payload.companions : [];
    const clientRegistrationId = payload.clientRegistrationId?.trim() ?? "";

    if (fullName.length < 2 || fullName.length > 80) {
      return Response.json({ error: "Please enter your full name." }, { status: 400 });
    }
    if (!Number.isInteger(age) || age < 16 || age > 24) {
      return Response.json({ error: "Please select an age between 16 and 24." }, { status: 400 });
    }
    if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
      return Response.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(clientRegistrationId)) {
      return Response.json({ error: "Please restart the registration and try again." }, { status: 400 });
    }
    if (companions.length > 8) {
      return Response.json({ error: "A registration can include up to 8 accompanying guests." }, { status: 400 });
    }
    if (companions.some((person) => !person.fullName?.trim())) {
      return Response.json({ error: "Please add a name for every accompanying guest." }, { status: 400 });
    }
    if (companions.some((person) => {
      const guestAge = Number(person.age);
      return !Number.isInteger(guestAge) || guestAge < 16 || guestAge > 24;
    })) {
      return Response.json({ error: "Every guest must be between 16 and 24 years old." }, { status: 400 });
    }
    if (companions.some((person) => {
      const guestPhone = normalizePhone(person.phone ?? "");
      return guestPhone.length < 7 || guestPhone.length > 15;
    })) {
      return Response.json({ error: "Please enter a valid phone number for every guest." }, { status: 400 });
    }
    if (!payload.paymentConfirmationSent) {
      return Response.json(
        { error: "Please send the payment screenshot to @kult.events.in before finishing." },
        { status: 400 },
      );
    }

    const sql = await getDatabase();
    const previous = await sql`
      SELECT id FROM registrations WHERE client_registration_id = ${clientRegistrationId} LIMIT 1
    `;
    if (previous[0]) {
      return Response.json({ ok: true, repeatedRequest: true });
    }
    const duplicate = await sql`
      SELECT normalized_phone, normalized_email FROM registrations
      WHERE normalized_phone = ${normalizedPhone} OR normalized_email = ${normalizedEmail}
      LIMIT 1
    `;
    if (duplicate[0]) {
      const field = duplicate[0].normalized_phone === normalizedPhone ? "phone" : "email";
      return Response.json(
        { error: `A registration already exists with this ${field}. Use Verify Registration on the first page.` },
        { status: 409 },
      );
    }

    const registrationId = crypto.randomUUID();
    const partySize = 1 + companions.length;
    const companionJson = JSON.stringify(
      companions.map((person) => ({
        id: crypto.randomUUID(),
        full_name: person.fullName!.trim(),
        age: Number(person.age),
        phone: person.phone!.trim(),
      })),
    );
    const ticketJson = JSON.stringify([
      { id: crypto.randomUUID(), holder_name: fullName, ticket_number: 1 },
      ...companions.map((person, index) => ({
        id: crypto.randomUUID(),
        holder_name: person.fullName!.trim(),
        ticket_number: index + 2,
      })),
    ]);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = createTenDigitCode();
      try {
        const created = await sql`
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
              ${age}, ${normalizedPhone}, ${normalizedEmail}, ${companions.length}, TRUE,
              settings.ticket_price, settings.ticket_price * ${partySize}
            FROM settings, attendance
            WHERE settings.allow_over_capacity
               OR attendance.participant_count + ${partySize} <= settings.capacity_limit
            RETURNING id
          ),
          inserted_companions AS (
            INSERT INTO companions (id, registration_id, full_name, age, phone)
            SELECT guest.id, inserted_registration.id, guest.full_name, guest.age, guest.phone
            FROM inserted_registration
            CROSS JOIN jsonb_to_recordset(${companionJson}::jsonb)
              AS guest(id text, full_name text, age smallint, phone text)
            RETURNING id
          ),
          inserted_tickets AS (
            INSERT INTO tickets (id, registration_id, holder_name, ticket_number)
            SELECT ticket.id, inserted_registration.id, ticket.holder_name, ticket.ticket_number
            FROM inserted_registration
            CROSS JOIN jsonb_to_recordset(${ticketJson}::jsonb)
              AS ticket(id text, holder_name text, ticket_number smallint)
            RETURNING id
          )
          SELECT id FROM inserted_registration
        `;
        if (!created[0]) {
          const status = await getRegistrationStatus();
          return Response.json(
            {
              error: status.capacityReached
                ? `Registration is currently paused because all ${status.capacityLimit} participant spots are filled.`
                : `Only ${Math.max(0, status.capacityLimit - status.participantCount)} participant spots remain. Please reduce the number of accompanying guests.`,
              code: "CAPACITY_REACHED",
              status,
            },
            { status: 409 },
          );
        }
        return Response.json({ ok: true }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("registrations_code_key") && attempt < 3) continue;
        if (message.includes("client_registration_id")) {
          const retryResult = await sql`
            SELECT id FROM registrations WHERE client_registration_id = ${clientRegistrationId} LIMIT 1
          `;
          if (retryResult[0]) {
            return Response.json({ ok: true, repeatedRequest: true });
          }
        }
        if (message.includes("normalized_phone") || message.includes("normalized_email")) {
          return Response.json(
            { error: "A registration already exists with this phone number or email. Use Verify Registration on the first page." },
            { status: 409 },
          );
        }
        throw error;
      }
    }
    return Response.json({ error: "Could not complete the registration. Please try again." }, { status: 503 });
  } catch (error) {
    return storageError(error);
  }
}
