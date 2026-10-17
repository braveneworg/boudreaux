/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistReleasesHref } from './artist-releases-href';
import { isValidObjectId } from './validation/object-id';

/**
 * A release's permalink, the release deep link (ADR-0023): the artist's
 * releases listing with the listening modal open on that release.
 */
export const releaseDeepLinkHref = (artistSlug: string, releaseId: string): string =>
  `${artistReleasesHref(artistSlug)}&release=${encodeURIComponent(releaseId)}`;

/** {@link releaseDeepLinkHref} as an absolute URL on the site's host, for sharing. */
export const releaseDeepLinkUrl = (artistSlug: string, releaseId: string): string =>
  `${process.env.NEXT_PUBLIC_HOST_NAME ?? 'https://fakefourrecords.com'}${releaseDeepLinkHref(artistSlug, releaseId)}`;

/** The release a deep link opens, read back from its href. */
export interface ReleaseDeepLink {
  artistSlug: string;
  releaseId: string;
}

const DEEP_LINK_PREFIX = '/releases?';

/**
 * Read a site-relative release deep link (`/releases?artist=<slug>&release=<id>`)
 * back into its slug and release id; `null` for any other href, including a
 * release id that is not an ObjectId.
 */
export const parseReleaseDeepLink = (href: string): ReleaseDeepLink | null => {
  if (!href.startsWith(DEEP_LINK_PREFIX)) return null;
  const params = new URLSearchParams(href.slice(DEEP_LINK_PREFIX.length));
  const artistSlug = params.get('artist') ?? '';
  const releaseId = params.get('release') ?? '';
  return artistSlug && isValidObjectId(releaseId) ? { artistSlug, releaseId } : null;
};
