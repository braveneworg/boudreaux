/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { type NextRequest, NextResponse } from 'next/server';

import { Agent } from 'undici';

import { POLLING_LIMIT, pollingLimiter } from '@/lib/config/rate-limit-tiers';
import { withAuth } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { loggers } from '@/lib/utils/logger';

import type { LookupAddress, LookupOptions } from 'node:dns';

// Upper bound on proxied image size. Prevents unbounded memory use from
// attacker-supplied URLs that return huge bodies. 20 MB is far larger than
// any legitimate album artwork.
const MAX_PROXY_BODY_BYTES = 20 * 1024 * 1024;

// Returns true when `b` falls within `[lo, hi]` inclusive (second-octet range checks).
const inRange = (b: number, lo: number, hi: number): boolean => b >= lo && b <= hi;

// Returns true when the second octet makes (a, b) land in a private /16 or /12 block.
const isPrivateSecondOctet = (a: number, b: number): boolean => {
  if (a === 169 && b === 254) return true;
  if (a === 172 && inRange(b, 16, 31)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && inRange(b, 64, 127)) return true;
  return false;
};

// Checks private/reserved IPv4 ranges for SSRF protection.
// 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10 (CGNAT), 224/4+
const isDisallowedIPv4 = (address: string): boolean => {
  const parts = address.split('.').map((octet) => Number.parseInt(octet, 10));
  /* v8 ignore start -- defensive: isIP() already guarantees version 4 means exactly four numeric octets, so this guard is unreachable */
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  /* v8 ignore stop */
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  return isPrivateSecondOctet(a, b);
};

// Checks private/reserved IPv6 ranges for SSRF protection.
// loopback, unspecified, link-local (fe80::/10), unique-local (fc00::/7), IPv4-mapped private
const isDisallowedIPv6 = (lower: string): boolean => {
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
};

/**
 * Returns true for IPv4/IPv6 addresses in loopback, link-local, private, or
 * the AWS/GCP instance-metadata ranges. We block these before issuing the
 * fetch to stop SSRF pivoting to internal services.
 */
function isDisallowedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isDisallowedIPv4(address);
  if (version === 6) return isDisallowedIPv6(address.toLowerCase());
  return true;
}

// Allowlist of hostnames. Exact match, or "<sub>.<allowed>" suffix match.
// S3 is included because image cropper uses S3-hosted originals, but the
// SSRF-via-redirect + DNS IP checks below still apply.
const buildAllowedDomains = (): Set<string> => {
  const domains = new Set<string>([
    'cdn.fakefourrecords.com',
    's3.amazonaws.com',
    's3.us-east-1.amazonaws.com',
    's3.us-west-2.amazonaws.com',
    'fakefourrecords.com',
  ]);
  const cdnDomain = process.env.CDN_DOMAIN;
  if (cdnDomain) {
    try {
      domains.add(new URL(cdnDomain).hostname);
    } catch {
      // Ignore malformed CDN_DOMAIN
    }
  }
  return domains;
};

type VettedAddress = { address: string; family: number };

/**
 * Resolves `hostname` via DNS and validates the result against the SSRF
 * blocklist. Returns the vetted address on success, or a NextResponse error
 * (403/502) that the caller should return immediately.
 */
const resolveAndVetAddress = async (hostname: string): Promise<VettedAddress | NextResponse> => {
  try {
    const { address, family } = await lookup(hostname);
    if (isDisallowedAddress(address)) {
      loggers.s3.warn('[proxy-image] Blocked request resolving to disallowed IP', { address });
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }
    return { address, family };
  } catch (error) {
    loggers.s3.error('[proxy-image] DNS lookup failed', error);
    return NextResponse.json({ error: 'DNS lookup failed' }, { status: 502 });
  }
};

/**
 * Builds an undici Agent whose DNS lookup is pinned to the already-validated
 * address/family pair, closing the DNS-rebinding window that node's global
 * fetch would otherwise leave open between validation and socket connect.
 * TLS SNI still uses the original hostname so certificate validation is
 * unaffected. (M2)
 */
const buildPinnedDispatcher = (vettedAddress: string, vettedFamily: number): Agent => {
  const pinnedLookup = (
    _hostname: string,
    options: LookupOptions,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number
    ) => void
  ): void => {
    if (options.all) {
      callback(null, [{ address: vettedAddress, family: vettedFamily }]);
    } else {
      callback(null, vettedAddress, vettedFamily);
    }
  };
  return new Agent({ connect: { lookup: pinnedLookup } });
};

/**
 * Validates the upstream Response for redirect, status, content-type, and
 * content-length. Returns a NextResponse error on failure, or the resolved
 * contentType string on success.
 */
const validateUpstreamResponse = (response: Response): NextResponse | string => {
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
  return contentType;
};

/**
 * Streams a Response body into a capped Buffer. Returns a NextResponse error
 * if the body is absent or exceeds MAX_PROXY_BODY_BYTES; otherwise returns
 * the accumulated Buffer.
 */
const streamToBuffer = async (
  body: Response['body']
): Promise<Buffer<ArrayBuffer> | NextResponse> => {
  const reader = body?.getReader();
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
  return Buffer.concat(chunks, received);
};

/**
 * Issues the DNS-pinned fetch, validates the response (redirect, content-type,
 * size), streams the body into a capped buffer, and returns a NextResponse.
 * `redirect: 'manual'` prevents follow-on requests to attacker-controlled
 * Location headers (e.g. 302 → 169.254.169.254).
 */
const fetchAndBuffer = async (url: string, dispatcher: Agent): Promise<NextResponse> => {
  const fetchInit = {
    headers: { Accept: 'image/*' },
    redirect: 'manual' as const,
    signal: AbortSignal.timeout(10_000),
    dispatcher,
  };
  const response = await fetch(url, fetchInit);

  const contentTypeOrError = validateUpstreamResponse(response);
  if (contentTypeOrError instanceof NextResponse) return contentTypeOrError;

  const bufferOrError = await streamToBuffer(response.body);
  if (bufferOrError instanceof NextResponse) return bufferOrError;

  return new NextResponse(bufferOrError, {
    status: 200,
    headers: {
      'Content-Type': contentTypeOrError,
      'Cache-Control': 'private, no-store',
    },
  });
};

/**
 * Proxy endpoint to fetch remote images and return them as blobs.
 * Used by the image cropper to sidestep CORS on CDN-hosted originals.
 * Rate-limited per IP: each request can pull up to 20MB from the upstream
 * CDN/S3, so an unthrottled authed client is a bandwidth-amplification
 * vector. The cropper loads one original per edit — 20/min is ample.
 */
export const GET = withRateLimit(
  pollingLimiter,
  POLLING_LIMIT
)(
  withAuth(async (request: NextRequest) => {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
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
    const allowedDomains = buildAllowedDomains();
    const isAllowedHost = [...allowedDomains].some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    );
    if (!isAllowedHost) {
      loggers.s3.warn('[proxy-image] Blocked request to non-allowed domain', { hostname });
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }

    // Reject literal IP hostnames — allowlist is strictly DNS-name based.
    if (isIP(parsedUrl.hostname) !== 0) {
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
    }

    const vetted = await resolveAndVetAddress(hostname);
    if (vetted instanceof NextResponse) return vetted;

    const pinnedDispatcher = buildPinnedDispatcher(vetted.address, vetted.family);

    try {
      return await fetchAndBuffer(url, pinnedDispatcher);
    } catch (error) {
      loggers.s3.error('[proxy-image] Error proxying image', error);
      return NextResponse.json({ error: 'Failed to proxy image' }, { status: 500 });
    } finally {
      // Each request builds a fresh pinned dispatcher; close its connection
      // pool so it does not leak. The body is fully buffered before any return
      // above, so closing here cannot truncate the response.
      try {
        await pinnedDispatcher.close();
      } catch {
        // Best-effort cleanup — a close failure must not affect the response.
      }
    }
  })
);
