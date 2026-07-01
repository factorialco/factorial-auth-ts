import { type JWTPayload, errors, jwtVerify } from "jose";
import { type AccessTokenClaims, parseAccessTokenClaims } from "@/auth/claims/access-token";
import { type IdTokenClaims, parseIdTokenClaims } from "@/auth/claims/id-token";
import type { FactorialAuthValidatedConfig } from "@/auth/config";
import {
  AuthError,
  ExpiredToken,
  ImmatureToken,
  InvalidAudience,
  InvalidIssuer,
  InvalidToken,
} from "@/auth/errors";
import type { JwksClient } from "@/auth/jwks";
import type { DiscoveryClient } from "@/auth/oidc-discovery";

/**
 * Verifies a Factorial ID JWT (signature, `iss`, `aud`, `nbf`, `exp`) and maps
 * jose failures onto the {@link TokenError} hierarchy, mirroring the gem's
 * `Decoder`. The verified payload is handed to the strict claim parsers.
 */
export class Decoder {
  constructor(
    private readonly config: FactorialAuthValidatedConfig,
    private readonly discoveryClient: DiscoveryClient,
    private readonly jwksClient: JwksClient,
  ) {}

  async decodeAccessToken(token: string): Promise<AccessTokenClaims> {
    return parseAccessTokenClaims(await this.decodePayload(token));
  }

  async decodeIdToken(token: string): Promise<IdTokenClaims> {
    return parseIdTokenClaims(await this.decodePayload(token));
  }

  private async decodePayload(token: string): Promise<JWTPayload> {
    const { issuer } = await this.discoveryClient.currentDocument();

    try {
      const { payload } = await jwtVerify(token, this.jwksClient.getKey, {
        issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms,
        clockTolerance: this.config.clockLeewaySeconds,
      });

      return payload;
    } catch (error) {
      if (!this.config.requireNbf && isImmatureNbf(error)) {
        return this.acceptIgnoringNbf(error);
      }

      throw this.mapVerificationError(error);
    }
  }

  /**
   * jose validates `nbf` before `exp`, so an ignored `nbf` failure still leaves
   * expiration unchecked — re-check it against the payload jose already verified.
   */
  private acceptIgnoringNbf(error: errors.JWTClaimValidationFailed): JWTPayload {
    const { payload } = error;
    const { exp } = payload;
    if (
      typeof exp === "number" &&
      exp <= Math.floor(Date.now() / 1000) - this.config.clockLeewaySeconds
    ) {
      throw new ExpiredToken('"exp" claim timestamp check failed');
    }
    return payload;
  }

  private mapVerificationError(error: unknown): AuthError {
    // Fetch/parse failures from discovery or JWKS resolution surface unchanged.
    if (error instanceof AuthError) {
      return error;
    }

    if (error instanceof errors.JWTExpired) {
      return new ExpiredToken(error.message);
    }

    if (error instanceof errors.JWTClaimValidationFailed) {
      switch (error.claim) {
        case "iss":
          return new InvalidIssuer(error.message);
        case "aud":
          return new InvalidAudience(error.message);
        case "nbf":
          return new ImmatureToken(error.message);
      }
    }

    return new InvalidToken(error instanceof Error ? error.message : "Token verification failed");
  }
}

function isImmatureNbf(error: unknown): error is errors.JWTClaimValidationFailed {
  return (
    error instanceof errors.JWTClaimValidationFailed &&
    error.claim === "nbf" &&
    error.reason === "check_failed"
  );
}
