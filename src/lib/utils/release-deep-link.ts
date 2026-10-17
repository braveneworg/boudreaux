/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistReleasesHref } from './artist-releases-href';

/**
 * A release's permalink, the release deep link (ADR-0023): the artist's
 * releases listing with the listening modal open on that release.
 */
export const releaseDeepLinkHref = (artistSlug: string, releaseId: string): string =>
  `${artistReleasesHref(artistSlug)}&release=${encodeURIComponent(releaseId)}`;

/** {@link releaseDeepLinkHref} as an absolute URL on the site's host, for sharing. */
export const releaseDeepLinkUrl = (artistSlug: string, releaseId: string): string =>
  `${process.env.NEXT_PUBLIC_HOST_NAME ?? 'https://fakefourrecords.com'}${releaseDeepLinkHref(artistSlug, releaseId)}`;
