// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { POST } from './route';

const limiterCheckMock = vi.hoisted(() => vi.fn());
const recordProgressMock = vi.hoisted(() => vi.fn());

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
  videoEnrichmentProgressLimiter: { check: limiterCheckMock },
  VIDEO_ENRICHMENT_PROGRESS_LIMIT: 60,
}));

vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: {
    recordProgress: (id: string, token: string, checkpoint: unknown) =>
      recordProgressMock(id, token, checkpoint),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

const VIDEO_ID = 'f'.repeat(24);

const buildRequest = (body: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/videos/${VIDEO_ID}/enrichment/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body,
  });

const callRoute = (body: string) =>
  POST(buildRequest(body), { params: Promise.resolve({ id: VIDEO_ID }) });

beforeEach(() => {
  limiterCheckMock.mockReset().mockResolvedValue(undefined);
  recordProgressMock.mockReset().mockResolvedValue(undefined);
});

describe('POST /api/videos/[id]/enrichment/progress', () => {
  it('records a valid checkpoint and answers 202', async () => {
    const response = await callRoute(
      JSON.stringify({ jobToken: 't', stage: 'wikidata', counts: { artists: 1 } })
    );

    expect(response.status).toBe(202);
    expect(recordProgressMock).toHaveBeenCalledWith(VIDEO_ID, 't', {
      stage: 'wikidata',
      counts: { artists: 1 },
    });
  });

  it('records a checkpoint with no counts as a bare stage', async () => {
    const response = await callRoute(JSON.stringify({ jobToken: 't', stage: 'finalizing' }));

    expect(response.status).toBe(202);
    expect(recordProgressMock).toHaveBeenCalledWith(VIDEO_ID, 't', { stage: 'finalizing' });
  });

  it('silently accepts malformed JSON with 202 (anti-enumeration)', async () => {
    const response = await callRoute('{not json');

    expect(response.status).toBe(202);
  });

  it('records nothing for a schema-rejected body but still answers 202', async () => {
    const response = await callRoute(JSON.stringify({ jobToken: 't', stage: 'drafting' }));

    expect(response.status).toBe(202);
    expect(recordProgressMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized body with 413', async () => {
    const response = await callRoute(
      JSON.stringify({ jobToken: 'x'.repeat(5 * 1024), stage: 'wikidata' })
    );

    expect(response.status).toBe(413);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await callRoute(JSON.stringify({ jobToken: 't', stage: 'wikidata' }));

    expect(response.status).toBe(429);
  });
});
