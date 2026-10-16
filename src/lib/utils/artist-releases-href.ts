/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The link to every release an artist holds a release credit on: the public
 * releases listing filtered by their slug (ADR-0006).
 */
export const artistReleasesHref = (slug: string): string =>
  `/releases?artist=${encodeURIComponent(slug)}`;
