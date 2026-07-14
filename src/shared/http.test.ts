import { HttpResponse, delay, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { HttpError, HttpParseError, fetchJson } from '@/shared/http'

const ENDPOINT = 'https://factorial-id.example.com/data'

const server = setupServer()

describe('fetchJson', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  it('returns the parsed JSON body', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.json({ hello: 'world' })))
    expect(await fetchJson(ENDPOINT, 5000)).toEqual({ hello: 'world' })
  })

  it('throws HttpError on a non-2xx status', async () => {
    server.use(http.get(ENDPOINT, () => new HttpResponse(null, { status: 500 })))
    await expect(fetchJson(ENDPOINT, 5000)).rejects.toThrow(HttpError)
  })

  it('throws HttpError on a network error', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.error()))
    await expect(fetchJson(ENDPOINT, 5000)).rejects.toThrow(HttpError)
  })

  it('throws HttpError (timeout) when the request exceeds the timeout', async () => {
    server.use(
      http.get(ENDPOINT, async () => {
        await delay(50)
        return HttpResponse.json({ ok: true })
      })
    )
    await expect(fetchJson(ENDPOINT, 10)).rejects.toThrow(/timed out/)
  })

  it('throws HttpError for unsupported URL schemes', async () => {
    await expect(fetchJson('ftp://factorial-id.example.com/data', 5000)).rejects.toThrow(HttpError)
  })

  it('throws HttpError for malformed URLs', async () => {
    await expect(fetchJson('not a url', 5000)).rejects.toThrow(HttpError)
  })

  it('throws HttpParseError when the body is not valid JSON', async () => {
    server.use(http.get(ENDPOINT, () => HttpResponse.text('not json')))
    await expect(fetchJson(ENDPOINT, 5000)).rejects.toThrow(HttpParseError)
  })
})
