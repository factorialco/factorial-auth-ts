import type { AccessTokenClaims } from '@/auth/claims/access-token'
import type { IdTokenClaims } from '@/auth/claims/id-token'
import { type FactorialAuthConfig, validateConfig } from '@/auth/config'
import { Decoder } from '@/auth/decoder'
import { AuthError } from '@/auth/errors'
import { JwksClient } from '@/auth/jwks'
import { DiscoveryClient } from '@/auth/oidc-discovery'

/**
 * Entry point for decoding and verifying Factorial ID tokens.
 */
export class FactorialAuth {
  private readonly decoder: Decoder

  constructor(config: FactorialAuthConfig) {
    const validatedConfig = validateConfig(config)
    const discoveryClient = new DiscoveryClient(validatedConfig)
    const jwksClient = new JwksClient(validatedConfig, discoveryClient)

    this.decoder = new Decoder(validatedConfig, discoveryClient, jwksClient)
  }

  /**
   * Decodes and verifies an access token: checks the signature against the JWKS
   * and validates `iss`, `aud`, `exp`, and `nbf`, returning typed claims.
   * Throws an {@link AuthError} subclass if decoding or verification fails.
   */
  decodeAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.decoder.decodeAccessToken(token)
  }

  /**
   * Decodes and verifies an ID token (see {@link decodeAccessToken}), returning
   * typed claims. Throws an {@link AuthError} subclass on failure.
   */
  decodeIdToken(token: string): Promise<IdTokenClaims> {
    return this.decoder.decodeIdToken(token)
  }

  /**
   * Like {@link decodeAccessToken}, but returns `null` instead of throwing an {@link AuthError}.
   */
  tryDecodeAccessToken(token: string): Promise<AccessTokenClaims | null> {
    return nullOnAuthError(this.decodeAccessToken(token))
  }

  /**
   * Like {@link decodeIdToken}, but returns `null` instead of throwing an {@link AuthError}.
   */
  tryDecodeIdToken(token: string): Promise<IdTokenClaims | null> {
    return nullOnAuthError(this.decodeIdToken(token))
  }
}

async function nullOnAuthError<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (error) {
    if (error instanceof AuthError) {
      return null
    }
    throw error
  }
}
