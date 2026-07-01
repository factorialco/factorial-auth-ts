import type { AccessTokenClaims } from "@/auth/claims/access-token";
import type { IdTokenClaims } from "@/auth/claims/id-token";
import { type FactorialAuthConfig, validateConfig } from "@/auth/config";
import { Decoder } from "@/auth/decoder";
import { AuthError } from "@/auth/errors";
import { JwksClient } from "@/auth/jwks";
import { DiscoveryClient } from "@/auth/oidc-discovery";

/**
 * Entry point for verifying Factorial ID tokens. Construction is cheap and
 * synchronous; discovery + JWKS are fetched lazily on the first `verify*` call
 * and cached thereafter.
 *
 * The `verify*` methods throw a typed {@link AuthError} on failure; the
 * `tryVerify*` variants return `null` instead (mirroring the gem's bang /
 * non-bang pair). Unexpected non-auth errors always propagate.
 */
export class FactorialAuth {
  private readonly decoder: Decoder;

  constructor(config: FactorialAuthConfig) {
    const validatedConfig = validateConfig(config);
    const discoveryClient = new DiscoveryClient(validatedConfig);
    const jwksClient = new JwksClient(validatedConfig, discoveryClient);

    this.decoder = new Decoder(validatedConfig, discoveryClient, jwksClient);
  }

  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.decoder.decodeAccessToken(token);
  }

  verifyIdToken(token: string): Promise<IdTokenClaims> {
    return this.decoder.decodeIdToken(token);
  }

  tryVerifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    return nullOnAuthError(this.verifyAccessToken(token));
  }

  tryVerifyIdToken(token: string): Promise<IdTokenClaims | null> {
    return nullOnAuthError(this.verifyIdToken(token));
  }
}

async function nullOnAuthError<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AuthError) {
      return null;
    }
    throw error;
  }
}
