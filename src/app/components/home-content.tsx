/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

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
      <div className="relative w-full">
        <div className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 bg-muted rounded" />
        <input
          disabled
          placeholder="Search artists & releases"
          className="border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 pl-9 text-base opacity-50 md:text-sm"
          aria-label="Search artists and releases"
        />
      </div>
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
        {/* FormatFileListDrawer skeleton */}
        <div className="flex flex-col items-center">
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        {/* Download button skeleton */}
        <div className="flex justify-center">
          <div className="h-10 w-40 bg-muted animate-pulse rounded" />
        </div>
        {/* NowPlayingHeading skeleton */}
        <div className="flex justify-center">
          <div className="h-6 w-56 bg-muted animate-pulse rounded" />
        </div>
        {/* Cover art skeleton */}
        <div className="aspect-square w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
        {/* Audio controls skeleton */}
        <div className="h-14 w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
        {/* InfoTickerTape skeleton */}
        <div className="h-6 w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
        {/* Share widget skeleton */}
        <div className="flex justify-center gap-1">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-px max-w-[calc(100%-2rem)] mx-auto bg-muted" />
      </div>
    ),
  }
);

/**
 * Client content wrapper for the home page.
 * Uses TanStack Query to fetch banners and featured artists (hydrated from SSR prefetch).
 */
export const HomeContent = () => {
  const { isPending: bannersPending, data: bannersData } = useBannersQuery();
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
      {bannersPending ? (
        <div
          className="relative w-full bg-muted animate-pulse"
          style={{ paddingBottom: '61.8%' }}
        />
      ) : banners.length > 0 ? (
        <BannerCarouselDynamic banners={banners} rotationInterval={rotationInterval} />
      ) : null}
      <ContentContainer>
        <ArtistSearchInput />
        <section>
          <Heading level={1}>featured artists</Heading>
          {artistsPending ? (
            <div className="space-y-2">
              {/* Artist carousel skeleton */}
              <div className="h-20 w-full bg-muted animate-pulse rounded" />
              {/* FormatFileListDrawer skeleton */}
              <div className="flex flex-col items-center">
                <div className="h-10 w-48 bg-muted animate-pulse rounded" />
              </div>
              {/* Download button skeleton */}
              <div className="flex justify-center">
                <div className="h-10 w-40 bg-muted animate-pulse rounded" />
              </div>
              {/* NowPlayingHeading skeleton */}
              <div className="flex justify-center">
                <div className="h-6 w-56 bg-muted animate-pulse rounded" />
              </div>
              {/* Cover art skeleton */}
              <div className="aspect-square w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
              {/* Audio controls skeleton */}
              <div className="h-14 w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
              {/* InfoTickerTape skeleton */}
              <div className="h-6 w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
              {/* Share widget skeleton */}
              <div className="flex justify-center gap-1">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-px max-w-[calc(100%-2rem)] mx-auto bg-muted" />
            </div>
          ) : (
            <FeaturedArtistsPlayerDynamic featuredArtists={featuredArtists} />
          )}
        </section>
      </ContentContainer>
    </>
  );
};
