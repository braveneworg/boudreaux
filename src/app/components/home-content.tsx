/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useActiveFeaturedArtistsQuery } from '@/app/hooks/use-active-featured-artists-query';
import { useBannersQuery } from '@/app/hooks/use-banners-query';

import { ArtistSearchInput } from './artist-search-input';
import { BannerCarousel } from './banner-carousel';
import { FeaturedArtistsPlayer } from './featured-artists-player';
import { ContentContainer } from './ui/content-container';
import { Heading } from './ui/heading';

import type { BannerSlotData } from './banner-carousel';

/**
 * Client content wrapper for the home page.
 * Uses TanStack Query to fetch banners and featured artists (hydrated from SSR prefetch).
 */
export const HomeContent = () => {
  const { data: bannersData } = useBannersQuery();
  const { data: artistsData } = useActiveFeaturedArtistsQuery();

  const banners: BannerSlotData[] = bannersData?.banners
    ? bannersData.banners.map((b: Record<string, unknown>) => ({
        slotNumber: b.slotNumber as number,
        imageFilename: b.imageFilename as string,
        notification: b.notification
          ? {
              id: (b.notification as Record<string, unknown>).id as string,
              content: (b.notification as Record<string, unknown>).content as string,
              textColor: (b.notification as Record<string, unknown>).textColor as string | null,
              backgroundColor: (b.notification as Record<string, unknown>).backgroundColor as
                | string
                | null,
            }
          : null,
      }))
    : [];

  const rotationInterval = bannersData?.rotationInterval as number | undefined;
  const featuredArtists = artistsData?.featuredArtists ?? [];

  return (
    <>
      {/* Always render BannerCarousel — when empty it renders a placeholder
          section to reserve space, and keeping a single code path avoids a
          conditional mount that could shift layout during hydration. */}
      <BannerCarousel banners={banners} rotationInterval={rotationInterval} useVariants />
      <ContentContainer>
        <ArtistSearchInput />
        <section>
          <Heading level={1}>featured artists</Heading>
          <FeaturedArtistsPlayer featuredArtists={featuredArtists} />
        </section>
      </ContentContainer>
    </>
  );
};
