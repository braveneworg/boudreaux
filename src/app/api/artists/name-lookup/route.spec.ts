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
  artistNameLookupLimiter: { check: limiterCheckMock },
  ARTIST_NAME_LOOKUP_LIMIT: 20,
}));

// ArtistService.findByName is the seam: route.ts only maps its outcome to a response.
const findByNameMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: { findByName: findByNameMock },
}));

vi.mock('server-only', () => ({}));

// Give NextResponse.json a real, parseable body (mirrors probe-metadata route spec).
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

const createRequest = (names?: string[]): NextRequest => {
  const url = new URL('http://localhost:3000/api/artists/name-lookup');
  if (names) {
    for (const n of names) {
      url.searchParams.append('name', n);
    }
  }
  return new NextRequest(url.toString());
};

describe('GET /api/artists/name-lookup', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limiterCheckMock.mockResolvedValue(undefined);
    findByNameMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gates the endpoint behind withAdmin', () => {
    expect(adminComposed.current).toBe(true);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(createRequest(['Ceschi']), dummyContext);

    expect(response.status).toBe(429);
  });

  it('returns 200 with mixed matched/null results, order preserved, and Cache-Control header', async () => {
    const match = { id: 'a1', displayName: 'Ceschi', firstName: 'Ceschi', surname: '' };
    findByNameMock.mockResolvedValueOnce(match).mockResolvedValueOnce(null);

    const response = await GET(createRequest(['Ceschi', 'Unknown Artist']), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(data).toEqual({
      results: [
        { name: 'Ceschi', match },
        { name: 'Unknown Artist', match: null },
      ],
    });
  });

  it('returns 400 when no usable name params are present (missing)', async () => {
    const response = await GET(createRequest(), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/name/i);
  });

  it('returns 400 when all name params are blank', async () => {
    const response = await GET(createRequest(['', '  ']), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/name/i);
  });

  it('returns 400 when more than 20 names are supplied', async () => {
    const names = Array.from({ length: 21 }, (_, i) => `Artist ${i}`);
    const response = await GET(createRequest(names), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/name/i);
  });

  it('returns 500 when ArtistService.findByName throws', async () => {
    findByNameMock.mockRejectedValue(new Error('db boom'));

    const response = await GET(createRequest(['Ceschi']), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
