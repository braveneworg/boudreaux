/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RETRY_AFTER_MAX_MS, fetchWithRetry, sleep } from './http.js';

const ok = (): Response => new Response('ok', { status: 200 });
const status = (code: number, headers?: Record<string, string>): Response =>
  new Response('err', { status: code, headers });

const noSleep = async (): Promise<void> => {};

describe('fetchWithRetry', () => {
  it('returns the OK response without retrying', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok());

    const response = await fetchWithRetry('https://x', {}, { fetchFn, sleep: noSleep });

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on 503 and returns the eventual OK response', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok());

    const response = await fetchWithRetry('https://x', {}, { fetchFn, sleep: noSleep });

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries on 429 (rate limited) before succeeding', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(status(429)).mockResolvedValueOnce(ok());

    const response = await fetchWithRetry('https://x', {}, { fetchFn, sleep: noSleep });

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('honors a Retry-After header for the backoff delay', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(status(503, { 'retry-after': '2' }))
      .mockResolvedValueOnce(ok());

    await fetchWithRetry('https://x', {}, { fetchFn, sleep: sleepFn });

    expect(sleepFn).toHaveBeenCalledWith(2000);
  });

  it('passes a small Retry-After header through verbatim', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(status(429, { 'retry-after': '5' }))
      .mockResolvedValueOnce(ok());

    await fetchWithRetry('https://x', {}, { fetchFn, sleep: sleepFn });

    // 5 seconds < RETRY_AFTER_MAX_MS → passes through as-is
    expect(sleepFn).toHaveBeenCalledWith(5000);
  });

  it('clamps a large Retry-After header to RETRY_AFTER_MAX_MS', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(status(429, { 'retry-after': '300' }))
      .mockResolvedValueOnce(ok());

    await fetchWithRetry('https://x', {}, { fetchFn, sleep: sleepFn });

    // 300s = 300_000ms exceeds the cap; must be clamped to RETRY_AFTER_MAX_MS
    expect(sleepFn).toHaveBeenCalledWith(RETRY_AFTER_MAX_MS);
    expect(sleepFn).not.toHaveBeenCalledWith(300_000);
  });

  it('does not clamp the exponential-backoff path (no Retry-After header)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValueOnce(status(429)).mockResolvedValueOnce(ok());

    // baseDelayMs=500, attempt 0 → 500 * 2^0 = 500ms (well under cap)
    await fetchWithRetry('https://x', {}, { fetchFn, sleep: sleepFn, baseDelayMs: 500 });

    expect(sleepFn).toHaveBeenCalledWith(500);
  });

  it('does not retry a non-retryable status and returns it', async () => {
    const fetchFn = vi.fn().mockResolvedValue(status(404));

    const response = await fetchWithRetry('https://x', {}, { fetchFn, sleep: noSleep });

    expect(response.status).toBe(404);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns the last non-OK response after exhausting retries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(status(503));

    const response = await fetchWithRetry('https://x', {}, { fetchFn, sleep: noSleep, retries: 2 });

    expect(response.status).toBe(503);
    // initial attempt + 2 retries
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});
