import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  ConfigurationError,
  OidcDiscoveryParseError,
  TokenRequestError,
  TokenResponseParseError,
} from '@/auth/errors'
import { FactorialAuth } from '@/auth/factorial-auth'
import { parseTokenResponse } from '@/auth/token-client'

const DISCOVERY_URL = 'https://factorial-id.example.com/.well-known/openid-configuration'
const TOKEN_ENDPOINT = 'https://factorial-id.example.com/oauth/token'

const tokenResponse = {
  access_token: 'access-token',
  token_type: 'Bearer',
  expires_in: 900,
  scope: 'factorial:service',
}

const server = setupServer()

function buildAuth(options: { clientId?: string; clientSecret?: string } = {}): FactorialAuth {
  return new FactorialAuth({
    oidcDiscoveryUrl: DISCOVERY_URL,
    audience: 'factorial',
    clientId: options.clientId ?? 'client-id',
    clientSecret: options.clientSecret ?? 'client-secret',
  })
}

function serveDiscovery(tokenEndpoint: string | null = TOKEN_ENDPOINT): void {
  server.use(
    http.get(DISCOVERY_URL, () =>
      HttpResponse.json({
        issuer: 'https://factorial-id.example.com',
        jwks_uri: 'https://factorial-id.example.com/.well-known/jwks.json',
        token_endpoint: tokenEndpoint ?? undefined,
      })
    )
  )
}

describe('TokenClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('requests a platform token with optional cell', async () => {
    let submitted: Record<string, string> = {}
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json(tokenResponse)
      })
    )

    const response = await buildAuth().tokenClient.platformToken({
      audience: 'factorial-backend',
      cell: 'eu1',
    })

    expect(response).toEqual({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      scope: 'factorial:service',
      refreshToken: undefined,
      createdAt: undefined,
      issuedTokenType: undefined,
    })
    expect(submitted).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client-id',
      client_secret: 'client-secret',
      audience: 'factorial-backend',
      cell: 'eu1',
    })
  })

  it('omits cell for a global platform token', async () => {
    let submitted: Record<string, string> = {}
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json(tokenResponse)
      })
    )

    await buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    expect(submitted).not.toHaveProperty('cell')
  })

  it('requests a delegated token with subject and audience', async () => {
    let submitted: Record<string, string> = {}
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json({
          ...tokenResponse,
          refresh_token: 'refresh-token',
          issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        })
      })
    )

    const response = await buildAuth().tokenClient.delegatedToken({
      subjectToken: 'subject-access-token',
      audience: 'factorial-backend',
    })

    expect(response.refreshToken).toBe('refresh-token')
    expect(response.issuedTokenType).toBe('urn:ietf:params:oauth:token-type:access_token')
    expect(submitted).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'subject-access-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      client_id: 'client-id',
      client_secret: 'client-secret',
      audience: 'factorial-backend',
    })
  })

  it('requests a refresh-token grant', async () => {
    let submitted: Record<string, string> = {}
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json({ ...tokenResponse, refresh_token: 'rotated-refresh-token' })
      })
    )

    const response = await buildAuth().tokenClient.refreshToken('old-refresh-token')

    expect(response.refreshToken).toBe('rotated-refresh-token')
    expect(submitted).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh-token',
      client_id: 'client-id',
      client_secret: 'client-secret',
    })
  })

  it('requires client credentials when a token operation is called', async () => {
    const missingId = new FactorialAuth({
      oidcDiscoveryUrl: DISCOVERY_URL,
      audience: 'factorial',
      clientSecret: 'client-secret',
    })
    const missingSecret = new FactorialAuth({
      oidcDiscoveryUrl: DISCOVERY_URL,
      audience: 'factorial',
      clientId: 'client-id',
    })

    await expect(
      missingId.tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(ConfigurationError)
    await expect(
      missingSecret.tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(ConfigurationError)
  })

  it('requires a discovered HTTPS token endpoint', async () => {
    serveDiscovery(null)
    await expect(
      buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(OidcDiscoveryParseError)

    server.resetHandlers()
    serveDiscovery('http://factorial-id.example.com/oauth/token')
    await expect(
      buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(/Token endpoint must use HTTPS/)

    server.resetHandlers()
    serveDiscovery('not a url')
    await expect(
      buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(TokenRequestError)
  })

  it('does not follow token endpoint redirects', async () => {
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, () =>
        HttpResponse.text(null, {
          status: 307,
          headers: { Location: 'https://attacker.example.com/oauth/token' },
        })
      )
    )

    const error = await buildAuth()
      .tokenClient.platformToken({ audience: 'factorial-backend' })
      .catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(TokenRequestError)
    expect(error).toMatchObject({ status: 307 })
  })

  it('maps network and non-success responses to token request errors', async () => {
    serveDiscovery()
    server.use(http.post(TOKEN_ENDPOINT, () => HttpResponse.error()))
    await expect(
      buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(TokenRequestError)

    server.resetHandlers()
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, () =>
        HttpResponse.json(
          { error: 'invalid_target', error_description: 'audience is not allowed' },
          { status: 400 }
        )
      )
    )
    await expect(
      buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(
      'Token request failed with status 400: invalid_target (audience is not allowed)'
    )
  })

  it('rejects malformed token responses and optional fields', async () => {
    expect(() => parseTokenResponse({ token_type: 'Bearer', expires_in: 900 })).toThrow(
      TokenResponseParseError
    )
    expect(() => parseTokenResponse({ ...tokenResponse, refresh_token: 123 })).toThrow(
      TokenResponseParseError
    )
    expect(() => parseTokenResponse('not an object')).toThrow(TokenResponseParseError)
  })

  it('rejects a successful response whose body is not JSON', async () => {
    serveDiscovery()
    server.use(http.post(TOKEN_ENDPOINT, () => HttpResponse.text('not json')))

    await expect(
      buildAuth().tokenClient.platformToken({ audience: 'factorial-backend' })
    ).rejects.toThrow(TokenResponseParseError)
  })

  it('parses all optional response fields and treats null as absent', () => {
    expect(
      parseTokenResponse({
        ...tokenResponse,
        refresh_token: 'refresh-token',
        created_at: 1_700_000_000,
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      })
    ).toMatchObject({
      refreshToken: 'refresh-token',
      createdAt: 1_700_000_000,
      issuedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
    })
    expect(
      parseTokenResponse({
        ...tokenResponse,
        scope: null,
        refresh_token: null,
        created_at: null,
        issued_token_type: null,
      })
    ).toMatchObject({
      scope: undefined,
      refreshToken: undefined,
      createdAt: undefined,
      issuedTokenType: undefined,
    })
  })

  it('does not expose submitted credentials in request errors', async () => {
    serveDiscovery()
    server.use(http.post(TOKEN_ENDPOINT, () => HttpResponse.text('failure', { status: 500 })))

    const error = await buildAuth()
      .tokenClient.delegatedToken({
        subjectToken: 'sensitive-subject-token',
        audience: 'factorial-backend',
      })
      .catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(TokenRequestError)
    expect((error as Error).message).not.toContain('sensitive-subject-token')
    expect((error as Error).message).not.toContain('client-secret')
  })

  it('exposes the structured OAuth error without requiring message parsing', async () => {
    serveDiscovery()
    server.use(
      http.post(TOKEN_ENDPOINT, () =>
        HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Refresh token is invalid' },
          { status: 400 }
        )
      )
    )

    const error = await buildAuth()
      .tokenClient.refreshToken('expired-refresh-token')
      .catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(TokenRequestError)
    expect(error).toMatchObject({ oauthError: 'invalid_grant', status: 400 })
  })
})
