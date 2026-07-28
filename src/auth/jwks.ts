import { type JSONWebKeySet, type JWTVerifyGetKey, createLocalJWKSet, errors } from 'jose'
import type { FactorialAuthValidatedConfig } from '@/auth/config'
import { JwksFetchError, JwksParseError } from '@/auth/errors'
import type { DiscoveryClient } from '@/auth/oidc-discovery'
import { TtlCache } from '@/shared/cache'
import { HttpParseError, fetchJson } from '@/shared/http'

const JWKS_TTL_MS = 600_000 // 10 minutes
const JWKS_STALE_TTL_MS = 3_600_000 // 1 hour

/**
 * Fetches and caches the JWKS and exposes a jose key resolver ({@link getKey})
 * for `jwtVerify`. When a token's `kid` is absent from the cached set it refreshes
 * once to pick up rotated keys (mirrors the gem's `set_for_kid`). The dual-TTL,
 * stale-on-error, and single-flight behavior comes from {@link TtlCache}.
 */
export class JwksClient {
  private readonly cache: TtlCache<JWTVerifyGetKey>

  /** The key resolver to pass to jose's `jwtVerify`. */
  readonly getKey: JWTVerifyGetKey

  constructor(
    private readonly config: FactorialAuthValidatedConfig,
    private readonly discoveryClient: DiscoveryClient
  ) {
    this.cache = new TtlCache(() => this.fetchKeySet(), JWKS_TTL_MS, JWKS_STALE_TTL_MS)

    this.getKey = async (protectedHeader, token) => {
      const resolve = await this.cache.get()
      try {
        return await resolve(protectedHeader, token)
      } catch (error) {
        if (error instanceof errors.JWKSNoMatchingKey) {
          const refreshed = await this.cache.refresh()
          return refreshed(protectedHeader, token)
        }
        throw error
      }
    }
  }

  private async fetchKeySet(): Promise<JWTVerifyGetKey> {
    const { jwksUri } = await this.discoveryClient.currentDocument()

    let json: unknown
    try {
      json = await fetchJson(jwksUri, this.config.httpTimeoutMs, {
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      if (error instanceof HttpParseError) {
        throw new JwksParseError('JWKS response is not valid JSON', { cause: error })
      }
      throw new JwksFetchError(`Failed to fetch JWKS from ${jwksUri}`, { cause: error })
    }

    try {
      // createLocalJWKSet validates the `{ keys: [...] }` structure at runtime.
      return createLocalJWKSet(json as JSONWebKeySet)
    } catch (error) {
      throw new JwksParseError('JWKS is malformed', { cause: error })
    }
  }
}
