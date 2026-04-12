/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

vi.mock('server-only', () => ({}));

const mockHeadersGet = vi.fn();
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (...args: unknown[]) => mockHeadersGet(...args),
  }),
}));

vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockHeadersGet.mockReset();
  });

  it('fetches from the internal API URL and returns JSON', async () => {
    const mockData = { tours: [], count: 0 };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { fetchApi } = await import('@/lib/utils/fetch-api');
    const result = await fetchApi('/api/tours');

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/tours', {
      cache: 'no-store',
    });
    expect(result).toEqual(mockData);
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { fetchApi } = await import('@/lib/utils/fetch-api');

    await expect(fetchApi('/api/tours')).rejects.toThrow('API error 500: /api/tours');
  });

  it('forwards cookies when forwardCookies is true', async () => {
    mockHeadersGet.mockReturnValue('session-token=abc123');
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const { fetchApi } = await import('@/lib/utils/fetch-api');
    await fetchApi('/api/user/collection', { forwardCookies: true });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/user/collection', {
      cache: 'no-store',
      headers: { cookie: 'session-token=abc123' },
    });
  });

  it('does not forward cookies header when cookie is null', async () => {
    mockHeadersGet.mockReturnValue(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const { fetchApi } = await import('@/lib/utils/fetch-api');
    await fetchApi('/api/user/collection', { forwardCookies: true });

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/user/collection', {
      cache: 'no-store',
    });
  });

  it('does not forward cookies when forwardCookies is not set', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });

    const { fetchApi } = await import('@/lib/utils/fetch-api');
    await fetchApi('/api/tours');

    expect(mockHeadersGet).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/tours', {
      cache: 'no-store',
    });
  });
});
