/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

vi.mock('server-only', () => ({}));

vi.mock('react', () => ({
  cache: (fn: () => unknown) => fn,
}));

const mockQueryClientInstance = { _mock: true };

vi.mock('@tanstack/react-query', () => {
  class MockQueryClient {
    options: unknown;
    constructor(opts: unknown) {
      this.options = opts;
      Object.assign(this, mockQueryClientInstance);
    }
  }
  return { QueryClient: MockQueryClient };
});

describe('getQueryClient', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns a QueryClient with default cache settings', async () => {
    const { getQueryClient } = await import('@/lib/utils/get-query-client');
    const client = getQueryClient();

    expect(client).toBeDefined();
    expect((client as unknown as { options: unknown }).options).toEqual({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  });

  it('returns a QueryClient with zero cache when NEXT_PUBLIC_DISABLE_QUERY_CACHE is true', async () => {
    vi.stubEnv('NEXT_PUBLIC_DISABLE_QUERY_CACHE', 'true');
    vi.resetModules();

    const { getQueryClient } = await import('@/lib/utils/get-query-client');
    const client = getQueryClient();

    expect((client as unknown as { options: unknown }).options).toEqual({
      defaultOptions: {
        queries: {
          staleTime: 0,
          gcTime: 0,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  });
});
