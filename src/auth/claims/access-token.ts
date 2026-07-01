import { z } from "zod";
import { InvalidToken } from "@/auth/errors";
import {
  dropNullValues,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredInteger,
  requiredString,
} from "@/auth/claims/fields";

const accessTokenClaimsSchema = z.object({
  iss: requiredString,
  sub: requiredString,
  aud: requiredString,
  iat: requiredInteger,
  exp: requiredInteger,
  jti: requiredString,
  nbf: optionalInteger,
  staff: optionalBoolean,
  cid: optionalString,
  eid: optionalString,
  cell: optionalString,
  scope: optionalString,
  amr: optionalStringArray,
  acr: optionalString,
  auth_time: optionalInteger,
  act: optionalRecord,
});

export type AccessTokenClaims = Readonly<z.infer<typeof accessTokenClaimsSchema>>;

/**
 * Parses a verified JWT payload into typed access token claims.
 */
export function parseAccessTokenClaims(payload: Record<string, unknown>): AccessTokenClaims {
  const result = accessTokenClaimsSchema.safeParse(dropNullValues(payload));

  if (!result.success) {
    throw new InvalidToken(result.error.issues[0].message);
  }

  return Object.freeze(result.data);
}
