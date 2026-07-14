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
  const body = await fetchBody(url, timeoutMs)

  try {
    const parsed: unknown = JSON.parse(body)
    return parsed
  } catch (error) {
    throw new HttpParseError(`Response from ${url} was not valid JSON`, { cause: error })
  }
}

async function fetchBody(url: string, timeoutMs: number): Promise<string> {
  assertHttpUrl(url)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new HttpError(`Request to ${url} failed with status ${response.status}`)
    }
    return await response.text()
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
