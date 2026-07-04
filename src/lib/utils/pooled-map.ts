/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Maps `items` through an async `fn` with at most `limit` calls in flight,
 * returning order-preserving settled results (rejections captured, never
 * thrown). Use for fan-out I/O where unbounded `Promise.all` concurrency
 * would swamp the network or the remote host.
 */
export const pooledMap = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> => {
  const resultMap = new Map<number, PromiseSettledResult<R>>();
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items.at(index);
      if (item === undefined && index >= items.length) break;
      try {
        resultMap.set(index, { status: 'fulfilled', value: await fn(item as T, index) });
      } catch (reason) {
        resultMap.set(index, { status: 'rejected', reason });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

  // Convert the map to an order-preserving array.
  const results: Array<PromiseSettledResult<R>> = [];
  for (let i = 0; i < items.length; i++) {
    const result = resultMap.get(i);
    if (result === undefined) {
      throw new Error(`Unexpectedly missing result at index ${i}`);
    }
    results.push(result);
  }
  return results;
};
