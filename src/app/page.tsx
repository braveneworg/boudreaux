/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BannerNotificationService } from '@/lib/services/banner-notification-service';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';

import { ArtistSearchInput } from './components/artist-search-input';
import { BannerCarousel } from './components/banner-carousel';
import { FeaturedArtistsPlayerClient } from './components/featured-artists-player-client';
import { ContentContainer } from './components/ui/content-container';
import { Heading } from './components/ui/heading';
import PageContainer from './components/ui/page-container';

import type { BannerSlotData } from './components/banner-carousel';

export const dynamic = 'force-dynamic';

const DEFAULT_FEATURED_ARTISTS_LIMIT = 7;

export default async function Home() {
  const [featuredArtistsResult, bannersResult] = await Promise.all([
    FeaturedArtistsService.getFeaturedArtists(new Date(), DEFAULT_FEATURED_ARTISTS_LIMIT),
    BannerNotificationService.getActiveBanners(),
  ]);

  const featuredArtists = featuredArtistsResult.success ? featuredArtistsResult.data : [];

  const banners: BannerSlotData[] = bannersResult.success
    ? bannersResult.data.banners.map((b) => ({
        slotNumber: b.slotNumber,
        imageFilename: b.imageFilename,
        notification: b.notification
          ? {
              id: b.notification.id,
              content: b.notification.content,
              textColor: b.notification.textColor,
              backgroundColor: b.notification.backgroundColor,
            }
          : null,
      }))
    : [];

  const rotationInterval = bannersResult.success ? bannersResult.data.rotationInterval : undefined;

  return (
    <PageContainer>
      {banners.length > 0 && (
        <BannerCarousel banners={banners} rotationInterval={rotationInterval} />
      )}
      <ContentContainer>
        <ArtistSearchInput />
        <section>
          <Heading level={1}>featured artists</Heading>
          <FeaturedArtistsPlayerClient featuredArtists={featuredArtists} />
        </section>
      </ContentContainer>
    </PageContainer>
  );
}
