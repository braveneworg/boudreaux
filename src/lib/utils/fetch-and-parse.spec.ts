/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { fetchAndParse, parseResponse, ResponseValidationError } from './fetch-and-parse';

const schema = z.object({ id: z.string(), count: z.number() });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAndParse', () => {
  it('returns the schema-parsed body on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a', count: 2 }) })
    );

    await expect(fetchAndParse('/api/thing', schema)).resolves.toEqual({ id: 'a', count: 2 });
  });

  it('forwards the abort signal and cache mode to fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'a', count: 2 }) });
    vi.stubGlobal('fetch', fetchMock);
    const { signal } = new AbortController();

    await fetchAndParse('/api/thing', schema, { signal, cache: 'no-store' });

    expect(fetchMock).toHaveBeenCalledWith('/api/thing', { signal, cache: 'no-store' });
  });

  it('omits the cache option when none is provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ id: 'a', count: 2 }) });
    vi.stubGlobal('fetch', fetchMock);
    const { signal } = new AbortController();

    await fetchAndParse('/api/thing', schema, { signal });

    expect(fetchMock).toHaveBeenCalledWith('/api/thing', { signal });
  });

  it('throws the provided error message on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(
      fetchAndParse('/api/thing', schema, { errorMessage: 'Failed to fetch thing' })
    ).rejects.toThrow('Failed to fetch thing');
  });

  it('throws a default error message when none is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchAndParse('/api/thing', schema)).rejects.toThrow('Request failed');
  });

  it('throws a descriptive error naming the endpoint when the body fails validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) })
    );

    await expect(fetchAndParse('/api/thing', schema)).rejects.toThrow(
      'Invalid response from /api/thing'
    );
  });
});

describe('fetchAndParse — fallbackByStatus', () => {
  it('returns the mapped fallback instead of throwing on a matching status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      fetchAndParse('/api/thing', schema, { fallbackByStatus: { 404: null } })
    ).resolves.toBeNull();
  });

  it('maps a status other than 404 just as readily', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(
      fetchAndParse('/api/thing', schema, { fallbackByStatus: { 401: null } })
    ).resolves.toBeNull();
  });

  it('maps several statuses from one call', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(
      fetchAndParse('/api/thing', schema, { fallbackByStatus: { 401: null, 403: null } })
    ).resolves.toBeNull();
  });

  it('throws for an unmapped status even when other statuses are mapped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(
      fetchAndParse('/api/thing', schema, {
        fallbackByStatus: { 404: null },
        errorMessage: 'Failed to fetch thing',
      })
    ).rejects.toThrow('Failed to fetch thing');
  });

  it('does not consult the map on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'a', count: 2 }) })
    );

    await expect(
      fetchAndParse('/api/thing', schema, { fallbackByStatus: { 200: null } })
    ).resolves.toEqual({ id: 'a', count: 2 });
  });

  it('returns a non-null fallback value when one is mapped', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      fetchAndParse('/api/things', z.array(schema), { fallbackByStatus: { 404: [] } })
    ).resolves.toEqual([]);
  });

  // A fallback of `undefined` must be distinguishable from an absent key, so the
  // lookup tests key presence rather than truthiness of the mapped value.
  it('honours an explicitly-mapped undefined fallback rather than throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      fetchAndParse('/api/thing', schema, { fallbackByStatus: { 404: undefined } })
    ).resolves.toBeUndefined();
  });
});

describe('parseResponse', () => {
  it('returns the schema-parsed body when valid', () => {
    expect(parseResponse('/api/thing', schema, { id: 'a', count: 2 })).toEqual({
      id: 'a',
      count: 2,
    });
  });

  it('throws an error naming the endpoint and the failing field on mismatch', () => {
    expect(() => parseResponse('/api/thing', schema, { id: 'a' })).toThrow(
      /Invalid response from \/api\/thing/
    );
  });

  it('throws a ResponseValidationError on mismatch', () => {
    expect(() => parseResponse('/api/thing', schema, { id: 'a' })).toThrow(ResponseValidationError);
  });

  it('exposes the failing endpoint url on the thrown error', () => {
    let caught: unknown;
    try {
      parseResponse('/api/thing', schema, { id: 'a' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ name: 'ResponseValidationError', url: '/api/thing' });
  });
});
