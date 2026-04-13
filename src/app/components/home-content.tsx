/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

import { Loader2 } from 'lucide-react';

import { useActiveFeaturedArtistsQuery } from '@/app/hooks/use-active-featured-artists-query';
import { useBannersQuery } from '@/app/hooks/use-banners-query';

import { ContentContainer } from './ui/content-container';
import { Heading } from './ui/heading';

import type { BannerSlotData } from './banner-carousel';

const BannerCarouselDynamic = nextDynamic(
  () => import('./banner-carousel').then((mod) => ({ default: mod.BannerCarousel })),
  {
    loading: () => (
      <div className="relative w-full bg-muted animate-pulse" style={{ paddingBottom: '61.8%' }} />
    ),
  }
);

const ArtistSearchInput = nextDynamic(
  () => import('./artist-search-input').then((mod) => ({ default: mod.ArtistSearchInput })),
  {
    ssr: false,
    loading: () => (
      <input
        disabled
        placeholder="search artists..."
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm opacity-50"
        aria-label="Search artists"
      />
    ),
  }
);

const FeaturedArtistsPlayerDynamic = nextDynamic(
  () =>
    import('./featured-artists-player').then((mod) => ({
      default: mod.FeaturedArtistsPlayer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2">
        {/* Artist carousel skeleton */}
        <div className="h-20 w-full bg-muted animate-pulse rounded" />
        {/* Cover art skeleton */}
        <div className="aspect-square w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
        {/* Audio controls skeleton */}
        <div className="h-14 w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
      </div>
    ),
  }
);

/**
 * Client content wrapper for the home page.
 * Uses TanStack Query to fetch banners and featured artists (hydrated from SSR prefetch).
 */
export const HomeContent = () => {
  const { data: bannersData } = useBannersQuery();
  const { isPending: artistsPending, data: artistsData } = useActiveFeaturedArtistsQuery();

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
      {banners.length > 0 && (
        <BannerCarouselDynamic banners={banners} rotationInterval={rotationInterval} />
      )}
      <ContentContainer>
        <ArtistSearchInput />
        <section>
          <Heading level={1}>featured artists</Heading>
          {artistsPending ? (
            <div className="flex min-h-60 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <FeaturedArtistsPlayerDynamic featuredArtists={featuredArtists} />
          )}
        </section>
      </ContentContainer>
    </>
  );
};
