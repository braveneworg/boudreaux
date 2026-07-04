/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { pooledMap } from './pooled-map';

describe('pooledMap', () => {
  it('preserves input order in the settled results', async () => {
    const results = await pooledMap([30, 10, 20], 2, async (delayMs) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return delayMs;
    });
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([30, 10, 20]);
  });

  it('never runs more than limit tasks concurrently', async () => {
    let inFlight = 0;
    let peak = 0;
    await pooledMap(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      }
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('captures rejections as settled results without aborting the batch', async () => {
    const results = await pooledMap([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
  });

  it('handles an empty input and a limit larger than the input', async () => {
    await expect(pooledMap([], 4, async () => 1)).resolves.toEqual([]);
    const results = await pooledMap([1], 8, async (n) => n);
    expect(results).toHaveLength(1);
  });
});
