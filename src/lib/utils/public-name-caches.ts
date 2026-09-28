/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { cache } from './simple-cache';

/** Cache-key prefix of the cached public published-releases listing pages. */
export const PUBLISHED_RELEASES_CACHE_PREFIX = 'published-releases:';

/** Cache-key prefix of the cached public featured-artists listings. */
export const FEATURED_ARTISTS_CACHE_PREFIX = 'featured-artists:';

/**
 * Clear every cached public listing that prints an artist's name: the
 * published-releases pages (bylines) and the featured-artists listings. Call
 * it after any write that changes whether an artist is public or what it is
 * called, so a hidden artist's name does not outlive the write by the cache
 * TTL (ADR-0015).
 *
 * The cache is per process: a CLI script cannot clear the web server's copy,
 * which then expires with its TTL.
 */
export const invalidatePublicNameCaches = (): void => {
  cache.deleteByPrefix(PUBLISHED_RELEASES_CACHE_PREFIX);
  cache.deleteByPrefix(FEATURED_ARTISTS_CACHE_PREFIX);
};
