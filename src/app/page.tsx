/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';

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
  const [featuredArtistsUrl, bannersUrl] = await Promise.all([
    getInternalApiUrl(`/api/featured-artists?active=true&limit=${DEFAULT_FEATURED_ARTISTS_LIMIT}`),
    getInternalApiUrl('/api/notification-banners'),
  ]);

  const [featuredArtistsRes, bannersRes] = await Promise.all([
    fetch(featuredArtistsUrl, { cache: 'no-store' }),
    fetch(bannersUrl, { cache: 'no-store' }),
  ]);

  const featuredArtists = featuredArtistsRes.ok
    ? ((await featuredArtistsRes.json()).featuredArtists ?? [])
    : [];

  const bannersData = bannersRes.ok ? await bannersRes.json() : null;

  const banners: BannerSlotData[] = bannersData?.banners
    ? bannersData.banners.map(
        (b: {
          slotNumber: number;
          imageFilename: string;
          notification: {
            id: string;
            content: string;
            textColor: string | null;
            backgroundColor: string | null;
          } | null;
        }) => ({
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
        })
      )
    : [];

  const rotationInterval = bannersData?.rotationInterval ?? undefined;

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
