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
  videoProbePrefillLimiter: { check: limiterCheckMock },
  VIDEO_PROBE_PREFILL_LIMIT: 10,
}));

// VideoProbeService is the seam: route.ts only maps its outcome to a response.
const probeForPrefillMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/video-probe-service', () => ({
  VideoProbeService: { probeForPrefill: probeForPrefillMock },
}));

vi.mock('server-only', () => ({}));

// Give NextResponse.json a real, parseable body (mirrors link-preview.spec).
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

const VALID_VIDEO_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_S3_KEY = `media/videos/${VALID_VIDEO_ID}/video.mp4`;

describe('GET /api/videos/probe-metadata', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limiterCheckMock.mockResolvedValue(undefined);
    probeForPrefillMock.mockResolvedValue({
      ok: true,
      tags: { durationSeconds: 120, mimeType: 'video/mp4' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dummyContext = { params: Promise.resolve({}) };

  const createRequest = (params?: Record<string, string>): NextRequest => {
    const search = params ? '?' + new URLSearchParams(params).toString() : '';
    return new NextRequest(`http://localhost:3000/api/videos/probe-metadata${search}`);
  };

  it('gates the endpoint behind withAdmin', () => {
    expect(adminComposed.current).toBe(true);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(
      createRequest({ videoId: VALID_VIDEO_ID, s3Key: VALID_S3_KEY }),
      dummyContext
    );

    expect(response.status).toBe(429);
  });

  it('returns 400 when videoId is missing', async () => {
    const response = await GET(createRequest({ s3Key: VALID_S3_KEY }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/videoId/i);
  });

  it('returns 400 when videoId is not a valid ObjectId', async () => {
    const response = await GET(
      createRequest({ videoId: 'not-an-objectid', s3Key: VALID_S3_KEY }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/videoId/i);
  });

  it('returns 400 when s3Key is missing', async () => {
    const response = await GET(createRequest({ videoId: VALID_VIDEO_ID }), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/s3Key/i);
  });

  it('returns 400 when s3Key is outside the expected namespace', async () => {
    const response = await GET(
      createRequest({ videoId: VALID_VIDEO_ID, s3Key: 'media/releases/something.mp4' }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/s3Key/i);
  });

  it('returns 400 for a directory-traversal s3Key', async () => {
    const response = await GET(
      createRequest({
        videoId: VALID_VIDEO_ID,
        s3Key: `media/videos/${VALID_VIDEO_ID}/../../../etc/passwd`,
      }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/s3Key/i);
  });

  it('returns 200 with ok:true tags on service success', async () => {
    const tags = { durationSeconds: 120, mimeType: 'video/mp4' };
    probeForPrefillMock.mockResolvedValue({ ok: true, tags });

    const response = await GET(
      createRequest({ videoId: VALID_VIDEO_ID, s3Key: VALID_S3_KEY }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, tags });
  });

  it('calls probeForPrefill with the validated s3Key', async () => {
    await GET(createRequest({ videoId: VALID_VIDEO_ID, s3Key: VALID_S3_KEY }), dummyContext);

    expect(probeForPrefillMock).toHaveBeenCalledWith(VALID_S3_KEY);
  });

  it('returns 200 with ok:false on probe failure (not an HTTP error)', async () => {
    probeForPrefillMock.mockResolvedValue({ ok: false, error: 'ffprobe not found' });

    const response = await GET(
      createRequest({ videoId: VALID_VIDEO_ID, s3Key: VALID_S3_KEY }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: false, error: 'ffprobe not found' });
  });

  it('returns 500 when the service throws unexpectedly', async () => {
    probeForPrefillMock.mockRejectedValue(new Error('service boom'));

    const response = await GET(
      createRequest({ videoId: VALID_VIDEO_ID, s3Key: VALID_S3_KEY }),
      dummyContext
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });

  it('does not include the s3Key in the success response', async () => {
    const response = await GET(
      createRequest({ videoId: VALID_VIDEO_ID, s3Key: VALID_S3_KEY }),
      dummyContext
    );
    const body = await response.text();

    expect(body).not.toContain(VALID_S3_KEY);
  });
});
