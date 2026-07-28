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

  it('throws HttpError carrying the status and parsed JSON body on a non-2xx status', async () => {
    server.use(
      http.get(ENDPOINT, () => HttpResponse.json({ error: 'invalid_target' }, { status: 400 }))
    )

    const error = await fetchJson(ENDPOINT, 5000).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 400, body: { error: 'invalid_target' } })
  })

  it('leaves the body undefined when a non-2xx response is not JSON', async () => {
    server.use(http.get(ENDPOINT, () => new HttpResponse('failure', { status: 500 })))

    const error = await fetchJson(ENDPOINT, 5000).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, body: undefined })
  })

  it('passes the request init through to fetch', async () => {
    let method = ''
    let submittedBody = ''
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        method = request.method
        submittedBody = await request.text()
        return HttpResponse.json({ ok: true })
      })
    )

    await fetchJson(ENDPOINT, 5000, { method: 'POST', body: 'a=1' })

    expect(method).toBe('POST')
    expect(submittedBody).toBe('a=1')
  })

  it('does not follow redirects: a 3xx surfaces as HttpError with its status', async () => {
    server.use(
      http.get(ENDPOINT, () =>
        HttpResponse.text(null, {
          status: 307,
          headers: { Location: 'https://elsewhere.example.com/data' },
        })
      )
    )

    const error = await fetchJson(ENDPOINT, 5000).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 307 })
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
