import { type CryptoKey, type JWK, SignJWT, exportJWK, generateKeyPair } from 'jose'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  ConfigurationError,
  OAuthInvalidGrantError,
  OAuthRequestError,
  OAuthTokenResponseError,
} from '@/auth/errors'
import { FactorialAuth } from '@/auth/factorial-auth'

const ISSUER = 'https://factorial-id.example.com'
const AUDIENCE = 'factorial'
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`
const TOKEN_URL = `${ISSUER}/oauth/token`
const REVOCATION_URL = `${ISSUER}/oauth/revoke`
const NOW = Math.floor(Date.now() / 1000)

async function makeKey(): Promise<{ privateKey: CryptoKey; jwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'kid-1', alg: 'ES256', use: 'sig' }
  return { privateKey, jwk }
}

function signAccessToken(privateKey: CryptoKey): Promise<string> {
  return new SignJWT({
    iss: ISSUER,
    sub: 'user-1',
    aud: AUDIENCE,
    iat: NOW,
    exp: NOW + 3600,
    jti: 'jti-1',
    cid: '5',
    eid: '20',
    cell: 'development',
    client_id: 'one-runtime',
    act: { sub: 'one-runtime' },
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'kid-1' })
    .sign(privateKey)
}

function buildAuth(): FactorialAuth {
  return new FactorialAuth({ oidcDiscoveryUrl: DISCOVERY_URL, audience: AUDIENCE })
}

function serveDiscovery(jwk: JWK, onDiscovery?: () => void): void {
  server.use(
    http.get(DISCOVERY_URL, () => {
      onDiscovery?.()
      return HttpResponse.json({
        issuer: ISSUER,
        jwks_uri: JWKS_URL,
        token_endpoint: TOKEN_URL,
        revocation_endpoint: REVOCATION_URL,
      })
    }),
    http.get(JWKS_URL, () => HttpResponse.json({ keys: [jwk] }))
  )
}

const server = setupServer()

describe('FactorialOAuthClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('exchanges a subject token and returns verified typed claims', async () => {
    const { privateKey, jwk } = await makeKey()
    const accessToken = await signAccessToken(privateKey)
    let discoveryCalls = 0
    let submitted: Record<string, string> = {}
    serveDiscovery(jwk, () => {
      discoveryCalls += 1
    })
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json({
          access_token: accessToken,
          refresh_token: 'refresh-b',
          expires_in: 3600,
          token_type: 'Bearer',
        })
      })
    )

    const auth = buildAuth()
    const oauth = auth.createOAuthClient({ clientId: 'one-runtime', clientSecret: 'secret' })
    const grant = await oauth.exchangeToken('token-a')

    expect(submitted).toMatchObject({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'token-a',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      client_id: 'one-runtime',
      client_secret: 'secret',
    })
    expect(grant.refreshToken).toBe('refresh-b')
    expect(grant.expiresInSeconds).toBe(3600)
    expect(grant.claims.client_id).toBe('one-runtime')
    expect(grant.claims.act).toEqual({ sub: 'one-runtime' })
    expect(discoveryCalls).toBe(1)
  })

  it('refreshes a grant and preserves an unrotated refresh token', async () => {
    const { privateKey, jwk } = await makeKey()
    const accessToken = await signAccessToken(privateKey)
    let submitted: Record<string, string> = {}
    serveDiscovery(jwk)
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return HttpResponse.json({ access_token: accessToken, expires_in: 900 })
      })
    )

    const oauth = buildAuth().createOAuthClient({ clientId: 'one-runtime', clientSecret: 'secret' })
    const grant = await oauth.refreshToken('refresh-b')

    expect(submitted).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-b' })
    expect(grant.refreshToken).toBe('refresh-b')
  })

  it('maps invalid_grant without exposing submitted credentials', async () => {
    const { jwk } = await makeKey()
    serveDiscovery(jwk)
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }))
    )

    const oauth = buildAuth().createOAuthClient({ clientId: 'one-runtime', clientSecret: 'secret' })
    const error = await oauth.refreshToken('refresh-b').catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(OAuthInvalidGrantError)
    expect((error as Error).message).not.toContain('secret')
    expect((error as Error).message).not.toContain('refresh-b')
  })

  it('rejects malformed and unverifiable successful token responses', async () => {
    const { jwk } = await makeKey()
    serveDiscovery(jwk)
    server.use(http.post(TOKEN_URL, () => HttpResponse.json({ access_token: 'not-a-jwt' })))

    const oauth = buildAuth().createOAuthClient({ clientId: 'one-runtime', clientSecret: 'secret' })
    await expect(oauth.exchangeToken('token-a')).rejects.toThrow(OAuthTokenResponseError)
  })

  it('revokes a token and accepts an empty success response', async () => {
    const { jwk } = await makeKey()
    let submitted: Record<string, string> = {}
    serveDiscovery(jwk)
    server.use(
      http.post(REVOCATION_URL, async ({ request }) => {
        submitted = Object.fromEntries(new URLSearchParams(await request.text()))
        return new HttpResponse(null, { status: 200 })
      })
    )

    const oauth = buildAuth().createOAuthClient({ clientId: 'one-runtime', clientSecret: 'secret' })
    await oauth.revokeToken('refresh-b')

    expect(submitted).toMatchObject({
      token: 'refresh-b',
      token_type_hint: 'refresh_token',
      client_id: 'one-runtime',
    })
  })

  it('requires configured client credentials and a discovered token endpoint', async () => {
    expect(() => buildAuth().createOAuthClient({ clientId: '', clientSecret: '' })).toThrow(
      ConfigurationError
    )

    const { jwk } = await makeKey()
    server.use(
      http.get(DISCOVERY_URL, () => HttpResponse.json({ issuer: ISSUER, jwks_uri: JWKS_URL })),
      http.get(JWKS_URL, () => HttpResponse.json({ keys: [jwk] }))
    )
    const oauth = buildAuth().createOAuthClient({ clientId: 'one-runtime', clientSecret: 'secret' })

    await expect(oauth.exchangeToken('token-a')).rejects.toThrow(OAuthRequestError)
  })
})
