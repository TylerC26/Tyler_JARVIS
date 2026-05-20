// v1: hardcoded single-user mode. Every row is owned by OWNER_ID. RLS is
// enabled on all tables (migration 0032) but the app has no Supabase Auth
// session, so the server reaches the DB with the service-role key (see
// lib/supabase/server.ts) and the public anon key is fully locked out. When
// real multi-user lands, swap the body for `auth.uid()` and switch the server
// client back to a session-carrying anon client.

export const FALLBACK_OWNER_ID = "00000000-0000-0000-0000-000000000001";

export function getOwnerId(): string {
  return process.env.OWNER_ID ?? FALLBACK_OWNER_ID;
}

// The owner's IANA timezone — the single source of truth for every date/time
// computation in the app. Pinned via env so the result is identical on the
// Vercel server (UTC box), the deployed site, and the Telegram webhook,
// regardless of any browser's local timezone.
//
// OWNER_TZ is server-only; NEXT_PUBLIC_OWNER_TZ is inlined into the client
// bundle. Set both to the same value. Falls back to UTC if neither is set.
export function getOwnerTz(): string {
  return (
    process.env.OWNER_TZ ?? process.env.NEXT_PUBLIC_OWNER_TZ ?? "UTC"
  );
}
