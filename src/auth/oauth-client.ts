import { z } from 'zod'
import type { AccessTokenClaims } from '@/auth/claims/access-token'
import {
  ConfigurationError,
  OAuthInvalidGrantError,
  OAuthRequestError,
  OAuthTokenResponseError,
} from '@/auth/errors'
import type { DiscoveryClient } from '@/auth/oidc-discovery'
import { fetchText } from '@/shared/http'

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

const oauthClientConfigSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  clientSecret: z.string().min(1, 'clientSecret is required'),
})

export type FactorialOAuthClientConfig = Readonly<z.infer<typeof oauthClientConfigSchema>>

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  token_type: z.string().min(1).optional(),
  scope: z.string().optional(),
})

const oauthErrorSchema = z.object({ error: z.string().min(1).optional() })

export type OAuthTokenGrant = Readonly<{
  accessToken: string
  refreshToken?: string
  expiresInSeconds?: number
  tokenType?: string
  scope?: string
  claims: AccessTokenClaims
}>

export interface FactorialOAuthClient {
  /** Exchanges a Factorial ID access token using RFC 8693. */
  exchangeToken(subjectToken: string): Promise<OAuthTokenGrant>
  /** Refreshes an OAuth grant, preserving the existing refresh token if FID omits a rotation. */
  refreshToken(refreshToken: string): Promise<OAuthTokenGrant>
  /** Revokes an OAuth token using RFC 7009. No-ops when discovery advertises no endpoint. */
  revokeToken(token: string, tokenTypeHint?: string): Promise<void>
}

type DecodeAccessToken = (token: string) => Promise<AccessTokenClaims>

export function createOAuthClient(
  config: FactorialOAuthClientConfig,
  discoveryClient: DiscoveryClient,
  decodeAccessToken: DecodeAccessToken,
  httpTimeoutMs: number
): FactorialOAuthClient {
  const result = oauthClientConfigSchema.safeParse(config)
  if (!result.success) {
    throw new ConfigurationError(result.error.issues[0].message)
  }

  return new DefaultFactorialOAuthClient(
    result.data,
    discoveryClient,
    decodeAccessToken,
    httpTimeoutMs
  )
}

class DefaultFactorialOAuthClient implements FactorialOAuthClient {
  constructor(
    private readonly config: FactorialOAuthClientConfig,
    private readonly discoveryClient: DiscoveryClient,
    private readonly decodeAccessToken: DecodeAccessToken,
    private readonly httpTimeoutMs: number
  ) {}

  async exchangeToken(subjectToken: string): Promise<OAuthTokenGrant> {
    return this.callTokenEndpoint({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
    })
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenGrant> {
    return this.callTokenEndpoint(
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      refreshToken
    )
  }

  async revokeToken(token: string, tokenTypeHint = 'refresh_token'): Promise<void> {
    const discovery = await this.currentDiscovery()
    if (!discovery.revocationEndpoint) return

    await this.postForm(
      discovery.revocationEndpoint,
      {
        token,
        token_type_hint: tokenTypeHint,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
      true
    )
  }

  private async callTokenEndpoint(
    params: Record<string, string>,
    currentRefreshToken?: string
  ): Promise<OAuthTokenGrant> {
    const discovery = await this.currentDiscovery()
    if (!discovery.tokenEndpoint) {
      throw new OAuthRequestError('OIDC discovery does not advertise a token_endpoint')
    }

    const json = await this.postForm(discovery.tokenEndpoint, {
      ...params,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    })
    const parsed = tokenResponseSchema.safeParse(json)
    if (!parsed.success) {
      throw new OAuthTokenResponseError('OAuth token response is malformed')
    }

    let claims: AccessTokenClaims
    try {
      claims = await this.decodeAccessToken(parsed.data.access_token)
    } catch (error) {
      throw new OAuthTokenResponseError('OAuth returned an unverifiable access token', {
        cause: error,
      })
    }

    return Object.freeze({
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? currentRefreshToken,
      expiresInSeconds: parsed.data.expires_in,
      tokenType: parsed.data.token_type,
      scope: parsed.data.scope,
      claims,
    })
  }

  private async postForm(
    url: string,
    params: Record<string, string>,
    allowEmptySuccess = false
  ): Promise<unknown> {
    let response
    try {
      response = await fetchText(url, this.httpTimeoutMs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      })
    } catch (error) {
      throw new OAuthRequestError('OAuth request failed', undefined, undefined, { cause: error })
    }

    if (response.ok && allowEmptySuccess && response.body.trim().length === 0) return null

    let json: unknown
    try {
      json = JSON.parse(response.body)
    } catch (error) {
      if (response.ok) {
        throw new OAuthTokenResponseError('OAuth response is not valid JSON', { cause: error })
      }
      throw new OAuthRequestError(
        `OAuth request failed with status ${response.status}`,
        response.status
      )
    }

    if (!response.ok) {
      const oauthError = oauthErrorSchema.safeParse(json).data?.error
      const ErrorClass = oauthError === 'invalid_grant' ? OAuthInvalidGrantError : OAuthRequestError
      throw new ErrorClass(
        `OAuth request failed with status ${response.status}${oauthError ? `: ${oauthError}` : ''}`,
        response.status,
        oauthError
      )
    }

    return json
  }

  private async currentDiscovery() {
    try {
      return await this.discoveryClient.currentDocument()
    } catch (error) {
      throw new OAuthRequestError('OAuth discovery failed', undefined, undefined, {
        cause: error,
      })
    }
  }
}
