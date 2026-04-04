// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as NextServerModule from 'next/server';
import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('next/server', async (importOriginal) => {
  const original = (await importOriginal()) as typeof NextServerModule;
  class MockNextResponse extends Response {
    static json(
      body: unknown,
      init?: { status?: number; statusText?: string; headers?: Record<string, string> }
    ) {
      const headers = new Headers(init?.headers);
      headers.set('content-type', 'application/json');
      return new MockNextResponse(JSON.stringify(body), {
        ...init,
        headers,
      });
    }
  }
  return {
    ...original,
    NextResponse: MockNextResponse,
  };
});

const mockFetch = vi.fn();

describe('GET /api/proxy-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createRequest(url?: string): NextRequest {
    const searchParams = url ? `?url=${encodeURIComponent(url)}` : '';
    return new NextRequest(`http://localhost:3000/api/proxy-image${searchParams}`);
  }

  it('should return 400 when URL parameter is missing', async () => {
    const request = createRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('URL parameter is required');
  });

  it('should return 403 for a disallowed domain', async () => {
    const request = createRequest('https://evil.example.com/image.png');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Domain not allowed');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return 200 and proxy image from cloudfront.net', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: { 'content-type': 'image/png' },
      })
    );

    const request = createRequest('https://d1234.cloudfront.net/images/photo.png');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(mockFetch).toHaveBeenCalledWith('https://d1234.cloudfront.net/images/photo.png', {
      headers: { Accept: 'image/*' },
    });
  });

  it('should return 200 and proxy image from s3.amazonaws.com', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(16), {
        headers: { 'content-type': 'image/jpeg' },
      })
    );

    const request = createRequest('https://bucket.s3.amazonaws.com/photo.jpg');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('should return 200 and proxy image from fakefourrecords.com', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: { 'content-type': 'image/webp' },
      })
    );

    const request = createRequest('https://cdn.fakefourrecords.com/covers/album.webp');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
  });

  it('should pass through the upstream status code when fetch response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const request = createRequest('https://d1234.cloudfront.net/missing.png');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Failed to fetch image: Not Found');
  });

  it('should return 500 when an unexpected error occurs', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const request = createRequest('https://d1234.cloudfront.net/image.png');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to proxy image');
  });

  it('should return 500 for an invalid URL format', async () => {
    const request = createRequest('not-a-valid-url');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to proxy image');
  });

  it('should default content-type to image/jpeg when upstream does not provide one', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: {},
      })
    );

    const request = createRequest('https://d1234.cloudfront.net/image.bin');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('should skip invalid CDN_DOMAIN gracefully and still enforce allowed domains', async () => {
    vi.stubEnv('CDN_DOMAIN', 'not-a-valid-url');

    const request = createRequest('https://evil.example.com/image.png');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Domain not allowed');
    vi.unstubAllEnvs();
  });

  it('should allow requests from CDN_DOMAIN when set', async () => {
    vi.stubEnv('CDN_DOMAIN', 'https://cdn.mysite.com');
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: { 'content-type': 'image/png' },
      })
    );

    const request = createRequest('https://cdn.mysite.com/photo.png');
    const response = await GET(request);

    expect(response.status).toBe(200);
    vi.unstubAllEnvs();
  });
});
