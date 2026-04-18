// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as NextServerModule from 'next/server';
import { NextRequest } from 'next/server';

import { GET } from './route';

// Stub DNS lookup to a public IP so SSRF guard allows tests through
// without making real network calls.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => ({ address: '1.2.3.4', family: 4 })),
}));

vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: (handler: Function) => handler,
  withAuth: (handler: Function) => handler,
}));

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
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const dummyContext = { params: Promise.resolve({}) };

  function createRequest(url?: string): NextRequest {
    const searchParams = url ? `?url=${encodeURIComponent(url)}` : '';
    return new NextRequest(`http://localhost:3000/api/proxy-image${searchParams}`);
  }

  it('should return 400 when URL parameter is missing', async () => {
    const request = createRequest();
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('URL parameter is required');
  });

  it('should return 403 for a disallowed domain', async () => {
    const request = createRequest('https://evil.example.com/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Domain not allowed');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return 403 for cloudfront.net domain (removed from allowlist)', async () => {
    const request = createRequest('https://d1234.cloudfront.net/images/photo.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Domain not allowed');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return 200 and proxy image from s3.amazonaws.com', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(16), {
        headers: { 'content-type': 'image/jpeg' },
      })
    );

    const request = createRequest('https://bucket.s3.amazonaws.com/photo.jpg');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('should return 200 and proxy image from fakefourrecords.com', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: { 'content-type': 'image/webp' },
      })
    );

    const request = createRequest('https://cdn.fakefourrecords.com/covers/album.webp');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
  });

  it('should pass through the upstream status code when fetch response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const request = createRequest('https://bucket.s3.amazonaws.com/missing.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Failed to fetch image: Not Found');
  });

  it('should return 500 when an unexpected error occurs', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const request = createRequest('https://bucket.s3.amazonaws.com/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to proxy image');
  });

  it('should return 400 for an invalid URL format', async () => {
    const request = createRequest('not-a-valid-url');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid URL');
  });

  it('should default content-type to image/jpeg when upstream does not provide one', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(8), {
        headers: {},
      })
    );

    const request = createRequest('https://bucket.s3.amazonaws.com/image.bin');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('should skip invalid CDN_DOMAIN gracefully and still enforce allowed domains', async () => {
    vi.stubEnv('CDN_DOMAIN', 'not-a-valid-url');

    const request = createRequest('https://evil.example.com/image.png');
    const response = await GET(request, dummyContext);
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
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
    vi.unstubAllEnvs();
  });

  it('should return 400 for unsupported protocol', async () => {
    const request = createRequest('ftp://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Unsupported protocol');
  });

  it('should return 403 for literal IP address hostname', async () => {
    const request = createRequest('https://1.2.3.4/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Domain not allowed');
  });

  it('should return 403 when DNS resolves to private IP', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '10.0.0.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Domain not allowed');
  });

  it('should return 502 when DNS lookup fails', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockRejectedValueOnce(new Error('ENOTFOUND'));

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('DNS lookup failed');
  });

  it('should return 502 when upstream responds with a redirect', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 302,
      statusText: 'Found',
      headers: new Headers({ location: 'http://evil.com' }),
    });

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Upstream redirect rejected');
  });

  it('should return 415 when upstream content-type is not an image', async () => {
    mockFetch.mockResolvedValue(
      new Response('not an image', {
        headers: { 'content-type': 'text/html' },
      })
    );

    const request = createRequest('https://cdn.fakefourrecords.com/page.html');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(415);
    expect(data.error).toBe('Upstream is not an image');
  });

  it('should return 413 when Content-Length header exceeds max size', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(21 * 1024 * 1024),
        },
      })
    );

    const request = createRequest('https://cdn.fakefourrecords.com/huge.jpg');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(413);
    expect(data.error).toBe('Image too large');
  });

  it('should return 502 when upstream body is empty (no reader)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: null,
    });

    const request = createRequest('https://cdn.fakefourrecords.com/empty.png');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toBe('Empty upstream body');
  });

  it('should return 413 when streamed body exceeds max size', async () => {
    const bigChunk = new Uint8Array(21 * 1024 * 1024);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bigChunk);
        controller.close();
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      body: stream,
    });

    const request = createRequest('https://cdn.fakefourrecords.com/stream-huge.jpg');
    const response = await GET(request, dummyContext);
    const data = await response.json();

    expect(response.status).toBe(413);
    expect(data.error).toBe('Image too large');
  });

  it('should allow subdomain of allowed domain', async () => {
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: { 'content-type': 'image/png' },
      })
    );

    const request = createRequest('https://sub.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
  });

  it('should return 403 when DNS resolves to IPv4 loopback', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '127.0.0.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to link-local address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '169.254.1.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to 172.16/12 private address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '172.16.0.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to 192.168/16 private address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '192.168.0.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to CGNAT address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '100.64.0.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to multicast address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '224.0.0.1', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to 0.x.x.x address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '0.0.0.0', family: 4 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 loopback', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 unspecified address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '::', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 link-local (fe80::)', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'fe80::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 link-local (fe9x)', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'fe90::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 link-local (feax)', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'fea0::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 link-local (febx)', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'feb0::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 unique-local (fc00::)', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'fc00::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv6 unique-local (fd00::)', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: 'fd00::1', family: 6 } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should return 403 when DNS resolves to IPv4-mapped IPv6 private address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({
      address: '::ffff:10.0.0.1',
      family: 6,
    } as never);

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(403);
  });

  it('should allow public IPv6 address', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({
      address: '2001:db8::1',
      family: 6,
    } as never);
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: { 'content-type': 'image/png' },
      })
    );

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
  });

  it('should allow non-private IPv4 address through SSRF check', async () => {
    const { lookup } = await import('node:dns/promises');
    vi.mocked(lookup).mockResolvedValueOnce({ address: '8.8.8.8', family: 4 } as never);
    mockFetch.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        headers: { 'content-type': 'image/png' },
      })
    );

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
  });

  it('should handle stream with empty value chunks', async () => {
    let callCount = 0;
    const reader = {
      read: vi.fn(async () => {
        callCount++;
        if (callCount === 1) return { value: undefined, done: false };
        if (callCount === 2) return { value: new Uint8Array([1, 2, 3]), done: false };
        return { value: undefined, done: true };
      }),
      cancel: vi.fn(),
    };
    const stream = { getReader: () => reader };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      body: stream,
    });

    const request = createRequest('https://cdn.fakefourrecords.com/image.png');
    const response = await GET(request, dummyContext);

    expect(response.status).toBe(200);
  });
});
