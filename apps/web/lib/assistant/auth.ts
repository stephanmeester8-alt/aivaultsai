import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional shared-secret gate for the assistant API (opt-in).
 *
 * When ASSISTANT_API_KEY is configured, every request must present the key
 * as `Authorization: Bearer <key>`. Comparison is constant-time on SHA-256
 * digests so that timing does not leak key length or content.
 *
 * This is NOT a user-authentication system. It is the smallest practical
 * boundary until real authentication infrastructure (session management,
 * identity provider) is introduced.
 */
export function verifyAssistantApiKey(
  presented: string | null,
  expected: string,
): boolean {
  if (!presented || !expected) return false;
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function readBearerToken(request: { headers: Headers }): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1]!.trim() : null;
}
