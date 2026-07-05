// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import type { BioGenerationCallback } from '@/lib/validation/bio-generation-schema';

import { POST } from './route';

const limiterCheckMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const verifyAndClaimCallbackMock = vi.hoisted(() => vi.fn());
const completeCallbackMock = vi.hoisted(() => vi.fn());
const revalidateArtistBioPathsMock = vi.hoisted(() => vi.fn());

// A next/server stub that mirrors the global setup but also exposes `after`,
// capturing its callback so the "background" work can be run on demand.
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    nextUrl: URL;
    constructor(url: string | URL, options?: RequestInit) {
      super(url, options);
      this.nextUrl = new URL(url);
    }
  }
  class MockNextResponse extends Response {}
  Object.assign(MockNextResponse, {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  });
  return {
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
    after: (cb: () => Promise<void>) => afterMock(cb),
  };
});

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  bioCallbackLimiter: { check: limiterCheckMock },
  BIO_CALLBACK_LIMIT: 20,
}));

vi.mock('@/lib/services/bio-generation-service', () => ({
  BioGenerationService: {
    verifyAndClaimCallback: (id: string, token: string) => verifyAndClaimCallbackMock(id, token),
    completeCallback: (id: string, result: unknown) => completeCallbackMock(id, result),
  },
}));

vi.mock('@/lib/actions/generate-artist-bio-action-helpers', () => ({
  revalidateArtistBioPaths: (slug: string) => revalidateArtistBioPathsMock(slug),
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

const ARTIST_ID = 'a'.repeat(24);

const validBody: BioGenerationCallback = {
  jobToken: 'stored-token',
  result: {
    ok: true,
    data: {
      shortBio: 's',
      longBio: '<p>l</p>',
      altBio: '<p>a</p>',
      genres: 'rock',
      images: [],
      links: [],
      model: 'gemini-2.5-pro',
    },
  },
};

const buildRequest = (body: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/artists/${ARTIST_ID}/bio-generation/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body,
  });

const callRoute = (body: string) =>
  POST(buildRequest(body), { params: Promise.resolve({ id: ARTIST_ID }) });

beforeEach(() => {
  limiterCheckMock.mockReset().mockResolvedValue(undefined);
  afterMock.mockReset();
  verifyAndClaimCallbackMock.mockReset();
  completeCallbackMock.mockReset().mockResolvedValue(undefined);
  revalidateArtistBioPathsMock.mockReset();
});

describe('POST /api/artists/[id]/bio-generation/callback', () => {
  it('returns 202 when the token claim succeeds', async () => {
    verifyAndClaimCallbackMock.mockResolvedValue({ slug: 'radiohead' });

    const response = await callRoute(JSON.stringify(validBody));

    expect(response.status).toBe(202);
  });

  it('runs completeCallback in the background after a successful claim', async () => {
    verifyAndClaimCallbackMock.mockResolvedValue({ slug: 'radiohead' });

    await callRoute(JSON.stringify(validBody));
    await afterMock.mock.calls[0][0]();

    expect(completeCallbackMock).toHaveBeenCalledWith(ARTIST_ID, validBody.result);
  });

  it('revalidates the artist bio paths in the background after a successful claim', async () => {
    verifyAndClaimCallbackMock.mockResolvedValue({ slug: 'radiohead' });

    await callRoute(JSON.stringify(validBody));
    await afterMock.mock.calls[0][0]();

    expect(revalidateArtistBioPathsMock).toHaveBeenCalledWith('radiohead');
  });

  it('returns 202 when the token claim fails (anti-enumeration)', async () => {
    verifyAndClaimCallbackMock.mockResolvedValue(null);

    const response = await callRoute(JSON.stringify(validBody));

    expect(response.status).toBe(202);
  });

  it('does not schedule background work when the token claim fails', async () => {
    verifyAndClaimCallbackMock.mockResolvedValue(null);

    await callRoute(JSON.stringify(validBody));

    expect(afterMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await callRoute('{not json');

    expect(response.status).toBe(400);
  });

  it('rejects an oversized body with 413', async () => {
    const oversized = JSON.stringify({ ...validBody, jobToken: 'x'.repeat(600 * 1024) });

    const response = await callRoute(oversized);

    expect(response.status).toBe(413);
  });

  it('rejects a body that fails the schema with 400', async () => {
    const response = await callRoute(JSON.stringify({ jobToken: '' }));

    expect(response.status).toBe(400);
  });

  it('does not claim when the schema rejects the body', async () => {
    await callRoute(JSON.stringify({ jobToken: '' }));

    expect(verifyAndClaimCallbackMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await callRoute(JSON.stringify(validBody));

    expect(response.status).toBe(429);
  });
});
