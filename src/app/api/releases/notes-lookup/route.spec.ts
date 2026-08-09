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

// ReleaseNotesLookupService.lookup is the seam: route.ts maps its outcome.
const lookupMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/release-notes-lookup-service', () => ({
  ReleaseNotesLookupService: { lookup: lookupMock },
}));

vi.mock('server-only', () => ({}));

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
  const url = new URL('http://localhost:3000/api/releases/notes-lookup');
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url.toString());
};

const LOOKUP_RESULT = {
  notes: ['The record, in two paragraphs.', 'And how the press received it.'],
  confidence: 'medium' as const,
  sources: ['https://example.com/review'],
};

describe('GET /api/releases/notes-lookup', () => {
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

    const response = await GET(createRequest({ title: 'Album', artist: 'Band' }), dummyContext);

    expect(response.status).toBe(429);
  });

  it('returns 400 when title is missing', async () => {
    const response = await GET(createRequest({ artist: 'Band' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/title/i);
  });

  it('returns 400 when artist is missing (the notes must name one)', async () => {
    const response = await GET(createRequest({ title: 'Album' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/artist/i);
  });

  it('returns 200 with the lookup result when the service resolves', async () => {
    const response = await GET(createRequest({ title: 'Album', artist: 'Band' }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(data).toEqual({ result: LOOKUP_RESULT });
  });

  it('calls lookup with trimmed args and the full release context', async () => {
    await GET(
      createRequest({
        title: '  Album  ',
        artist: '  Band  ',
        releasedOn: '2015-03-03',
        catalogNumber: ' FF4-042 ',
        formats: 'VINYL_12_INCH,DIGITAL',
      }),
      dummyContext
    );

    expect(lookupMock).toHaveBeenCalledWith({
      title: 'Album',
      artist: 'Band',
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH', 'DIGITAL'],
    });
  });

  it('drops a malformed release date rather than failing the lookup', async () => {
    await GET(
      createRequest({ title: 'Album', artist: 'Band', releasedOn: '03/03/2015' }),
      dummyContext
    );

    expect(lookupMock).toHaveBeenCalledWith({ title: 'Album', artist: 'Band' });
  });

  it('omits formats when the parameter is blank', async () => {
    await GET(createRequest({ title: 'Album', artist: 'Band', formats: ' , ' }), dummyContext);

    expect(lookupMock).toHaveBeenCalledWith({ title: 'Album', artist: 'Band' });
  });

  it('returns 502 when the service throws', async () => {
    lookupMock.mockRejectedValue(new Error('lambda down'));

    const response = await GET(createRequest({ title: 'Album', artist: 'Band' }), dummyContext);

    expect(response.status).toBe(502);
  });
});
