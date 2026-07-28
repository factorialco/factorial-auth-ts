import { z } from 'zod'
import type { FactorialAuthValidatedConfig } from '@/auth/config'
import { OidcDiscoveryFetchError, OidcDiscoveryParseError } from '@/auth/errors'
import { TtlCache } from '@/shared/cache'
import { HttpParseError, fetchJson } from '@/shared/http'

const DISCOVERY_TTL_MS = 600_000 // 10 minutes
const DISCOVERY_STALE_TTL_MS = 3_600_000 // 1 hour

const discoveryDocumentSchema = z
  .object({
    issuer: z.string().min(1),
    jwks_uri: z.string().min(1),
    token_endpoint: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
  })
  .transform((document) => ({
    issuer: document.issuer,
    jwksUri: document.jwks_uri,
    tokenEndpoint: document.token_endpoint,
  }))

export type DiscoveryDocument = z.infer<typeof discoveryDocumentSchema>

/**
 * Resolves the issuer and JWKS URI from the OIDC discovery endpoint, cached with
 * a dual TTL and stale-on-error fallback (see {@link TtlCache}).
 */
export class DiscoveryClient {
  private readonly cache: TtlCache<DiscoveryDocument>

  constructor(private readonly config: FactorialAuthValidatedConfig) {
    this.cache = new TtlCache(() => this.fetchDocument(), DISCOVERY_TTL_MS, DISCOVERY_STALE_TTL_MS)
  }

  currentDocument(): Promise<DiscoveryDocument> {
    return this.cache.get()
  }

  private async fetchDocument(): Promise<DiscoveryDocument> {
    assertHttpsDiscoveryUrl(this.config.oidcDiscoveryUrl)

    let json: unknown

    try {
      json = await fetchJson(this.config.oidcDiscoveryUrl, this.config.httpTimeoutMs, {
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      if (error instanceof HttpParseError) {
        throw new OidcDiscoveryParseError('OIDC discovery document is not valid JSON', {
          cause: error,
        })
      }
      throw new OidcDiscoveryFetchError(
        `Failed to fetch OIDC discovery document from ${this.config.oidcDiscoveryUrl}`,
        { cause: error }
      )
    }

    const result = discoveryDocumentSchema.safeParse(json)

    if (!result.success) {
      throw new OidcDiscoveryParseError(
        'OIDC discovery document is missing a valid issuer, jwks_uri, or token_endpoint'
      )
    }

    return result.data
  }
}

/**
 * The discovery document is the trust root for issuer, JWKS, and token endpoint;
 * fetching it over plain http would let an on-path attacker swap all three.
 */
function assertHttpsDiscoveryUrl(discoveryUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(discoveryUrl)
  } catch (error) {
    throw new OidcDiscoveryFetchError(`Invalid OIDC discovery URL: ${discoveryUrl}`, {
      cause: error,
    })
  }

  if (parsed.protocol !== 'https:') {
    throw new OidcDiscoveryFetchError(`OIDC discovery URL must use HTTPS: ${discoveryUrl}`)
  }
}
