/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { fetchAndParse } from './fetch-and-parse';

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

  it('throws when the response body does not match the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) })
    );

    await expect(fetchAndParse('/api/thing', schema)).rejects.toThrow();
  });
});
