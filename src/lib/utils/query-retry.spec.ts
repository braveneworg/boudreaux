/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { HttpError, ResponseValidationError } from './fetch-and-parse';
import { MAX_QUERY_RETRIES, queryRetryDelay, shouldRetryQuery } from './query-retry';

const throttled = (retryAfterMs: number | null = null): HttpError =>
  new HttpError('Request failed', 429, retryAfterMs);

describe('shouldRetryQuery', () => {
  it('allows two retries', () => {
    expect(MAX_QUERY_RETRIES).toBe(2);
  });

  it.each([400, 401, 403, 404, 409, 422])('never retries a %s', (status) => {
    expect(shouldRetryQuery(0, new HttpError('Request failed', status))).toBe(false);
  });

  it('retries a 429 on the first failure', () => {
    expect(shouldRetryQuery(0, throttled())).toBe(true);
  });

  it('retries a 429 on the second failure', () => {
    expect(shouldRetryQuery(1, throttled())).toBe(true);
  });

  it('stops retrying a 429 after two retries', () => {
    expect(shouldRetryQuery(2, throttled())).toBe(false);
  });

  it.each([500, 502, 503, 504])('retries a %s', (status) => {
    expect(shouldRetryQuery(0, new HttpError('Request failed', status))).toBe(true);
  });

  it('retries a network failure (fetch rejects with a TypeError)', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('never retries a response-validation failure', () => {
    expect(shouldRetryQuery(0, new ResponseValidationError('/api/thing', 'issues'))).toBe(false);
  });

  it('never retries a plain Error', () => {
    expect(shouldRetryQuery(0, new Error('Request failed'))).toBe(false);
  });

  it('never retries a non-Error rejection', () => {
    expect(shouldRetryQuery(0, 'nope')).toBe(false);
  });
});

describe('queryRetryDelay', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('honours Retry-After when the error carries one', () => {
    expect(queryRetryDelay(0, throttled(2000))).toBe(2000);
  });

  it('caps a long Retry-After at five seconds', () => {
    expect(queryRetryDelay(0, throttled(60_000))).toBe(5000);
  });

  it('backs off from half a second on the first retry, with jitter', () => {
    expect(queryRetryDelay(0, throttled())).toBe(625);
  });

  it('doubles the backoff on the second retry', () => {
    expect(queryRetryDelay(1, throttled())).toBe(1125);
  });

  it('draws the jitter from Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(queryRetryDelay(0, throttled())).toBe(500);
  });

  it('keeps the jitter under a quarter second', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);

    expect(queryRetryDelay(0, throttled())).toBeLessThan(750);
  });

  it('caps the backoff at five seconds', () => {
    expect(queryRetryDelay(10, throttled())).toBe(5000);
  });

  it('backs off a network failure the same way', () => {
    expect(queryRetryDelay(0, new TypeError('Failed to fetch'))).toBe(625);
  });
});
