// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as NextServerModule from 'next/server';
import { NextRequest } from 'next/server';

import { GET } from './route';

// Pass-through the admin gate so we can exercise the handler branches directly;
// withAdmin's own 401/403 logic is covered by with-auth.spec.ts. A plain hoisted
// ref (not a vi.fn) records that the route composed withAdmin — clearMocks:true
// wipes vi.fn call history between tests but leaves a plain object ref intact.
const { adminComposed } = vi.hoisted(() => ({ adminComposed: { current: false } }));
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: <H>(handler: H): H => {
    adminComposed.current = true;
    return handler;
  },
  withAuth: <H>(handler: H): H => handler,
}));

// Inject a limiter with a mockable check so the REAL withRateLimit decorator
// (imported by route.ts) drives the 429 path.
const limiterCheckMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  linkPreviewLimiter: { check: limiterCheckMock },
  LINK_PREVIEW_LIMIT: 30,
}));

// The service is the seam: route.ts only maps its outcome to a status code.
const getLinkPreviewMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/link-preview-service', () => ({
  getLinkPreview: getLinkPreviewMock,
}));

// Control internal/own-host classification deterministically (avoids depending
// on getApiBaseUrl in the node test env).
const isInternalBioUrlMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/is-internal-url', () => ({
  isInternalBioUrl: isInternalBioUrlMock,
}));

// Give NextResponse.json a real, parseable body (mirrors proxy-image.spec).
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

const samplePreview = {
  url: 'https://example.com/article',
  resolved: true,
  title: 'Example Article',
  description: 'A short description.',
  siteName: 'Example',
  imageDataUri: 'data:image/webp;base64,AAAA',
  faviconDataUri: null,
};

describe('GET /api/link-preview', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limiterCheckMock.mockResolvedValue(undefined);
    isInternalBioUrlMock.mockReturnValue(false);
    getLinkPreviewMock.mockResolvedValue({ kind: 'ok', preview: samplePreview });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dummyContext = { params: Promise.resolve({}) };

  const createRequest = (url?: string): NextRequest => {
    const search = url ? `?url=${encodeURIComponent(url)}` : '';
    return new NextRequest(`http://localhost:3000/api/link-preview${search}`);
  };

  it('gates the endpoint behind withAdmin', () => {
    expect(adminComposed.current).toBe(true);
  });

  it('returns 429 when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    const response = await GET(createRequest('https://example.com/a'), dummyContext);

    expect(response.status).toBe(429);
  });

  it('does not call the service when the rate limit is exceeded', async () => {
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));

    await GET(createRequest('https://example.com/a'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the url parameter is missing', async () => {
    const response = await GET(createRequest(), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('URL parameter is required');
  });

  it('returns 400 for a malformed url', async () => {
    const response = await GET(createRequest('not-a-valid-url'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid URL');
  });

  it('returns 400 for an unsupported protocol', async () => {
    const response = await GET(createRequest('ftp://example.com/file'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported protocol');
  });

  it('returns 400 for an internal own-host url', async () => {
    isInternalBioUrlMock.mockReturnValue(true);

    const response = await GET(createRequest('https://mysite.com/releases/x'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Internal URLs are not previewable');
  });

  it('does not call the service for an internal url', async () => {
    isInternalBioUrlMock.mockReturnValue(true);

    await GET(createRequest('https://mysite.com/releases/x'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a literal IPv4 host', async () => {
    const response = await GET(createRequest('https://1.2.3.4/page'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Host not allowed');
  });

  it('does not call the service for a literal IP host', async () => {
    await GET(createRequest('https://1.2.3.4/page'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a bracketed literal IPv6 host', async () => {
    const response = await GET(createRequest('http://[::1]/'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Host not allowed');
  });

  it('does not call the service for a bracketed IPv6 host', async () => {
    await GET(createRequest('http://[::1]/'), dummyContext);

    expect(getLinkPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the service reports the host is forbidden', async () => {
    getLinkPreviewMock.mockResolvedValue({ kind: 'forbidden' });

    const response = await GET(createRequest('https://example.com/article'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Host not allowed');
  });

  it('returns 200 with the preview when the service resolves ok', async () => {
    const response = await GET(createRequest('https://example.com/article'), dummyContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(samplePreview);
  });

  it('forwards the requested url to the service after validation passes', async () => {
    await GET(createRequest('https://example.com/article'), dummyContext);

    expect(getLinkPreviewMock).toHaveBeenCalledWith('https://example.com/article');
  });

  it('degrades to a 200 host-only fallback when the service throws', async () => {
    getLinkPreviewMock.mockRejectedValue(new Error('service boom'));

    const response = await GET(createRequest('https://example.com/article'), dummyContext);

    expect(response.status).toBe(200);
  });

  it('returns an unresolved host-only body when the service throws', async () => {
    getLinkPreviewMock.mockRejectedValue(new Error('service boom'));

    const response = await GET(createRequest('https://example.com/article'), dummyContext);
    const data = await response.json();

    expect(data).toEqual({
      url: 'https://example.com/article',
      resolved: false,
      title: null,
      description: null,
      siteName: 'example.com',
      imageDataUri: null,
      faviconDataUri: null,
    });
  });
});
