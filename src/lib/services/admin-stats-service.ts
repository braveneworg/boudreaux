/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { BannerNotificationRepository } from '@/lib/repositories/banner-notification-repository';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { FeaturedArtistRepository } from '@/lib/repositories/featured-artist-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';

/** Aggregated counts powering the admin dashboard overview. */
export interface AdminStats {
  releases: { total: number; published: number; draft: number };
  featuredArtists: { total: number };
  artists: { total: number; published: number };
  notifications: { activeSlots: number };
  chat: { flaggedUsers: number; disabledUsers: number };
  tours: { total: number; upcomingDates: number };
  videos: { total: number; published: number; draft: number };
}

/**
 * Read-only aggregation layer for the admin dashboard. Each figure is sourced
 * from the repository layer (never Prisma directly) and all counts are gathered
 * concurrently so the dashboard renders from a single round of queries.
 */
export class AdminStatsService {
  /** Gather every dashboard statistic in one concurrent pass. */
  static async getStats(): Promise<AdminStats> {
    const [
      releasesTotal,
      releasesPublished,
      featuredTotal,
      artistsTotal,
      artistsPublished,
      activeSlots,
      flaggedUsers,
      disabledUsers,
      toursTotal,
      upcomingDates,
      videosTotal,
      videosPublished,
    ] = await Promise.all([
      ReleaseRepository.count(),
      ReleaseRepository.count({ published: true }),
      FeaturedArtistRepository.count(),
      ArtistRepository.count(),
      ArtistRepository.count({ published: true }),
      BannerNotificationRepository.countActive(),
      ChatUserRepository.countFlagged(),
      ChatUserRepository.countDisabled(),
      TourRepository.count(),
      TourDateRepository.countUpcoming(),
      VideoRepository.count(),
      VideoRepository.count({ published: true }),
    ]);

    return {
      releases: {
        total: releasesTotal,
        published: releasesPublished,
        draft: releasesTotal - releasesPublished,
      },
      featuredArtists: { total: featuredTotal },
      artists: { total: artistsTotal, published: artistsPublished },
      notifications: { activeSlots },
      chat: { flaggedUsers, disabledUsers },
      tours: { total: toursTotal, upcomingDates },
      videos: {
        total: videosTotal,
        published: videosPublished,
        draft: videosTotal - videosPublished,
      },
    };
  }
}
