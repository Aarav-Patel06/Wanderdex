import { createHash, timingSafeEqual } from "node:crypto";

// The token check for /api/health (SPEC §18), which the GitHub Actions keep-alive calls with
// `Authorization: Bearer <HEALTH_PING_TOKEN>`. There's no session, so this is its only guard.

// True only if the header carries exactly the expected token. A missing or empty expected token
// fails closed. Both sides are hashed first, so the constant-time compare always gets equal
// lengths and the token's length doesn't leak.
export function healthTokenMatches(authorization: string | null, expected: string | undefined) {
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const given = authorization.slice("Bearer ".length);
  return timingSafeEqual(sha256(given), sha256(expected));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}
