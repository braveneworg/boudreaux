/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { BannerNotificationRepository } from '@/lib/repositories/banner-notification-repository';
import { ChatUserRepository } from '@/lib/repositories/chat-user-repository';
import { FeaturedArtistRepository } from '@/lib/repositories/featured-artist-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { TourDateRepository } from '@/lib/repositories/tours/tour-date-repository';
import { TourRepository } from '@/lib/repositories/tours/tour-repository';

import { AdminStatsService } from './admin-stats-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/release-repository', () => ({
  ReleaseRepository: { count: vi.fn() },
}));
vi.mock('@/lib/repositories/featured-artist-repository', () => ({
  FeaturedArtistRepository: { count: vi.fn() },
}));
vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: { count: vi.fn() },
}));
vi.mock('@/lib/repositories/banner-notification-repository', () => ({
  BannerNotificationRepository: { countActive: vi.fn() },
}));
vi.mock('@/lib/repositories/chat-user-repository', () => ({
  ChatUserRepository: { countFlagged: vi.fn(), countDisabled: vi.fn() },
}));
vi.mock('@/lib/repositories/tours/tour-repository', () => ({
  TourRepository: { count: vi.fn() },
}));
vi.mock('@/lib/repositories/tours/tour-date-repository', () => ({
  TourDateRepository: { countUpcoming: vi.fn() },
}));

describe('AdminStatsService.getStats', () => {
  beforeEach(() => {
    // ReleaseRepository.count: first call = total, second = published
    vi.mocked(ReleaseRepository.count).mockResolvedValueOnce(10).mockResolvedValueOnce(7);
    // ArtistRepository.count: first = total, second = published
    vi.mocked(ArtistRepository.count).mockResolvedValueOnce(20).mockResolvedValueOnce(12);
    vi.mocked(FeaturedArtistRepository.count).mockResolvedValue(3);
    vi.mocked(BannerNotificationRepository.countActive).mockResolvedValue(2);
    vi.mocked(ChatUserRepository.countFlagged).mockResolvedValue(4);
    vi.mocked(ChatUserRepository.countDisabled).mockResolvedValue(1);
    vi.mocked(TourRepository.count).mockResolvedValue(5);
    vi.mocked(TourDateRepository.countUpcoming).mockResolvedValue(8);
  });

  it('reports release totals and derives the draft count', async () => {
    const stats = await AdminStatsService.getStats();

    expect(stats.releases).toEqual({ total: 10, published: 7, draft: 3 });
  });

  it('reports featured artist totals', async () => {
    const stats = await AdminStatsService.getStats();

    expect(stats.featuredArtists).toEqual({ total: 3 });
  });

  it('reports artist totals and published count', async () => {
    const stats = await AdminStatsService.getStats();

    expect(stats.artists).toEqual({ total: 20, published: 12 });
  });

  it('reports active notification slots', async () => {
    const stats = await AdminStatsService.getStats();

    expect(stats.notifications).toEqual({ activeSlots: 2 });
  });

  it('reports chat moderation counts', async () => {
    const stats = await AdminStatsService.getStats();

    expect(stats.chat).toEqual({ flaggedUsers: 4, disabledUsers: 1 });
  });

  it('reports tour totals and upcoming dates', async () => {
    const stats = await AdminStatsService.getStats();

    expect(stats.tours).toEqual({ total: 5, upcomingDates: 8 });
  });

  it('queries published releases with a non-null publishedAt filter', async () => {
    await AdminStatsService.getStats();

    expect(ReleaseRepository.count).toHaveBeenNthCalledWith(2, { publishedAt: { not: null } });
  });
});
