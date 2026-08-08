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
  descriptionLookupLimiter: { check: limiterCheckMock },
  DESCRIPTION_LOOKUP_LIMIT: 5,
}));

// VideoDescriptionLookupService.lookup is the seam: route.ts maps its outcome.
const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/video-description-lookup-service', () => ({
  VideoDescriptionLookupService: { lookup: lookupMock },
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
  const url = new URL('http://localhost:3000/api/videos/description-lookup');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
};

const LOOKUP_RESULT = {
  description: 'A ~500-char description naming the artist with attributed quotes.',
  confidence: 'medium' as const,
  sources: ['https://example.com/review'],
};

describe('GET /api/videos/description-lookup', () => {
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

    const response = await GET(createRequest({ title: 'Song', artist: 'Band' }), dummyContext);

    expect(response.status).toBe(429);
  });

  it('returns 400 when title is missing', async () => {
    const response = await GET(createRequest({ artist: 'Band' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/title/i);
  });

  it('returns 400 when artist is missing (the prose must name one)', async () => {
    const response = await GET(createRequest({ title: 'Song' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/artist/i);
  });

  it('returns 400 when artist is empty after trimming', async () => {
    const response = await GET(createRequest({ title: 'Song', artist: '   ' }), dummyContext);

    expect(response.status).toBe(400);
  });

  it('returns 200 with the lookup result when the service resolves', async () => {
    const response = await GET(createRequest({ title: 'Song', artist: 'Band' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(data).toEqual({ result: LOOKUP_RESULT });
  });

  it('calls lookup with trimmed args and forwards the release date', async () => {
    await GET(
      createRequest({ title: '  Song  ', artist: '  Band  ', releasedOn: '2021-04-09' }),
      dummyContext
    );

    expect(lookupMock).toHaveBeenCalledWith({
      title: 'Song',
      artist: 'Band',
      releasedOn: '2021-04-09',
    });
  });

  it('omits a malformed releasedOn instead of failing the request', async () => {
    await GET(
      createRequest({ title: 'Song', artist: 'Band', releasedOn: 'not-a-date' }),
      dummyContext
    );

    expect(lookupMock).toHaveBeenCalledWith({ title: 'Song', artist: 'Band' });
  });

  it('returns 200 with result:null when the service returns null', async () => {
    lookupMock.mockResolvedValue(null);

    const response = await GET(createRequest({ title: 'Song', artist: 'Band' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ result: null });
  });

  it('returns 502 when the service throws', async () => {
    lookupMock.mockRejectedValue(new Error('Lambda invocation failed'));

    const response = await GET(createRequest({ title: 'Song', artist: 'Band' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Description lookup failed');
  });
});
