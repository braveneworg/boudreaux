/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Centralized TanStack Query key constants.
 * Using a factory pattern ensures consistent, type-safe keys across the app.
 */
export const queryKeys = {
  releases: {
    all: ['releases'] as const,
    list: () => [...queryKeys.releases.all, 'list'] as const,
  },
  artists: {
    all: ['artists'] as const,
    list: () => [...queryKeys.artists.all, 'list'] as const,
  },
  featuredArtists: {
    all: ['featuredArtists'] as const,
    list: () => [...queryKeys.featuredArtists.all, 'list'] as const,
  },
  purchaseStatus: {
    bySession: (releaseId: string, sessionId: string) =>
      ['purchaseStatus', releaseId, sessionId] as const,
  },
} as const;
