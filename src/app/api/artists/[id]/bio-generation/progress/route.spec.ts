// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import type { BioProgressPost } from '@/lib/validation/bio-generation-schema';

import { POST } from './route';

const limiterCheckMock = vi.hoisted(() => vi.fn());
const recordProgressMock = vi.hoisted(() => vi.fn());
const mediaWarnMock = vi.hoisted(() => vi.fn());

// A next/server stub mirroring the global setup: a NextRequest that carries
// `nextUrl`, and a NextResponse whose `json` helper returns a status-bearing
// object so the handler can be exercised without loading Next.js internals.
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
  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});

vi.mock('@/lib/config/rate-limit-tiers', () => ({
  bioProgressLimiter: { check: limiterCheckMock },
  BIO_PROGRESS_LIMIT: 60,
}));

vi.mock('@/lib/services/bio-generation-service', () => ({
  BioGenerationService: {
    recordProgress: (id: string, token: string, payload: unknown) =>
      recordProgressMock(id, token, payload),
  },
}));

vi.mock('@/lib/utils/logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: mediaWarnMock, error: vi.fn() };
  return { loggers: new Proxy({}, { get: () => logger }) };
});

const ARTIST_ID = 'a'.repeat(24);

const validBody: BioProgressPost = {
  jobToken: 'stored-token',
  stage: 'drafting',
  detail: 'Writing the long bio',
  counts: { images: 3 },
};

const buildRequest = (body: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/artists/${ARTIST_ID}/bio-generation/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body,
  });

const callRoute = (body: string) =>
  POST(buildRequest(body), { params: Promise.resolve({ id: ARTIST_ID }) });

beforeEach(() => {
  limiterCheckMock.mockReset().mockResolvedValue(undefined);
  recordProgressMock.mockReset().mockResolvedValue(true);
});

describe('POST /api/artists/[id]/bio-generation/progress', () => {
  it('returns 202 on a valid checkpoint', async () => {
    const response = await callRoute(JSON.stringify(validBody));

    expect(response.status).toBe(202);
  });

  it('records the parsed checkpoint payload (minus jobToken) for the artist', async () => {
    await callRoute(JSON.stringify(validBody));

    expect(recordProgressMock).toHaveBeenCalledWith(ARTIST_ID, 'stored-token', {
      stage: 'drafting',
      detail: 'Writing the long bio',
      counts: { images: 3 },
    });
  });

  it('rejects an oversized body with 413', async () => {
    const oversized = JSON.stringify({ ...validBody, detail: 'x'.repeat(5000) });

    const response = await callRoute(oversized);

    expect(response.status).toBe(413);
  });

  it('does not record when the body is oversized', async () => {
    const oversized = JSON.stringify({ ...validBody, detail: 'x'.repeat(5000) });

    await callRoute(oversized);

    expect(recordProgressMock).not.toHaveBeenCalled();
  });

  it('silently accepts malformed JSON with 202', async () => {
    const response = await callRoute('{not json');

    expect(response.status).toBe(202);
  });

  it('does not record when the JSON is malformed', async () => {
    await callRoute('{not json');

    expect(recordProgressMock).not.toHaveBeenCalled();
  });

  it('silently accepts a schema-invalid body with 202', async () => {
    const response = await callRoute(JSON.stringify({ jobToken: '', stage: 'drafting' }));

    expect(response.status).toBe(202);
  });

  it('does not record when the body fails the schema', async () => {
    await callRoute(JSON.stringify({ jobToken: 'tok', stage: 'not-a-stage' }));

    expect(recordProgressMock).not.toHaveBeenCalled();
  });

  it('logs a warn with the Zod issue summary on schema rejection', async () => {
    await callRoute(JSON.stringify({ jobToken: 'tok', stage: 'not-a-stage' }));

    expect(mediaWarnMock).toHaveBeenCalledWith(
      'bio_progress_schema_rejected',
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
        ]),
      })
    );
  });

  it('does not log a warn on a valid checkpoint', async () => {
    await callRoute(JSON.stringify(validBody));

    expect(mediaWarnMock).not.toHaveBeenCalled();
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await callRoute(JSON.stringify(validBody));

    expect(response.status).toBe(429);
  });

  it('does not record when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    await callRoute(JSON.stringify(validBody));

    expect(recordProgressMock).not.toHaveBeenCalled();
  });
});
