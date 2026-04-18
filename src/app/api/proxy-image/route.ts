/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { type NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/decorators/with-auth';

// Upper bound on proxied image size. Prevents unbounded memory use from
// attacker-supplied URLs that return huge bodies. 20 MB is far larger than
// any legitimate album artwork.
const MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

/**
 * Returns true for IPv4/IPv6 addresses in loopback, link-local, private, or
 * the AWS/GCP instance-metadata ranges. We block these before issuing the
 * fetch to stop SSRF pivoting to internal services.
 */
function isDisallowedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map((octet) => Number.parseInt(octet, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10 (CGNAT), 224/4+
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    // loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7), IPv4-mapped private
    if (lower === '::1' || lower === '::') return true;
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true;
    }
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped — check the tail with the IPv4 rules.
      return isDisallowedAddress(lower.slice('::ffff:'.length));
    }
    return false;
  }
  return true;
}

/**
 * Proxy endpoint to fetch remote images and return them as blobs.
 * Used by the image cropper to sidestep CORS on CDN-hosted originals.
 */
export const GET = withAuth(async (request: NextRequest) => {
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // Allowlist of hostnames. Exact match, or "<sub>.<allowed>" suffix match.
  // S3 is included because image cropper uses S3-hosted originals, but the
  // SSRF-via-redirect + DNS IP checks below still apply.
  const allowedDomains = new Set<string>([
    'cdn.fakefourrecords.com',
    's3.amazonaws.com',
    's3.us-east-1.amazonaws.com',
    's3.us-west-2.amazonaws.com',
    'fakefourrecords.com',
  ]);
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    try {
      allowedDomains.add(new URL(cdnDomain).hostname);
    } catch {
      // Ignore malformed CDN_DOMAIN
    }
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return NextResponse.json({ error: 'Unsupported protocol' }, { status: 400 });
  }

  const hostname = parsedUrl.hostname;
  const isAllowedHost = [...allowedDomains].some(
    (domain) => hostname === domain || hostname.endsWith('.' + domain)
  );
  if (!isAllowedHost) {
    console.warn('[proxy-image] Blocked request to non-allowed domain:', hostname);
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  // Resolve DNS ourselves and reject private/metadata addresses before fetch.
  // Reject literal IP hostnames too — allowlist is strictly DNS-name based.
  if (isIP(parsedUrl.hostname) !== 0) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }
  try {
    const { address } = await lookup(parsedUrl.hostname);
    if (isDisallowedAddress(address)) {
      console.warn('[proxy-image] Blocked request resolving to disallowed IP:', address);
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }
  } catch (error) {
    console.error('[proxy-image] DNS lookup failed:', error);
    return NextResponse.json({ error: 'DNS lookup failed' }, { status: 502 });
  }

  try {
    // redirect: 'manual' prevents follow-on requests to attacker-controlled
    // Location headers (e.g. 302 → 169.254.169.254). Redirects = treated as an error.
    const response = await fetch(url, {
      headers: { Accept: 'image/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json({ error: 'Upstream redirect rejected' }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Upstream is not an image' }, { status: 415 });
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BODY_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Stream into a capped buffer so a missing/lying Content-Length can't OOM us.
    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'Empty upstream body' }, { status: 502 });
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > MAX_PROXY_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: 'Image too large' }, { status: 413 });
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks, received);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[proxy-image] Error proxying image:', error);
    return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
  }
});
