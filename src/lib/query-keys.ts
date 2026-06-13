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
    publishedInfinite: (search: string) =>
      [...queryKeys.releases.all, 'publishedInfinite', search.trim().toLowerCase()] as const,
    adminInfinite: (params: { search: string; published: boolean | null; deleted: boolean }) =>
      [
        ...queryKeys.releases.all,
        'adminInfinite',
        params.search.trim().toLowerCase(),
        params.published,
        params.deleted,
      ] as const,
    detail: (id: string) => [...queryKeys.releases.all, 'detail', id] as const,
    userStatus: (id: string) => [...queryKeys.releases.all, 'userStatus', id] as const,
    related: (id: string, artistId?: string | null) =>
      [...queryKeys.releases.all, 'related', id, artistId ?? ''] as const,
    digitalFormats: (id: string) => [...queryKeys.releases.all, 'digitalFormats', id] as const,
    freeDownloadStatus: (id: string) =>
      [...queryKeys.releases.all, 'freeDownloadStatus', id] as const,
    filteredList: (params: { search?: string; artistIds?: string[]; take?: number }) =>
      [
        ...queryKeys.releases.all,
        'filteredList',
        params.search ?? '',
        [...(params.artistIds ?? [])].sort().join(','),
        String(params.take ?? ''),
      ] as const,
  },
  artists: {
    all: ['artists'] as const,
    adminInfinite: (params: { search: string; published: boolean | null; deleted: boolean }) =>
      [
        ...queryKeys.artists.all,
        'adminInfinite',
        params.search.trim().toLowerCase(),
        params.published,
        params.deleted,
      ] as const,
    bySlug: (slug: string) => [...queryKeys.artists.all, 'bySlug', slug] as const,
    search: (query: string) => [...queryKeys.artists.all, 'search', query] as const,
    filteredList: (params: { search?: string; take?: number }) =>
      [
        ...queryKeys.artists.all,
        'filteredList',
        params.search ?? '',
        String(params.take ?? ''),
      ] as const,
  },
  featuredArtists: {
    all: ['featuredArtists'] as const,
    list: () => [...queryKeys.featuredArtists.all, 'list'] as const,
    adminInfinite: (params: { search: string; published: boolean | null; deleted: boolean }) =>
      [
        ...queryKeys.featuredArtists.all,
        'adminInfinite',
        params.search.trim().toLowerCase(),
        params.published,
        params.deleted,
      ] as const,
    active: () => [...queryKeys.featuredArtists.all, 'active'] as const,
  },
  collection: {
    all: ['collection'] as const,
    list: () => [...queryKeys.collection.all, 'list'] as const,
  },
  tours: {
    all: ['tours'] as const,
    infinite: (search: string) =>
      [...queryKeys.tours.all, 'infinite', search.trim().toLowerCase()] as const,
    detail: (id: string) => [...queryKeys.tours.all, 'detail', id] as const,
    dates: (tourId: string) => [...queryKeys.tours.all, 'dates', tourId] as const,
  },
  purchaseStatus: {
    bySession: (releaseId: string, sessionId: string) =>
      ['purchaseStatus', releaseId, sessionId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    search: (query: string) => [...queryKeys.notifications.all, 'search', query] as const,
  },
  cdn: {
    all: ['cdn'] as const,
    status: () => [...queryKeys.cdn.all, 'status'] as const,
  },
  downloadAnalytics: {
    all: ['downloadAnalytics'] as const,
    byRelease: (releaseId: string, dateRange: string) =>
      [...queryKeys.downloadAnalytics.all, releaseId, dateRange] as const,
  },
  downloadQuota: {
    all: ['downloadQuota'] as const,
    user: () => [...queryKeys.downloadQuota.all, 'user'] as const,
  },
  health: {
    all: ['health'] as const,
    status: () => [...queryKeys.health.all, 'status'] as const,
  },
  venues: {
    all: ['venues'] as const,
    search: (query: string) => [...queryKeys.venues.all, 'search', query] as const,
    detail: (id: string) => [...queryKeys.venues.all, 'detail', id] as const,
  },
  chat: {
    all: ['chat'] as const,
    messages: () => [...queryKeys.chat.all, 'messages'] as const,
    pinned: () => [...queryKeys.chat.all, 'pinned'] as const,
    adminUsers: (page: number, sortBy: string, sortDirection: string) =>
      [...queryKeys.chat.all, 'adminUsers', page, sortBy, sortDirection] as const,
    mentionSearch: (query: string) => [...queryKeys.chat.all, 'mentionSearch', query] as const,
    me: () => [...queryKeys.chat.all, 'me'] as const,
    reportedUsersInfinite: (windowDays: number | 'all', search?: string) =>
      [
        ...queryKeys.chat.all,
        'reportedUsersInfinite',
        windowDays,
        search?.trim().toLowerCase() ?? '',
      ] as const,
    userMessages: (userId: string) => [...queryKeys.chat.all, 'userMessages', userId] as const,
  },
} as const;
