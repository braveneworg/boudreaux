/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Legacy release route at `/releases/[releaseId]`.
 *
 * A release is no longer a page of its own — it plays in the listening modal
 * (ADR-0023). This route stays only to keep old links and indexed URLs
 * working, permanently redirecting to the release deep link on the album
 * artist's releases, `/releases?artist=<slug>&release=<id>`. An id naming no
 * listed release, or one whose album artist is hidden, is a 404.
 */

import { notFound, permanentRedirect } from 'next/navigation';

import { ReleaseService } from '@/lib/services/release-service';
import { releaseDeepLinkHref } from '@/lib/utils/release-deep-link';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

interface ReleaseRedirectPageProps {
  params: Promise<{ releaseId: string }>;
}

export default async function ReleaseRedirectPage({ params }: ReleaseRedirectPageProps) {
  const { releaseId } = await params;
  const target = isValidObjectId(releaseId)
    ? await ReleaseService.getPublishedReleaseRedirectTarget(releaseId)
    : null;
  if (!target) notFound();
  permanentRedirect(releaseDeepLinkHref(target.artistSlug, releaseId));
}
