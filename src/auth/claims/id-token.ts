import { z } from "zod";
import { InvalidToken } from "@/auth/errors";
import {
  dropNullValues,
  optionalBoolean,
  optionalInteger,
  optionalString,
  requiredInteger,
  requiredString,
} from "@/auth/claims/fields";

const idTokenClaimsSchema = z.object({
  iss: requiredString,
  sub: requiredString,
  aud: requiredString,
  iat: requiredInteger,
  exp: requiredInteger,
  nbf: optionalInteger,
  email: optionalString,
  staff: optionalBoolean,
  cid: optionalString,
  eid: optionalString,
  cell: optionalString,
  nonce: optionalString,
  auth_time: optionalInteger,
  email_verified: optionalBoolean,
});

export type IdTokenClaims = Readonly<z.infer<typeof idTokenClaimsSchema>>;

/**
 * Parses a verified JWT payload into typed ID token claims.
 */
export function parseIdTokenClaims(payload: Record<string, unknown>): IdTokenClaims {
  const result = idTokenClaimsSchema.safeParse(dropNullValues(payload));

  if (!result.success) {
    throw new InvalidToken(result.error.issues[0].message);
  }

  return Object.freeze(result.data);
}
