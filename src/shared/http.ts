/** A transport-level failure: bad URL/scheme, network error, timeout, or non-2xx status. */
export class HttpError extends Error {
  name = 'HttpError'
}

/** The response body could not be parsed as JSON. */
export class HttpParseError extends Error {
  name = 'HttpParseError'
}

/**
 * Fetches a URL and parses its body as JSON, bounded by a single `AbortController`
 * timeout. Uses only web-standard APIs (`fetch`, `AbortController`, `URL`) so it
 * runs in Node and edge runtimes.
 *
 * Throws {@link HttpError} for transport failures and {@link HttpParseError} when
 * the body is not valid JSON, so callers can distinguish "couldn't reach it" from
 * "it returned garbage". Returns the parsed value as `unknown` — callers validate
 * its shape.
 */
export async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetchText(url, timeoutMs)

  if (!response.ok) {
    throw new HttpError(`Request to ${url} failed with status ${response.status}`)
  }

  try {
    const parsed: unknown = JSON.parse(response.body)
    return parsed
  } catch (error) {
    throw new HttpParseError(`Response from ${url} was not valid JSON`, { cause: error })
  }
}

export type HttpTextResponse = Readonly<{
  ok: boolean
  status: number
  body: string
}>

/**
 * Executes an HTTP request and returns its status and text body. Transport
 * failures throw {@link HttpError}; non-2xx responses are returned so protocol
 * clients can parse their structured error bodies.
 */
export async function fetchText(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<HttpTextResponse> {
  assertHttpUrl(url)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    if (controller.signal.aborted) {
      throw new HttpError(`Request to ${url} timed out after ${timeoutMs}ms`, { cause: error })
    }
    throw new HttpError(`Request to ${url} failed`, { cause: error })
  } finally {
    clearTimeout(timeout)
  }
}

function assertHttpUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new HttpError(`Invalid URL: ${url}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(`Unsupported URL scheme: ${parsed.protocol}`)
  }
}
