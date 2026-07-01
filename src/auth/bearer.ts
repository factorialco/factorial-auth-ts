import { isPresent } from "@/shared/utils";

/**
 * Extracts the token from an HTTP `Authorization: Bearer <token>` header.
 *
 * Framework-agnostic — pass the raw header value (or `null`/`undefined`). Returns
 * the token, or `null` when the header is absent or not a `Bearer` credential.
 * The scheme is matched case-sensitively; surrounding/repeated whitespace is
 * tolerated (mirrors the gem's `String#split(" ")`).
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!isPresent(authorizationHeader)) {
    return null;
  }

  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  return parts[1];
}
