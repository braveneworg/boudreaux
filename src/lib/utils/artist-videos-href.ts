/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The link to every video an artist holds a video credit on: the public
 * videos listing filtered by their slug.
 */
export const artistVideosHref = (slug: string): string =>
  `/videos?artist=${encodeURIComponent(slug)}`;
