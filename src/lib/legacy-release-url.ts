/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Legacy release URL `/releases/<id>`, answered by the proxy.
 *
 * A release is no longer a page of its own — it plays in the listening modal
 * (ADR-0023). The old URL stays only to keep old links and indexed URLs
 * working: it permanently redirects to the release deep link on the album
 * artist's releases, `/releases?artist=<slug>&release=<id>`. An id naming no
 * listed release, or one whose album artist is hidden, is a 404 that renders
 * `src/app/releases/[releaseId]/not-found.tsx`.
 *
 * The proxy, not the page, decides: a page here renders under the root and
 * `/releases` loading boundaries, which stream a `200` before a redirect or
 * `notFound()` can set the status, and a route handler can set the status
 * but cannot render the themed not-found page.
 */
import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { ReleaseService } from '@/lib/services/release-service';
import { releaseDeepLinkHref } from '@/lib/utils/release-deep-link';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

// One path segment after `/releases` — never the listing itself.
const LEGACY_RELEASE_PATH = /^\/releases\/([^/]+)$/;

/** The id in a `/releases/<id>` path, or `null` for any other path. */
export const legacyReleaseId = (pathname: string): string | null =>
  LEGACY_RELEASE_PATH.exec(pathname)?.[1] ?? null;

/**
 * A `308` to the release's deep link, or a rewrite in place under a `404`, so
 * the segment's page renders its not-found page with a real status.
 */
export const legacyReleaseResponse = async (
  request: NextRequest,
  releaseId: string
): Promise<NextResponse> => {
  const target = isValidObjectId(releaseId)
    ? await ReleaseService.getPublishedReleaseRedirectTarget(releaseId)
    : null;
  if (!target) {
    return NextResponse.rewrite(request.nextUrl, { status: 404 });
  }
  return NextResponse.redirect(
    new URL(releaseDeepLinkHref(target.artistSlug, releaseId), request.nextUrl),
    308
  );
};
