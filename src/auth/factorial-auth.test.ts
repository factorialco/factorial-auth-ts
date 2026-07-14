import {
  type CryptoKey,
  type JWK,
  type JWTPayload,
  SignJWT,
  exportJWK,
  generateKeyPair,
} from 'jose'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ConfigurationError, ExpiredToken } from '@/auth/errors'
import { FactorialAuth } from '@/auth/factorial-auth'

const ISSUER = 'https://factorial-id.example.com'
const AUDIENCE = 'factorial'
const DISCOVERY_URL = 'https://factorial-id.example.com/.well-known/openid-configuration'
const JWKS_URL = 'https://factorial-id.example.com/.well-known/jwks.json'
const NOW = Math.floor(Date.now() / 1000)

async function makeKey(kid: string): Promise<{ privateKey: CryptoKey; jwk: JWK }> {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' }
  return { privateKey, jwk }
}

function signToken(privateKey: CryptoKey, kid: string, payload: JWTPayload): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: 'ES256', kid }).sign(privateKey)
}

function accessPayload(overrides: JWTPayload = {}): JWTPayload {
  return {
    iss: ISSUER,
    sub: 'user-1',
    aud: AUDIENCE,
    iat: NOW,
    exp: NOW + 3600,
    jti: 'jti-1',
    ...overrides,
  }
}

function idPayload(overrides: JWTPayload = {}): JWTPayload {
  return { iss: ISSUER, sub: 'user-1', aud: AUDIENCE, iat: NOW, exp: NOW + 3600, ...overrides }
}

function serve(...keys: JWK[]) {
  server.use(
    http.get(DISCOVERY_URL, () => HttpResponse.json({ issuer: ISSUER, jwks_uri: JWKS_URL })),
    http.get(JWKS_URL, () => HttpResponse.json({ keys }))
  )
}

function buildAuth(): FactorialAuth {
  return new FactorialAuth({ oidcDiscoveryUrl: DISCOVERY_URL, audience: AUDIENCE })
}

const server = setupServer()

describe('FactorialAuth', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('throws ConfigurationError when constructed with invalid config', () => {
    expect(() => new FactorialAuth({ oidcDiscoveryUrl: '', audience: '' })).toThrow(
      ConfigurationError
    )
  })

  it('decodeAccessToken returns typed access-token claims', async () => {
    const { privateKey, jwk } = await makeKey('kid-1')
    serve(jwk)

    const token = await signToken(privateKey, 'kid-1', accessPayload())
    const claims = await buildAuth().decodeAccessToken(token)

    expect(claims.sub).toBe('user-1')
    expect(claims.jti).toBe('jti-1')
  })

  it('decodeIdToken returns typed id-token claims', async () => {
    const { privateKey, jwk } = await makeKey('kid-1')
    serve(jwk)

    const token = await signToken(privateKey, 'kid-1', idPayload({ email: 'user@factorial.co' }))
    const claims = await buildAuth().decodeIdToken(token)

    expect(claims.email).toBe('user@factorial.co')
  })

  it('decodeAccessToken propagates the mapped token error', async () => {
    const { privateKey, jwk } = await makeKey('kid-1')
    serve(jwk)

    const token = await signToken(privateKey, 'kid-1', accessPayload({ exp: NOW - 3600 }))
    await expect(buildAuth().decodeAccessToken(token)).rejects.toThrow(ExpiredToken)
  })

  it('tryDecodeAccessToken returns claims on success', async () => {
    const { privateKey, jwk } = await makeKey('kid-1')
    serve(jwk)

    const token = await signToken(privateKey, 'kid-1', accessPayload())
    const claims = await buildAuth().tryDecodeAccessToken(token)

    expect(claims?.sub).toBe('user-1')
  })

  it('tryDecodeAccessToken returns null on an auth error', async () => {
    const { privateKey, jwk } = await makeKey('kid-1')
    serve(jwk)

    const token = await signToken(privateKey, 'kid-1', accessPayload({ exp: NOW - 3600 }))
    expect(await buildAuth().tryDecodeAccessToken(token)).toBeNull()
  })

  it('tryDecodeIdToken returns null on an auth error', async () => {
    const { privateKey, jwk } = await makeKey('kid-1')
    serve(jwk)

    const token = await signToken(privateKey, 'kid-1', idPayload({ aud: 'someone-else' }))
    expect(await buildAuth().tryDecodeIdToken(token)).toBeNull()
  })

  it('tryDecodeAccessToken re-throws errors that are not auth errors', async () => {
    const auth = buildAuth()
    // Simulate an unexpected (non-AuthError) failure escaping the decoder.
    ;(auth as unknown as { decoder: { decodeAccessToken: () => Promise<never> } }).decoder = {
      decodeAccessToken: () => Promise.reject(new TypeError('unexpected')),
    }

    await expect(auth.tryDecodeAccessToken('token')).rejects.toThrow(TypeError)
  })
})
