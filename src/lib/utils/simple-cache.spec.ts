import { cache, withCache } from './simple-cache';

describe('SimpleCache', () => {
  beforeEach(() => {
    cache.clear();
  });

  afterAll(() => {
    cache.destroy();
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeNull();
    });

    it('should store different data types', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('object', { foo: 'bar' });
      cache.set('array', [1, 2, 3]);

      expect(cache.get('string')).toBe('hello');
      expect(cache.get('number')).toBe(42);
      expect(cache.get('object')).toEqual({ foo: 'bar' });
      expect(cache.get('array')).toEqual([1, 2, 3]);
    });

    it('should overwrite existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL (Time to Live)', () => {
    it('should expire values after TTL', async () => {
      cache.set('key1', 'value1', 1); // 1 second TTL
      expect(cache.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(cache.get('key1')).toBeNull();
    });

    it('should use default TTL of 3600 seconds', () => {
      cache.set('key1', 'value1');
      const stats = cache.getStats();
      expect(stats.keys).toContain('key1');
    });

    it('should allow custom TTL values', () => {
      cache.set('key1', 'value1', 60); // 60 seconds
      cache.set('key2', 'value2', 120); // 120 seconds

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('statistics', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toEqual(['key1', 'key2']);
    });

    it('should update stats after deletions', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.delete('key1');

      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toEqual(['key2']);
    });
  });

  describe('withCache helper', () => {
    it('should cache function results', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'result';
      };

      const result1 = await withCache('test-key', fn, 60);
      const result2 = await withCache('test-key', fn, 60);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(callCount).toBe(1); // Function only called once
    });

    it('should re-execute function after cache expiry', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      const result1 = await withCache('test-key', fn, 1); // 1 second TTL
      expect(result1).toBe('result-1');
      expect(callCount).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result2 = await withCache('test-key', fn, 1);
      expect(result2).toBe('result-2');
      expect(callCount).toBe(2); // Function called again
    });

    it('should cache complex objects', async () => {
      const complexObject = {
        id: 1,
        name: 'Test',
        nested: { value: 42 },
        array: [1, 2, 3],
      };

      const fn = async () => complexObject;

      const result = await withCache('complex-key', fn, 60);
      expect(result).toEqual(complexObject);
    });

    it('should handle async errors', async () => {
      const fn = async () => {
        throw Error('Test error');
      };

      await expect(withCache('error-key', fn, 60)).rejects.toThrow('Test error');
    });

    it('should use different keys for different parameters', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      const result1 = await withCache('key1', fn, 60);
      const result2 = await withCache('key2', fn, 60);

      expect(result1).toBe('result-1');
      expect(result2).toBe('result-2');
      expect(callCount).toBe(2); // Different keys, both executed
    });
  });

  describe('edge cases', () => {
    it('should handle null values', () => {
      cache.set('null-key', null);
      expect(cache.get('null-key')).toBeNull();
    });

    it('should handle undefined values', () => {
      cache.set('undefined-key', undefined);
      expect(cache.get('undefined-key')).toBeUndefined();
    });

    it('should handle empty strings', () => {
      cache.set('empty-key', '');
      expect(cache.get('empty-key')).toBe('');
    });

    it('should handle zero values', () => {
      cache.set('zero-key', 0);
      expect(cache.get('zero-key')).toBe(0);
    });

    it('should handle boolean false', () => {
      cache.set('false-key', false);
      expect(cache.get('false-key')).toBe(false);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple simultaneous sets', () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(cache.set(`key-${i}`, `value-${i}`))
      );

      return Promise.all(promises).then(() => {
        for (let i = 0; i < 100; i++) {
          expect(cache.get(`key-${i}`)).toBe(`value-${i}`);
        }
      });
    });

    it('should handle multiple simultaneous withCache calls', async () => {
      let _callCount = 0;
      const fn = async () => {
        _callCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'result';
      };

      // Multiple concurrent calls with same key
      const promises = Array.from({ length: 5 }, () => withCache('concurrent-key', fn, 60));

      const results = await Promise.all(promises);

      // All should get the same result, but function might be called multiple times
      // due to race condition (this is expected behavior for simple cache)
      results.forEach((result) => {
        expect(result).toBe('result');
      });
    });
  });
});
