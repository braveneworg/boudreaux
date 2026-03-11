/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cache, withCache } from './simple-cache';

// ---------------------------------------------------------------------------
// SimpleCache singleton: core method tests
// ---------------------------------------------------------------------------
describe('SimpleCache (singleton: cache)', () => {
  beforeEach(() => {
    cache.clear();
  });

  // -------------------------------------------------------------------------
  describe('get()', () => {
    it('returns null for a missing key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('returns the cached string value for an existing key', () => {
      cache.set('key', 'hello');
      expect(cache.get('key')).toBe('hello');
    });

    it('returns cached numeric values with the correct type', () => {
      cache.set('num', 42);
      expect(cache.get<number>('num')).toBe(42);
    });

    it('returns cached object values by reference', () => {
      const obj = { id: 1, name: 'test' };
      cache.set('obj', obj);
      expect(cache.get('obj')).toEqual({ id: 1, name: 'test' });
    });

    it('returns cached array values', () => {
      const arr = [1, 2, 3];
      cache.set('arr', arr);
      expect(cache.get('arr')).toEqual([1, 2, 3]);
    });

    it('returns null for a key that was never set', () => {
      cache.set('key-a', 'value');
      expect(cache.get('key-b')).toBeNull();
    });

    it('returns null for a boolean false value stored (stored but get returns false via data)', () => {
      cache.set('bool', false);
      // false is stored and returned; it is falsy but not null
      expect(cache.get<boolean>('bool')).toBe(false);
    });

    describe('TTL expiry', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('returns null when the TTL has expired', () => {
        cache.set('expiring', 'data', 10); // 10-second TTL
        vi.advanceTimersByTime(11_000); // advance 11 seconds
        expect(cache.get('expiring')).toBeNull();
      });

      it('removes the expired entry from the internal map on access', () => {
        cache.set('expiring', 'data', 10);
        vi.advanceTimersByTime(11_000);
        cache.get('expiring'); // triggers in-line delete
        expect(cache.getStats().keys).not.toContain('expiring');
      });

      it('returns the cached value when still within TTL', () => {
        cache.set('live', 'data', 10);
        vi.advanceTimersByTime(9_000); // only 9 seconds elapsed
        expect(cache.get('live')).toBe('data');
      });

      it('returns null just past the expiry boundary (strictly greater than)', () => {
        cache.set('boundary', 'data', 10);
        vi.advanceTimersByTime(10_001); // 1ms past TTL
        expect(cache.get('boundary')).toBeNull();
      });

      it('returns data at exactly one millisecond before expiry', () => {
        cache.set('almost', 'data', 10);
        vi.advanceTimersByTime(9_999); // 1ms before 10s TTL
        expect(cache.get('almost')).toBe('data');
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('set()', () => {
    it('stores a string value retrievable by get()', () => {
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });

    it('stores a numeric value', () => {
      cache.set('num', 99);
      expect(cache.get<number>('num')).toBe(99);
    });

    it('stores an object value', () => {
      cache.set('obj', { a: 1 });
      expect(cache.get('obj')).toEqual({ a: 1 });
    });

    it('records the entry in getStats() immediately after set()', () => {
      cache.set('nullval', null);
      expect(cache.getStats().keys).toContain('nullval');
    });

    it('overwrites an existing entry value', () => {
      cache.set('key', 'original');
      cache.set('key', 'updated');
      expect(cache.get('key')).toBe('updated');
    });

    describe('TTL defaults and custom durations', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('uses a default TTL of 3600 seconds when none is supplied', () => {
        cache.set('key', 'data');
        vi.advanceTimersByTime(3_599_000); // 3599s — still within TTL
        expect(cache.get('key')).toBe('data');
      });

      it('expires the entry after the default 3600-second TTL', () => {
        cache.set('key', 'data');
        vi.advanceTimersByTime(3_601_000); // 1s past default TTL
        expect(cache.get('key')).toBeNull();
      });

      it('respects a custom TTL of 1 second', () => {
        cache.set('short', 'data', 1);
        vi.advanceTimersByTime(2_000);
        expect(cache.get('short')).toBeNull();
      });

      it('respects a custom TTL of 7200 seconds', () => {
        cache.set('long', 'data', 7200);
        vi.advanceTimersByTime(7_199_000);
        expect(cache.get('long')).toBe('data');
      });

      it('overwrites the TTL when the same key is set again', () => {
        cache.set('key', 'value', 5); // 5-second TTL
        cache.set('key', 'value', 60); // overwrite with 60-second TTL
        vi.advanceTimersByTime(6_000); // past original 5s TTL
        expect(cache.get('key')).toBe('value'); // still valid under new 60s TTL
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('delete()', () => {
    it('removes an existing entry so get() returns null', () => {
      cache.set('key', 'value');
      cache.delete('key');
      expect(cache.get('key')).toBeNull();
    });

    it('removes the key from getStats().keys', () => {
      cache.set('key', 'value');
      cache.delete('key');
      expect(cache.getStats().keys).not.toContain('key');
    });

    it('is a no-op when the key does not exist and does not throw', () => {
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });

    it('only removes the specified key, leaving sibling entries intact', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.delete('a');
      expect(cache.get('a')).toBeNull();
      expect(cache.get<number>('b')).toBe(2);
    });

    it('reduces size by 1 in getStats()', () => {
      cache.set('x', 1);
      cache.set('y', 2);
      cache.delete('x');
      expect(cache.getStats().size).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('clear()', () => {
    it('removes all entries so getStats().size is 0', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    it('makes all previously set keys return null after clear()', () => {
      cache.set('x', 'value');
      cache.clear();
      expect(cache.get('x')).toBeNull();
    });

    it('works on an already-empty cache without throwing', () => {
      expect(() => cache.clear()).not.toThrow();
    });

    it('allows new entries to be stored after clear()', () => {
      cache.set('old', 'data');
      cache.clear();
      cache.set('new', 'fresh');
      expect(cache.get('new')).toBe('fresh');
      expect(cache.get('old')).toBeNull();
    });

    it('resets getStats() to empty keys array', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.getStats()).toEqual({ size: 0, keys: [] });
    });
  });

  // -------------------------------------------------------------------------
  describe('getStats()', () => {
    it('returns size 0 and empty keys array for an empty cache', () => {
      expect(cache.getStats()).toEqual({ size: 0, keys: [] });
    });

    it('returns correct size after adding entries', () => {
      cache.set('key1', 'a');
      cache.set('key2', 'b');
      expect(cache.getStats().size).toBe(2);
    });

    it('returns all current keys', () => {
      cache.set('alpha', 1);
      cache.set('beta', 2);
      cache.set('gamma', 3);
      const { keys } = cache.getStats();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
      expect(keys).toContain('gamma');
    });

    it('reflects state after a delete()', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.delete('a');
      const { size, keys } = cache.getStats();
      expect(size).toBe(1);
      expect(keys).toEqual(['b']);
    });

    it('reflects state after clear()', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.getStats()).toEqual({ size: 0, keys: [] });
    });

    it('still reports expired keys that have not been accessed or cleaned up yet', () => {
      vi.useFakeTimers();
      cache.set('expiring', 'data', 1);
      vi.advanceTimersByTime(2_000); // TTL expired but cleanup has not run
      // Entry remains in the internal map until get() or cleanup() removes it
      expect(cache.getStats().keys).toContain('expiring');
      vi.useRealTimers();
    });

    it('size reflects the count of entries including expired-but-unvisited ones', () => {
      vi.useFakeTimers();
      cache.set('a', 1, 1);
      cache.set('b', 2, 3600);
      vi.advanceTimersByTime(2_000);
      // 'a' is expired but not yet evicted; 'b' is live
      expect(cache.getStats().size).toBe(2);
      vi.useRealTimers();
    });
  });
});

// ---------------------------------------------------------------------------
// destroy() — uses fresh module instances to avoid mutating the shared singleton
// ---------------------------------------------------------------------------
describe('SimpleCache destroy()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls clearInterval to stop the cleanup interval', async () => {
    const { cache: freshCache } = await import('./simple-cache');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    freshCache.destroy();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('is safe to call multiple times without throwing', async () => {
    const { cache: freshCache } = await import('./simple-cache');
    expect(() => {
      freshCache.destroy();
      freshCache.destroy();
    }).not.toThrow();
  });

  it('does not call clearInterval on subsequent destroy() calls (interval is already null)', async () => {
    const { cache: freshCache } = await import('./simple-cache');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    freshCache.destroy(); // first call — clears interval, sets cleanupInterval to null
    clearIntervalSpy.mockClear();
    freshCache.destroy(); // second call — cleanupInterval is null, so clearInterval is skipped
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// cleanup() (private) — exercised indirectly via the 5-minute setInterval
// Uses dynamic imports so the module's setInterval is captured by fake timers
// ---------------------------------------------------------------------------
describe('SimpleCache private cleanup() via 5-minute interval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes expired entries from the cache when the interval fires', async () => {
    const { cache: freshCache } = await import('./simple-cache');

    freshCache.set('expired-a', 'value1', 1); // 1-second TTL
    freshCache.set('expired-b', 'value2', 30); // 30-second TTL
    freshCache.set('live', 'value3', 7200); // 2-hour TTL

    // Advance past both short-lived TTLs but not the long one
    vi.advanceTimersByTime(31_000);

    // Fire the 5-minute cleanup interval
    vi.advanceTimersByTime(5 * 60 * 1000);

    const { keys } = freshCache.getStats();
    expect(keys).not.toContain('expired-a');
    expect(keys).not.toContain('expired-b');
    expect(keys).toContain('live');

    freshCache.destroy();
  });

  it('leaves all entries intact when none have expired at cleanup time', async () => {
    const { cache: freshCache } = await import('./simple-cache');

    freshCache.set('long-lived-a', 'value1', 7200);
    freshCache.set('long-lived-b', 'value2', 3600);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1); // fire cleanup

    const { size, keys } = freshCache.getStats();
    expect(size).toBe(2);
    expect(keys).toContain('long-lived-a');
    expect(keys).toContain('long-lived-b');

    freshCache.destroy();
  });

  it('handles an empty cache during cleanup without throwing', async () => {
    const { cache: freshCache } = await import('./simple-cache');

    expect(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    }).not.toThrow();

    freshCache.destroy();
  });

  it('fires cleanup repeatedly on each 5-minute interval', async () => {
    const { cache: freshCache } = await import('./simple-cache');

    // First interval: one entry expires
    freshCache.set('round-1', 'data', 1);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(5 * 60 * 1000); // first cleanup
    expect(freshCache.getStats().keys).not.toContain('round-1');

    // Second interval: another entry expires
    freshCache.set('round-2', 'data', 1);
    vi.advanceTimersByTime(2_000);
    vi.advanceTimersByTime(5 * 60 * 1000); // second cleanup
    expect(freshCache.getStats().keys).not.toContain('round-2');

    freshCache.destroy();
  });
});

// ---------------------------------------------------------------------------
// withCache() helper
// ---------------------------------------------------------------------------
describe('withCache()', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('calls fn on a cache miss and returns the result', async () => {
    const fn = vi.fn().mockResolvedValue('fresh-data');
    const result = await withCache('miss-key', fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe('fresh-data');
  });

  it('returns the cached value on a hit without calling fn again', async () => {
    const fn = vi.fn().mockResolvedValue('cached-data');
    await withCache('hit-key', fn); // first call — cache miss
    const result = await withCache('hit-key', fn); // second call — cache hit
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe('cached-data');
  });

  it('stores the result in the cache after a miss', async () => {
    const fn = vi.fn().mockResolvedValue('stored');
    await withCache('store-key', fn);
    expect(cache.get('store-key')).toBe('stored');
  });

  it('returns a pre-populated cache value without calling fn', async () => {
    cache.set('prepopulated', 'pre-existing');
    const fn = vi.fn().mockResolvedValue('new-value');
    const result = await withCache('prepopulated', fn);
    expect(result).toBe('pre-existing');
    expect(fn).not.toHaveBeenCalled();
  });

  it('uses separate cache entries for different keys', async () => {
    const fn1 = vi.fn().mockResolvedValue('value-1');
    const fn2 = vi.fn().mockResolvedValue('value-2');
    const result1 = await withCache('key-1', fn1);
    const result2 = await withCache('key-2', fn2);
    expect(result1).toBe('value-1');
    expect(result2).toBe('value-2');
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('works with object return values', async () => {
    const data = { id: 1, name: 'Artist' };
    const fn = vi.fn().mockResolvedValue(data);
    const result = await withCache<typeof data>('obj-key', fn);
    expect(result).toEqual({ id: 1, name: 'Artist' });
  });

  it('works with array return values', async () => {
    const data = ['a', 'b', 'c'];
    const fn = vi.fn().mockResolvedValue(data);
    const result = await withCache('arr-key', fn);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('propagates errors thrown by fn', async () => {
    const error = new Error('fn failed');
    const fn = vi.fn().mockRejectedValue(error);
    await expect(withCache('error-key', fn)).rejects.toThrow('fn failed');
  });

  it('does not cache anything when fn throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fn error'));
    await expect(withCache('no-cache-key', fn)).rejects.toThrow();
    expect(cache.get('no-cache-key')).toBeNull();
  });

  it('calls fn again on the next invocation after a prior error (errors are not cached)', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('transient error'));
    const successFn = vi.fn().mockResolvedValue('success');

    await expect(withCache('retry-key', failingFn)).rejects.toThrow();
    const result = await withCache('retry-key', successFn);

    expect(result).toBe('success');
    expect(successFn).toHaveBeenCalledOnce();
  });

  describe('TTL with withCache()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('uses the default TTL of 3600 seconds', async () => {
      const fn = vi.fn().mockResolvedValue('data');
      await withCache('ttl-default', fn);

      vi.advanceTimersByTime(3_599_000); // 3599s — still within default TTL
      expect(cache.get('ttl-default')).toBe('data');

      vi.advanceTimersByTime(2_000); // now 3601s — past default TTL
      expect(cache.get('ttl-default')).toBeNull();
    });

    it('respects a custom TTL passed to withCache()', async () => {
      const fn = vi.fn().mockResolvedValue('short-data');
      await withCache('custom-ttl', fn, 5); // 5-second TTL

      vi.advanceTimersByTime(4_000);
      expect(cache.get('custom-ttl')).toBe('short-data'); // still cached

      vi.advanceTimersByTime(2_000); // now 6s — past 5s TTL
      expect(cache.get('custom-ttl')).toBeNull();
    });

    it('calls fn again after the cached value expires', async () => {
      const fn = vi.fn().mockResolvedValue('value');
      await withCache('expiry-retry', fn, 2); // 2-second TTL

      vi.advanceTimersByTime(3_000); // expire the cache entry

      const fn2 = vi.fn().mockResolvedValue('refreshed');
      const result = await withCache('expiry-retry', fn2);

      expect(result).toBe('refreshed');
      expect(fn2).toHaveBeenCalledOnce();
    });
  });
});
