/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Centralized TanStack Query key constants.
 * Using a factory pattern ensures consistent, type-safe keys across the app.
 */
export const queryKeys = {
  banners: {
    all: ['banners'] as const,
    active: () => [...queryKeys.banners.all, 'active'] as const,
  },
  releases: {
    all: ['releases'] as const,
    list: () => [...queryKeys.releases.all, 'list'] as const,
    published: () => [...queryKeys.releases.all, 'published'] as const,
    detail: (id: string) => [...queryKeys.releases.all, 'detail', id] as const,
    userStatus: (id: string) => [...queryKeys.releases.all, 'userStatus', id] as const,
    related: (id: string, artistId?: string | null) =>
      [...queryKeys.releases.all, 'related', id, artistId ?? ''] as const,
    digitalFormats: (id: string) => [...queryKeys.releases.all, 'digitalFormats', id] as const,
  },
  artists: {
    all: ['artists'] as const,
    list: () => [...queryKeys.artists.all, 'list'] as const,
    bySlug: (slug: string) => [...queryKeys.artists.all, 'bySlug', slug] as const,
    search: (query: string) => [...queryKeys.artists.all, 'search', query] as const,
  },
  featuredArtists: {
    all: ['featuredArtists'] as const,
    list: () => [...queryKeys.featuredArtists.all, 'list'] as const,
    active: () => [...queryKeys.featuredArtists.all, 'active'] as const,
  },
  collection: {
    all: ['collection'] as const,
    list: () => [...queryKeys.collection.all, 'list'] as const,
  },
  tours: {
    all: ['tours'] as const,
    list: () => [...queryKeys.tours.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.tours.all, 'detail', id] as const,
  },
  purchaseStatus: {
    bySession: (releaseId: string, sessionId: string) =>
      ['purchaseStatus', releaseId, sessionId] as const,
  },
} as const;
