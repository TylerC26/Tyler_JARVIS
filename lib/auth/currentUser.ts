// v1: hardcoded single-user mode. RLS is disabled and every row is owned by
// OWNER_ID. When real multi-user lands, swap the body for `auth.uid()`.

export const FALLBACK_OWNER_ID = "00000000-0000-0000-0000-000000000001";

export function getOwnerId(): string {
  return process.env.OWNER_ID ?? FALLBACK_OWNER_ID;
}

// The owner's IANA timezone. The web chat gets this from the browser, but
// server-side entry points (the Telegram webhook, cron jobs) have no browser —
// they read it here. Falls back to UTC if unset.
export function getOwnerTz(): string {
  return process.env.OWNER_TZ ?? "UTC";
}
