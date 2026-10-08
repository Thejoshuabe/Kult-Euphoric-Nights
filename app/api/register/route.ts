import {
  createTenDigitCode,
  getDatabase,
  normalizeEmail,
  normalizePhone,
  storageError,
} from "@/lib/kult-server";

type CompanionInput = { fullName?: string; phone?: string };

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      clientRegistrationId?: string;
      fullName?: string;
      phone?: string;
      email?: string;
      companions?: CompanionInput[];
      paymentConfirmationSent?: boolean;
    };
    const fullName = payload.fullName?.trim() ?? "";
    const phone = payload.phone?.trim() ?? "";
    const email = payload.email?.trim() ?? "";
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = normalizeEmail(email);
    const companions = Array.isArray(payload.companions) ? payload.companions : [];
    const clientRegistrationId = payload.clientRegistrationId?.trim() ?? "";

    if (fullName.length < 2 || fullName.length > 80) {
      return Response.json({ error: "Please enter your full name." }, { status: 400 });
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
    if (!payload.paymentConfirmationSent) {
      return Response.json(
        { error: "Please send the payment screenshot to @kult.events.in before finishing." },
        { status: 400 },
      );
    }

    const sql = await getDatabase();
    const previous = await sql`
      SELECT code FROM registrations WHERE client_registration_id = ${clientRegistrationId} LIMIT 1
    `;
    if (previous[0]) {
      return Response.json({ code: String(previous[0].code), repeatedRequest: true });
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = createTenDigitCode();
      try {
        await sql.transaction((tx) => [
          tx`INSERT INTO registrations (
            id, code, client_registration_id, full_name, phone, email,
            normalized_phone, normalized_email, companion_count, payment_confirmation_sent
          ) VALUES (
            ${registrationId}, ${code}, ${clientRegistrationId}, ${fullName}, ${phone}, ${email},
            ${normalizedPhone}, ${normalizedEmail}, ${companions.length}, TRUE
          )`,
          ...companions.map((person) =>
            tx`INSERT INTO companions (id, registration_id, full_name, phone)
              VALUES (${crypto.randomUUID()}, ${registrationId}, ${person.fullName!.trim()}, ${person.phone?.trim() || null})`,
          ),
        ]);
        return Response.json({ code }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("registrations_code_key") && attempt < 3) continue;
        if (message.includes("client_registration_id")) {
          const retryResult = await sql`
            SELECT code FROM registrations WHERE client_registration_id = ${clientRegistrationId} LIMIT 1
          `;
          if (retryResult[0]) {
            return Response.json({ code: String(retryResult[0].code), repeatedRequest: true });
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
    return Response.json({ error: "Could not create a unique registration code. Please try again." }, { status: 503 });
  } catch (error) {
    return storageError(error);
  }
}
