interface CacheEntry<T> {
  value: T;
  freshUntil: number;
  staleUntil: number;
}

/**
 * In-memory cache with a dual TTL: a value is served directly while fresh, and
 * once past the fresh window it is refetched. If a refetch fails but the value
 * is still within the (longer) stale window, the stale value is served instead
 * of propagating the error. Concurrent refreshes are deduped into a single
 * in-flight fetch (the analog of the gem's `Mutex`).
 */
export class TtlCache<T> {
  private entry: CacheEntry<T> | undefined;
  private inFlight: Promise<T> | undefined;

  constructor(
    private readonly fetcher: () => Promise<T>,
    private readonly freshTtlMs: number,
    private readonly staleTtlMs: number,
  ) {}

  /** Returns the fresh cached value, or refreshes (serving stale on failure). */
  async get(): Promise<T> {
    if (this.entry !== undefined && Date.now() < this.entry.freshUntil) {
      return this.entry.value;
    }
    return this.refresh();
  }

  /** Forces a refetch, deduping concurrent callers into one in-flight fetch. */
  async refresh(): Promise<T> {
    if (this.inFlight !== undefined) {
      return this.inFlight;
    }

    this.inFlight = this.fetchAndStore();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  private async fetchAndStore(): Promise<T> {
    try {
      const value = await this.fetcher();
      const now = Date.now();
      this.entry = { value, freshUntil: now + this.freshTtlMs, staleUntil: now + this.staleTtlMs };
      return value;
    } catch (error) {
      if (this.entry !== undefined && Date.now() < this.entry.staleUntil) {
        return this.entry.value;
      }
      throw error;
    }
  }
}
