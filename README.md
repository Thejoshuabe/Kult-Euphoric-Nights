# KULT Events Registration

A mobile-first event registration and organizer check-in system for the KULT event on 24 October at Talk of the Town Restaurant, Edappally.

## Included

- Guided attendee and accompanying-guest registration
- UPI QR payment screen with QR download
- Instagram payment-proof confirmation
- Unique 10-digit registration codes
- Public registration-status lookup
- Organizer-only payment verification and arrival check-in
- Duplicate prevention for phone numbers, emails, and retried submissions
- Persistent Postgres storage with secure, server-side organizer sessions
- Organizer sign-in rate limiting against repeated code guessing

## Local development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local`, set `DATABASE_URL` to a Neon Postgres connection string, and set `ORGANIZER_CODE`.
3. Run `pnpm dev`.

The required tables and indexes are created safely on the first database-backed request.

## Vercel deployment

1. Import this GitHub repository into Vercel.
2. Add a Neon Postgres integration to the Vercel project.
3. Confirm the integration supplies `DATABASE_URL` for Production and Preview.
4. Add `ORGANIZER_CODE` as a private Vercel environment variable.
5. Deploy. Vercel will detect the Next.js application automatically.

The organizer access code is handled only by server code and never sent to the browser until entered by an organizer.
