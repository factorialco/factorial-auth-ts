/** A transport-level failure: bad URL/scheme, network error, timeout, or non-2xx status. */
export class HttpError extends Error {
  name = 'HttpError'

  /** HTTP status of a non-2xx response; absent for transport failures. */
  readonly status?: number
  /** Parsed JSON body of a non-2xx response, when the body was valid JSON. */
  readonly body?: unknown

  constructor(message: string, options?: ErrorOptions & { status?: number; body?: unknown }) {
    super(message, options)
    this.status = options?.status
    this.body = options?.body
  }
}

/** The response body could not be parsed as JSON. */
export class HttpParseError extends Error {
  name = 'HttpParseError'
}

/**
 * Performs an HTTP request and parses the response body as JSON, bounded by a
 * single `AbortController` timeout. Uses only web-standard APIs (`fetch`,
 * `AbortController`, `URL`) so it runs in Node and edge runtimes.
 *
 * Throws {@link HttpError} for transport failures and non-2xx statuses (carrying
 * the status and the parsed JSON error body when present), and {@link HttpParseError}
 * when a successful body is not valid JSON, so callers can distinguish "couldn't
 * reach it" from "it returned garbage". Returns the parsed value as `unknown` —
 * callers validate its shape.
 */
export async function fetchJson(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<unknown> {
  assertHttpUrl(url)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  let body: string
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
    body = await response.text()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(`Request to ${url} timed out after ${timeoutMs}ms`, { cause: error })
    }
    throw new HttpError(`Request to ${url} failed`, { cause: error })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new HttpError(`Request to ${url} failed with status ${response.status}`, {
      status: response.status,
      body: tryParseJson(body),
    })
  }

  try {
    const parsed: unknown = JSON.parse(body)
    return parsed
  } catch (error) {
    throw new HttpParseError(`Response from ${url} was not valid JSON`, { cause: error })
  }
}

function tryParseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
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
