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
  artistVocabularyLimiter: { check: limiterCheckMock },
  ARTIST_VOCABULARY_LIMIT: 30,
}));

// ArtistVocabularyService.search is the seam: route.ts only maps its outcome.
const searchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/artist-vocabulary-service', () => ({
  ArtistVocabularyService: { search: searchMock },
}));

vi.mock('server-only', () => ({}));

// Give NextResponse.json a real, parseable body (mirrors the producer route spec).
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

const createRequest = (params: Record<string, string> = {}): NextRequest => {
  const url = new URL('http://localhost:3000/api/artists/vocabulary');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString());
};

describe('GET /api/artists/vocabulary', () => {
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

    const response = await GET(createRequest({ field: 'genres' }), dummyContext);

    expect(response.status).toBe(429);
  });

  it('returns 200 with the service results', async () => {
    searchMock.mockResolvedValue([{ value: 'indie-rock', count: 7 }]);

    const response = await GET(createRequest({ field: 'genres', q: 'ind' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ results: [{ value: 'indie-rock', count: 7 }] });
  });

  it('marks the response private and uncacheable', async () => {
    const response = await GET(createRequest({ field: 'genres' }), dummyContext);

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('forwards the parsed field and query to the service', async () => {
    await GET(createRequest({ field: 'tags', q: '  punk  ' }), dummyContext);

    expect(searchMock).toHaveBeenCalledWith('tags', 'punk');
  });

  it('returns the top terms when q is absent, not an empty list', async () => {
    searchMock.mockResolvedValue([{ value: 'noise', count: 3 }]);

    const response = await GET(createRequest({ field: 'genres' }), dummyContext);
    const data = await response.json();

    expect(data).toEqual({ results: [{ value: 'noise', count: 3 }] });
  });

  it('passes an empty query through rather than short-circuiting', async () => {
    await GET(createRequest({ field: 'genres' }), dummyContext);

    expect(searchMock).toHaveBeenCalledWith('genres', '');
  });

  it('400s on an invalid field', async () => {
    const response = await GET(createRequest({ field: 'displayName' }), dummyContext);

    expect(response.status).toBe(400);
  });

  it('never calls the service for an invalid field', async () => {
    await GET(createRequest({ field: '$where' }), dummyContext);

    expect(searchMock).not.toHaveBeenCalled();
  });

  it('400s when field is missing', async () => {
    const response = await GET(createRequest({ q: 'punk' }), dummyContext);

    expect(response.status).toBe(400);
  });

  it('does not log a 400 as a server error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await GET(createRequest({ field: 'displayName' }), dummyContext);

    expect(error).not.toHaveBeenCalled();
  });

  it('returns 500 when the service throws', async () => {
    searchMock.mockRejectedValue(new Error('db boom'));

    const response = await GET(createRequest({ field: 'genres' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
