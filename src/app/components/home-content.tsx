/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  SPOTLIGHT_LIMIT,
  useActiveFeaturedArtistsQuery,
} from '@/hooks/queries/use-active-featured-artists-query';
import { useBannersQuery } from '@/hooks/queries/use-banners-query';
import { useNewestPublishedReleasesQuery } from '@/hooks/queries/use-infinite-published-releases-query';
import {
  publishedReleasesToSpotlightCards,
  SPOTLIGHT_COVER_SPAN_CLASS,
  toSpotlightCards,
} from '@/lib/utils/spotlight-card';

import { ArtistNavSearchCombobox } from './artist-nav-search-combobox';
import { BannerCarousel } from './banner-carousel';
import { BannerStrip } from './banner-strip';
// Static import on purpose: the server HTML must contain the cards' covers so
// the browser's preload scanner finds them at once. `next/dynamic` cannot do
// that in the App Router: it server-renders only its `loading` fallback.
import { SpotlightGrid } from './spotlight-grid';
import { ContentContainer } from './ui/content-container';
import { ImageHeading } from './ui/image-heading';
import { ZinePanel } from './ui/zine-panel';

import type { BannerSlotData } from './banner-carousel';

/**
 * Client content wrapper for the home page: the banners, then the search, the
 * FEATURED heading and the spotlight grid. Uses TanStack Query for the
 * banners and spotlights (hydrated from the SSR prefetch). With no spotlight
 * to show, the grid shows the newest published releases instead.
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

  const spotlightCards = toSpotlightCards(artistsData?.featuredArtists ?? []);
  // Fall back only once the spotlights have loaded and none can render, so
  // the newest releases are never fetched while there are spotlights.
  const showNewest = artistsData !== undefined && spotlightCards.length === 0;
  const { data: newestReleases } = useNewestPublishedReleasesQuery(SPOTLIGHT_LIMIT, {
    enabled: showNewest,
  });
  const cards = showNewest
    ? publishedReleasesToSpotlightCards(newestReleases ?? [])
    : spotlightCards;

  return (
    <>
      {/* Both banner treatments render at every breakpoint and CSS picks the
          visible one — so each is correct from first paint with no JS-driven
          swap (which would flash + shift layout during hydration). Carousel
          below md (<768px); stitched strip at md and up. */}
      <BannerCarousel banners={banners} rotationInterval={rotationInterval} />
      <BannerStrip banners={banners} rotationInterval={rotationInterval} />
      <ContentContainer>
        <ZinePanel chat accent="yellow">
          <div className="mb-8">
            {/* The search and the wordmark share this column so the wordmark's
                left edge sits on the search box's left edge at every column
                count, not on the panel padding. */}
            <div className={SPOTLIGHT_COVER_SPAN_CLASS}>
              <ArtistNavSearchCombobox />
              {/* No `priority`: the spotlight covers, not this wordmark, are
                  the LCP candidates, and the page preloads the first one.
                  `eager` still starts the fetch at render so the wordmark
                  doesn't linger as an empty frame after navigation. */}
              <ImageHeading
                src="/media/headings/FEATURED.webp"
                alt="featured artists"
                imageHeight={480}
                loading="eager"
                className="mt-6 mb-0 block text-left"
              />
            </div>
            {/* Touch screens get no hover stamp on the covers, so they get
                this line instead; `hover:none` is the same test that keeps
                the stamp to hover and keyboard focus. */}
            {cards.length > 0 ? (
              <p className="mt-4 hidden text-center text-sm text-zinc-600 [@media(hover:none)]:block">
                <strong className="font-bold text-zinc-950">Tap</strong> any release art to play or
                download the music
              </p>
            ) : null}
          </div>
          <SpotlightGrid cards={cards} />
        </ZinePanel>
      </ContentContainer>
    </>
  );
};
