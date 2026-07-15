// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as NextServerModule from 'next/server';
import { NextRequest } from 'next/server';

import { GET } from './route';

// Pass-through admin gate — withAdmin's 401/403 behavior is covered by with-auth.spec.ts.
const { adminComposed } = vi.hoisted(() => ({ adminComposed: { current: false } }));
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: <H>(handler: H): H => {
    adminComposed.current = true;
    return handler;
  },
  withAuth: <H>(handler: H): H => handler,
}));

// Inject a limiter with a mockable check so withRateLimit drives the 429 path.
const limiterCheckMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  producerSearchLimiter: { check: limiterCheckMock },
  PRODUCER_SEARCH_LIMIT: 20,
}));

// ProducerService.search is the seam: route.ts only maps its outcome to a response.
const searchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/producer-service', () => ({
  ProducerService: { search: searchMock },
}));

vi.mock('server-only', () => ({}));

// Give NextResponse.json a real, parseable body (mirrors name-lookup route spec).
vi.mock('next/server', async (importOriginal) => {
  const original = (await importOriginal()) as typeof NextServerModule;
  class MockNextResponse extends Response {
    static json(
      body: unknown,
      init?: { status?: number; statusText?: string; headers?: Record<string, string> }
    ) {
      const headers = new Headers(init?.headers);
      headers.set('content-type', 'application/json');
      return new MockNextResponse(JSON.stringify(body), { ...init, headers });
    }
  }
  return { ...original, NextResponse: MockNextResponse };
});

const dummyContext = { params: Promise.resolve({}) };

const createRequest = (q?: string): NextRequest => {
  const url = new URL('http://localhost:3000/api/producers/search');
  if (q !== undefined) {
    url.searchParams.set('q', q);
  }
  return new NextRequest(url.toString());
};

describe('GET /api/producers/search', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limiterCheckMock.mockResolvedValue(undefined);
    searchMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gates the endpoint behind withAdmin', () => {
    expect(adminComposed.current).toBe(true);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(createRequest('rick'), dummyContext);

    expect(response.status).toBe(429);
  });

  it('returns 200 with results for a valid query', async () => {
    searchMock.mockResolvedValue([{ id: 'p1', name: 'Rick Rubin' }]);

    const response = await GET(createRequest('rick'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(data).toEqual({ results: [{ id: 'p1', name: 'Rick Rubin' }] });
  });

  it('returns 200 with [] for a short query (delegates to ProducerService)', async () => {
    searchMock.mockResolvedValue([]);

    const response = await GET(createRequest('a'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [] });
  });

  it('returns 200 with [] when no q param is supplied', async () => {
    searchMock.mockResolvedValue([]);

    const response = await GET(createRequest(), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [] });
  });

  it('returns 500 when ProducerService.search throws', async () => {
    searchMock.mockRejectedValue(new Error('db boom'));

    const response = await GET(createRequest('rick'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
