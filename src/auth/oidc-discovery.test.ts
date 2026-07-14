import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { validateConfig } from '@/auth/config'
import { OidcDiscoveryFetchError, OidcDiscoveryParseError } from '@/auth/errors'
import { DiscoveryClient } from '@/auth/oidc-discovery'

const DISCOVERY_URL = 'https://factorial-id.example.com/.well-known/openid-configuration'

const validDocument = {
  issuer: 'https://factorial-id.example.com',
  jwks_uri: 'https://factorial-id.example.com/.well-known/jwks.json',
}

function buildClient() {
  return new DiscoveryClient(
    validateConfig({ oidcDiscoveryUrl: DISCOVERY_URL, audience: 'factorial' })
  )
}

const server = setupServer()

describe('DiscoveryClient', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('fetches and parses the discovery document', async () => {
    server.use(http.get(DISCOVERY_URL, () => HttpResponse.json(validDocument)))

    const document = await buildClient().currentDocument()

    expect(document.issuer).toBe(validDocument.issuer)
    expect(document.jwksUri).toBe(validDocument.jwks_uri)
  })

  it('caches the document across calls (one request)', async () => {
    let calls = 0
    server.use(
      http.get(DISCOVERY_URL, () => {
        calls += 1
        return HttpResponse.json(validDocument)
      })
    )

    const client = buildClient()
    await client.currentDocument()
    await client.currentDocument()

    expect(calls).toBe(1)
  })

  it('wraps a non-2xx response as OidcDiscoveryFetchError', async () => {
    server.use(http.get(DISCOVERY_URL, () => new HttpResponse(null, { status: 500 })))
    await expect(buildClient().currentDocument()).rejects.toThrow(OidcDiscoveryFetchError)
  })

  it('wraps a network error as OidcDiscoveryFetchError', async () => {
    server.use(http.get(DISCOVERY_URL, () => HttpResponse.error()))
    await expect(buildClient().currentDocument()).rejects.toThrow(OidcDiscoveryFetchError)
  })

  it('throws OidcDiscoveryParseError on invalid JSON', async () => {
    server.use(http.get(DISCOVERY_URL, () => HttpResponse.text('not json')))
    await expect(buildClient().currentDocument()).rejects.toThrow(OidcDiscoveryParseError)
  })

  it('throws OidcDiscoveryParseError when issuer is missing', async () => {
    server.use(
      http.get(DISCOVERY_URL, () => HttpResponse.json({ jwks_uri: validDocument.jwks_uri }))
    )
    await expect(buildClient().currentDocument()).rejects.toThrow(OidcDiscoveryParseError)
  })

  it('throws OidcDiscoveryParseError when jwks_uri is missing', async () => {
    server.use(http.get(DISCOVERY_URL, () => HttpResponse.json({ issuer: validDocument.issuer })))
    await expect(buildClient().currentDocument()).rejects.toThrow(OidcDiscoveryParseError)
  })
})
