import { z } from 'zod'
import type { FactorialAuthValidatedConfig } from '@/auth/config'
import {
  ConfigurationError,
  OidcDiscoveryParseError,
  TokenRequestError,
  TokenResponseParseError,
} from '@/auth/errors'
import type { DiscoveryClient } from '@/auth/oidc-discovery'
import { HttpError, fetchText } from '@/shared/http'

const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'
const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange'

const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? undefined)
const optionalInteger = z
  .number()
  .int()
  .nullable()
  .optional()
  .transform((value) => value ?? undefined)

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int(),
  scope: optionalString,
  refresh_token: optionalString,
  created_at: optionalInteger,
  issued_token_type: optionalString,
})

export type TokenResponse = Readonly<{
  accessToken: string
  tokenType: string
  expiresIn: number
  scope?: string
  refreshToken?: string
  createdAt?: number
  issuedTokenType?: string
}>

/** OAuth token endpoint client mirroring Ruby factorial-auth. */
export class TokenClient {
  constructor(
    private readonly config: FactorialAuthValidatedConfig,
    private readonly discoveryClient: DiscoveryClient
  ) {}

  refreshToken(refreshToken: string): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      ...this.clientCredentials(),
    })
  }

  platformToken(options: { audience: string; cell?: string }): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: 'client_credentials',
      ...this.clientCredentials(),
      audience: options.audience,
      ...(options.cell === undefined ? {} : { cell: options.cell }),
    })
  }

  delegatedToken(options: { subjectToken: string; audience: string }): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: options.subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      ...this.clientCredentials(),
      audience: options.audience,
    })
  }

  private async requestToken(params: Record<string, string>): Promise<TokenResponse> {
    const { tokenEndpoint } = await this.discoveryClient.currentDocument()
    if (tokenEndpoint === undefined) {
      throw new OidcDiscoveryParseError('OIDC discovery payload is missing token_endpoint')
    }

    assertHttpsTokenEndpoint(tokenEndpoint)

    let response
    try {
      response = await fetchText(tokenEndpoint, this.config.httpTimeoutMs, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
      })
    } catch (error) {
      if (error instanceof HttpError) {
        throw new TokenRequestError('Token request failed', { cause: error })
      }
      throw error
    }

    if (!response.ok) {
      throw new TokenRequestError(
        `Token request failed with status ${response.status}${tokenErrorDescription(response.body)}`
      )
    }

    return parseTokenResponse(response.body)
  }

  private clientCredentials(): { client_id: string; client_secret: string } {
    if (this.config.clientId === undefined || this.config.clientId.length === 0) {
      throw new ConfigurationError('clientId is required')
    }
    if (this.config.clientSecret === undefined || this.config.clientSecret.length === 0) {
      throw new ConfigurationError('clientSecret is required')
    }

    return {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    }
  }
}

export function parseTokenResponse(rawResponse: string): TokenResponse {
  let json: unknown
  try {
    json = JSON.parse(rawResponse)
  } catch (error) {
    throw new TokenResponseParseError('Invalid token response payload', { cause: error })
  }

  const result = tokenResponseSchema.safeParse(json)
  if (!result.success) {
    throw new TokenResponseParseError('Invalid token response payload', {
      cause: result.error,
    })
  }

  return Object.freeze({
    accessToken: result.data.access_token,
    tokenType: result.data.token_type,
    expiresIn: result.data.expires_in,
    scope: result.data.scope,
    refreshToken: result.data.refresh_token,
    createdAt: result.data.created_at,
    issuedTokenType: result.data.issued_token_type,
  })
}

function assertHttpsTokenEndpoint(tokenEndpoint: string): void {
  let url: URL
  try {
    url = new URL(tokenEndpoint)
  } catch (error) {
    throw new TokenRequestError('Invalid token endpoint URL', { cause: error })
  }

  if (url.protocol !== 'https:') {
    throw new TokenRequestError(`Token endpoint must use HTTPS: ${tokenEndpoint}`)
  }
}

function tokenErrorDescription(rawBody: string): string {
  try {
    const body: unknown = JSON.parse(rawBody)
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return ''

    const error = Reflect.get(body, 'error')
    const description = Reflect.get(body, 'error_description')
    if (typeof error !== 'string') return ''

    const details =
      typeof description === 'string' && description.length > 0 ? ` (${description})` : ''
    return `: ${error}${details}`
  } catch {
    return ''
  }
}
