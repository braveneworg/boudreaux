/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isIP } from 'node:net';

import { type NextRequest, NextResponse } from 'next/server';

import { LINK_PREVIEW_LIMIT, linkPreviewLimiter } from '@/lib/config/rate-limit-tiers';
import { withAdmin } from '@/lib/decorators/with-auth';
import { withRateLimit } from '@/lib/decorators/with-rate-limit';
import { getLinkPreview } from '@/lib/services/link-preview-service';
import { isInternalBioUrl } from '@/lib/utils/is-internal-url';

/**
 * Admin-gated, rate-limited OG-unfurl endpoint for the bio-editor link palette.
 *
 * Validates the `url` query param (required, absolute `http(s)`, external, not a
 * literal-IP host) before delegating to the SSRF-hardened `getLinkPreview`
 * service, which owns the DNS-vet + pinned fetch + extraction + caching. Only
 * our-side input errors are non-200: malformed/internal URL → 400, literal-IP
 * or private-resolving host → 403, rate limit → 429. Every upstream failure
 * degrades to `200 { resolved:false }` so the card always renders something.
 */
export const GET = withRateLimit(
  linkPreviewLimiter,
  LINK_PREVIEW_LIMIT
)(
  withAdmin(async (request: NextRequest) => {
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

    if (isInternalBioUrl(url)) {
      return NextResponse.json({ error: 'Internal URLs are not previewable' }, { status: 400 });
    }

    // Reject literal-IP hostnames outright, including bracketed IPv6 literals:
    // `new URL('http://[::1]/').hostname === '[::1]'` and `isIP('[::1]') === 0`,
    // so the brackets must be stripped or the guard never fires. DNS-name hosts
    // are vetted downstream.
    const rawHost = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    if (isIP(rawHost) !== 0) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }

    try {
      const outcome = await getLinkPreview(url);
      if (outcome.kind === 'forbidden') {
        return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
      }

      return NextResponse.json(outcome.preview);
    } catch {
      // The service already degrades every upstream failure internally, but a
      // defensive catch guarantees an unexpected throw never surfaces a raw 500:
      // only our-side input errors are non-200 (400/403/429), so fall back to a
      // host-only resolved:false preview and still return 200.
      return NextResponse.json({
        url,
        resolved: false,
        title: null,
        description: null,
        siteName: parsedUrl.hostname,
        imageDataUri: null,
        faviconDataUri: null,
      });
    }
  })
);
