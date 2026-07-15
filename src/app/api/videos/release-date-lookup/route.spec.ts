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
  releaseDateLookupLimiter: { check: limiterCheckMock },
  RELEASE_DATE_LOOKUP_LIMIT: 10,
}));

// ReleaseDateLookupService.lookup is the seam: route.ts only maps its outcome to a response.
const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/release-date-lookup-service', () => ({
  ReleaseDateLookupService: { lookup: lookupMock },
}));

vi.mock('server-only', () => ({}));

// Give NextResponse.json a real, parseable body (mirrors producers/search route spec).
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

const createRequest = (params?: Record<string, string>): NextRequest => {
  const url = new URL('http://localhost:3000/api/videos/release-date-lookup');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
};

const LOOKUP_RESULT = {
  releasedOn: '2020-06-01',
  confidence: 'medium' as const,
  sources: ['https://musicbrainz.org/'],
};

describe('GET /api/videos/release-date-lookup', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limiterCheckMock.mockResolvedValue(undefined);
    lookupMock.mockResolvedValue(LOOKUP_RESULT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gates the endpoint behind withAdmin', () => {
    expect(adminComposed.current).toBe(true);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(createRequest({ title: 'Some Album' }), dummyContext);

    expect(response.status).toBe(429);
  });

  it('returns 400 when title is missing', async () => {
    const response = await GET(createRequest(), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/title/i);
  });

  it('returns 400 when title is empty after trimming', async () => {
    const response = await GET(createRequest({ title: '   ' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/title/i);
  });

  it('returns 200 with the lookup result when the service resolves', async () => {
    lookupMock.mockResolvedValue(LOOKUP_RESULT);

    const response = await GET(
      createRequest({ title: 'Some Album', artist: 'Some Artist' }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(data).toEqual({ result: LOOKUP_RESULT });
  });

  it('calls lookup with the trimmed title and artist', async () => {
    await GET(createRequest({ title: '  Some Album  ', artist: '  Some Artist  ' }), dummyContext);

    expect(lookupMock).toHaveBeenCalledWith('Some Album', 'Some Artist');
  });

  it('calls lookup without artist when artist param is absent', async () => {
    await GET(createRequest({ title: 'Some Album' }), dummyContext);

    expect(lookupMock).toHaveBeenCalledWith('Some Album', undefined);
  });

  it('returns 200 with result:null when the service returns null', async () => {
    lookupMock.mockResolvedValue(null);

    const response = await GET(createRequest({ title: 'Unknown Album' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ result: null });
  });

  it('returns 502 when the service throws', async () => {
    lookupMock.mockRejectedValue(new Error('Lambda invocation failed'));

    const response = await GET(createRequest({ title: 'Some Album' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Release date lookup failed');
  });
});
