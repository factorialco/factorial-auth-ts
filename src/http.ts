/**
 * Fetches a URL's body as text, bounded by a single `AbortController` timeout.
 *
 * Uses only web-standard APIs (`fetch`, `AbortController`, `URL`) so it runs in
 * Node and edge runtimes. Throws a generic `Error` on invalid scheme, network
 * failure, timeout, or non-2xx status; callers wrap it into a domain-specific
 * fetch error.
 */
export async function fetchText(url: string, timeoutMs: number): Promise<string> {
  assertHttpUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request to ${url} failed with status ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }
}
