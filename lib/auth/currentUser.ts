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
// bundle AT BUILD TIME. Set both to the same value. The fallback is the
// owner's home zone (Asia/Hong_Kong), NOT UTC: this is a single-user app and
// a UTC fallback silently shifts every clock 8h whenever a build/runtime is
// missing the env var (e.g. NEXT_PUBLIC_OWNER_TZ absent from the Vercel build
// → the client clock bakes in UTC). Defaulting to HKT makes that failure mode
// impossible; the env vars still override for travel/relocation.
export function getOwnerTz(): string {
  return (
    process.env.OWNER_TZ ?? process.env.NEXT_PUBLIC_OWNER_TZ ?? "Asia/Hong_Kong"
  );
}

// Guard the one way this can go wrong silently.
//
// Client components are server-rendered first, where OWNER_TZ is a live runtime
// read — then hydrated in the browser, where it is always undefined and only
// the build-time-inlined NEXT_PUBLIC_OWNER_TZ survives. Set OWNER_TZ alone and
// the two passes resolve different zones: SSR paints one time, hydration paints
// another, and React reports a generic hydration mismatch that names markup
// rather than the timezone. Fail loudly at startup instead.
//
// Only meaningful on the server (in the browser both reads collapse to the
// inlined value, so there is nothing left to compare).
if (
  typeof window === "undefined" &&
  process.env.OWNER_TZ &&
  process.env.NEXT_PUBLIC_OWNER_TZ &&
  process.env.OWNER_TZ !== process.env.NEXT_PUBLIC_OWNER_TZ
) {
  console.warn(
    `[tz] OWNER_TZ ("${process.env.OWNER_TZ}") != NEXT_PUBLIC_OWNER_TZ ` +
      `("${process.env.NEXT_PUBLIC_OWNER_TZ}"). The server will render one zone ` +
      `and the browser another, producing hydration mismatches. Set both to the ` +
      `same IANA zone. NEXT_PUBLIC_OWNER_TZ is inlined at BUILD time, so it also ` +
      `needs a rebuild — not just a restart — to take effect.`,
  );
} else if (typeof window === "undefined" && process.env.OWNER_TZ && !process.env.NEXT_PUBLIC_OWNER_TZ) {
  console.warn(
    `[tz] OWNER_TZ is set ("${process.env.OWNER_TZ}") but NEXT_PUBLIC_OWNER_TZ is ` +
      `not, so the browser will fall back to "Asia/Hong_Kong" while the server ` +
      `uses OWNER_TZ. Set both to the same IANA zone.`,
  );
}
