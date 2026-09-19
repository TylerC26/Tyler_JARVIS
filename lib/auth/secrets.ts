// Constant-time comparison for the app's shared-secret auth paths (the Vercel
// cron dispatcher, the MCP endpoint, the Telegram webhook).
//
// Two rules this module exists to enforce:
//
// 1. FAIL CLOSED. Never build an expected value out of a possibly-undefined env
//    var. A check written inline as
//        authHeader !== `Bearer ${process.env.CRON_SECRET}`
//    compares against the literal string "Bearer undefined" whenever the var is
//    unset, so anyone sending exactly that header authenticates. Callers pass
//    the raw env value and these helpers reject when it is missing.
//
// 2. CONSTANT TIME. A plain === returns early at the first differing byte,
//    which leaks the secret to anyone able to measure response latency across
//    many requests. Length is compared first and is not treated as secret;
//    timingSafeEqual requires equal-length buffers.

import { timingSafeEqual } from "node:crypto";

/** True only when both values are present, equal-length, and byte-identical. */
export function secretsMatch(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** True only when the Authorization header carries exactly `expected`. */
export function bearerMatches(
  authorizationHeader: string | undefined | null,
  expected: string | undefined | null,
): boolean {
  if (!expected) return false;
  const match = (authorizationHeader ?? "").match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return secretsMatch(match[1].trim(), expected);
}
