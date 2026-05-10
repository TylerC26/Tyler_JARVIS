// v1: hardcoded single-user mode. RLS is disabled and every row is owned by
// OWNER_ID. When real multi-user lands, swap the body for `auth.uid()`.

export const FALLBACK_OWNER_ID = "00000000-0000-0000-0000-000000000001";

export function getOwnerId(): string {
  return process.env.OWNER_ID ?? FALLBACK_OWNER_ID;
}
