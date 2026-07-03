/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

import { useActiveFeaturedArtistsQuery } from '@/app/hooks/use-active-featured-artists-query';
import { useBannersQuery } from '@/app/hooks/use-banners-query';

import { ArtistSearchInput } from './artist-search-input';
import { BannerCarousel } from './banner-carousel';
import { BannerStrip } from './banner-strip';
import { ReleaseHeadlines } from './release-headlines';
import { ContentContainer } from './ui/content-container';
import { ImageHeading } from './ui/image-heading';
import { ZinePanel } from './ui/zine-panel';

import type { BannerSlotData } from './banner-carousel';

// video.js and the featured-artists player bundle are the bulk of the homepage
// JS. Defer hydration until after the banner paints (below-the-fold UI).
const FeaturedArtistsPlayer = nextDynamic(
  () => import('./featured-artists-player').then((m) => ({ default: m.FeaturedArtistsPlayer })),
  {
    ssr: false,
    loading: () => <div aria-hidden className="min-h-112" />,
  }
);

/**
 * Client content wrapper for the home page.
 * Uses TanStack Query to fetch banners and featured artists (hydrated from SSR prefetch).
 */
export const HomeContent = () => {
  const { data: artistsData } = useActiveFeaturedArtistsQuery();
  const { data: bannersData } = useBannersQuery();

  // The query is typed as BannersApiResponse, whose BannerSlotResponse rows
  // are a structural superset of BannerSlotData (they also carry
  // displayFrom/displayUntil, which the carousel ignores), so they pass
  // straight through without a field-by-field remap.
  const banners: BannerSlotData[] = bannersData?.banners ?? [];
  const rotationInterval = bannersData?.rotationInterval;
  const featuredArtists = artistsData?.featuredArtists ?? [];

  return (
    <>
      {/* Both banner treatments render at every breakpoint and CSS picks the
          visible one — so each is correct from first paint with no JS-driven
          swap (which would flash + shift layout during hydration). Carousel
          below md (<768px); stitched strip at md and up. */}
      <BannerCarousel banners={banners} rotationInterval={rotationInterval} />
      <BannerStrip banners={banners} rotationInterval={rotationInterval} />
      <ContentContainer>
        {/* Desktop (lg+) reflows via CSS order/grid: wordmark first, search
            beneath it, then the player on the left half beside the
            infinitely-scrolling release headlines on the right half. Mobile
            keeps the stacked search → heading → player flow. */}
        <ZinePanel chat accent="yellow" contentClassName="lg:flex lg:flex-col">
          {/* Desktop: clear air beneath the search box before the split. */}
          <div className="lg:mb-8">
            <ArtistSearchInput />
          </div>
          {/* No `priority`: this heading sits below the banner and search
              input, so it's not the LCP — it lazy-loads normally. Extra
              vertical air (landing only) separates the search field above
              from the player below; on desktop the wordmark leads with
              tighter margins. */}
          <ImageHeading
            src="/media/headings/FEATURED.webp"
            alt="featured artists"
            imageHeight={480}
            className="mt-8 mb-6 lg:order-first lg:mt-0 lg:mb-3"
          />
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
            <FeaturedArtistsPlayer featuredArtists={featuredArtists} />
            <ReleaseHeadlines />
          </div>
        </ZinePanel>
      </ContentContainer>
    </>
  );
};
