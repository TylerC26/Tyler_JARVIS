// v1: hardcoded single-user mode. RLS is disabled and every row is owned by
// OWNER_ID. When real multi-user lands, swap the body for `auth.uid()`.

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
