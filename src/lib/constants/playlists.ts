/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Playlist feature constants — limits, page sizes, and search tunables.
 * Feature: 011-playlists
 */

/** Maximum number of items allowed in a single playlist. */
export const MAX_PLAYLIST_ITEMS = 200 as const;

/** Maximum number of cover images a playlist may carry (tiled client-side). */
export const MAX_PLAYLIST_COVER_IMAGES = 4 as const;

/** Maximum byte size for a single playlist cover image upload (10 MB). */
export const MAX_PLAYLIST_COVER_IMAGE_BYTES: number = 10 * 1024 * 1024;

/** Maximum items returned per result group in the media-search endpoint. */
export const PLAYLIST_SEARCH_GROUP_LIMIT = 8 as const;

/** Minimum query length (chars) before a media-search request is issued. */
export const PLAYLIST_SEARCH_MIN_QUERY_LENGTH = 2 as const;

/** Default page size for the My Playlists list API. */
export const PLAYLISTS_PAGE_SIZE = 24 as const;
