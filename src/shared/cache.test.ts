import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TtlCache } from '@/shared/cache'

const FRESH_MS = 1000
const STALE_MS = 5000

type Fetcher = () => Promise<string>

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches once and serves the cached value while fresh', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue('v1')
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    expect(await cache.get()).toBe('v1')
    expect(await cache.get()).toBe('v1')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refetches after the fresh TTL expires', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    expect(await cache.get()).toBe('v1')
    vi.advanceTimersByTime(FRESH_MS + 1)
    expect(await cache.get()).toBe('v2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('serves the stale value when a refresh fails within the stale window', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce('v1')
      .mockRejectedValue(new Error('boom'))
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    expect(await cache.get()).toBe('v1')
    vi.advanceTimersByTime(FRESH_MS + 1)
    expect(await cache.get()).toBe('v1')
  })

  it('throws when a refresh fails and there is no cached value', async () => {
    const fetcher = vi.fn<Fetcher>().mockRejectedValue(new Error('boom'))
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    await expect(cache.get()).rejects.toThrow('boom')
  })

  it('throws when a refresh fails after the stale window', async () => {
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce('v1')
      .mockRejectedValue(new Error('boom'))
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    expect(await cache.get()).toBe('v1')
    vi.advanceTimersByTime(STALE_MS + 1)
    await expect(cache.get()).rejects.toThrow('boom')
  })

  it('dedupes concurrent refreshes into a single fetch (single-flight)', async () => {
    let resolveFetch!: (value: string) => void
    const fetcher = vi.fn<Fetcher>(
      () =>
        new Promise<string>((resolve) => {
          resolveFetch = resolve
        })
    )
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    const first = cache.get()
    const second = cache.get()
    resolveFetch('v1')

    expect(await first).toBe('v1')
    expect(await second).toBe('v1')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('forces a refetch via refresh() even while fresh', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    const cache = new TtlCache(fetcher, FRESH_MS, STALE_MS)

    expect(await cache.get()).toBe('v1')
    expect(await cache.refresh()).toBe('v2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
