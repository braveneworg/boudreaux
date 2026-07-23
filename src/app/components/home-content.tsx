/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useActiveFeaturedArtistsQuery } from '@/hooks/queries/use-active-featured-artists-query';
import { useBannersQuery } from '@/hooks/queries/use-banners-query';

import { ArtistSearchInput } from './artist-search-input';
import { BannerCarousel } from './banner-carousel';
import { BannerStrip } from './banner-strip';
// Static import on purpose: the server HTML must contain the selected
// artist's cover art — the desktop LCP element — so the browser's preload
// scanner discovers it immediately. `next/dynamic` cannot deliver that in
// the App Router: it server-renders only its `loading` fallback (verified on
// the webpack prod standalone), which cost ~1.4s of measured LCP load delay.
// video.js stays out of the initial bundle regardless: MediaPlayer.Controls
// is `LazyControls`, its own `ssr: false` dynamic boundary.
import { FeaturedArtistsPlayer } from './featured-artists-player';
import { ReleaseHeadlines } from './release-headlines';
import { ContentContainer } from './ui/content-container';
import { ImageHeading } from './ui/image-heading';
import { ZinePanel } from './ui/zine-panel';

import type { BannerSlotData } from './banner-carousel';

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
        {/* Desktop (lg+) reflows via explicit grid placement: search on top,
            then the player spanning the left half beside the wordmark, which
            caps the infinitely-scrolling release headlines on the right half
            (top-aligned with the carousel, fixed while the feed pane scrolls
            internally). Mobile keeps the stacked search → heading → player
            flow via plain block order. */}
        <ZinePanel chat accent="yellow">
          {/* Desktop: clear air beneath the search box before the split. */}
          <div className="lg:mb-8">
            <ArtistSearchInput />
          </div>
          {/* grid-rows [auto,1fr] keeps the wordmark row content-sized so the
              tall row-spanning player can't inflate the gap beneath it. */}
          <div className="lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10">
            {/* No `priority`: this heading sits below the banner and search
                input, so it's not the LCP — a preload would go unused below
                the fold on mobile. `loading="eager"` still starts the fetch at
                render (not viewport intersection) so the wordmark doesn't
                linger as an empty sketch frame after navigation. Extra
                vertical air (landing only) separates the search field above
                from the player below; on desktop the wordmark heads the
                headlines column with ample air before the feed. */}
            <ImageHeading
              src="/media/headings/FEATURED.webp"
              alt="featured artists"
              imageHeight={480}
              loading="eager"
              className="mt-8 mb-6 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:mb-8"
            />
            <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <FeaturedArtistsPlayer featuredArtists={featuredArtists} />
            </div>
            <div className="lg:col-start-2 lg:row-start-2">
              <ReleaseHeadlines />
            </div>
          </div>
        </ZinePanel>
      </ContentContainer>
    </>
  );
};
