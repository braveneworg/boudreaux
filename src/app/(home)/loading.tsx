/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';

import { FeaturedArtistsPlayerSkeleton } from '@/components/featured-artists-player-skeleton';
import { ContentContainer } from '@/components/ui/content-container';
import { ZinePanel } from '@/components/ui/zine-panel';
import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';
import { buildBannerPreloadUrl } from '@/lib/utils/cloudfront-loader';
import { PageContainer } from '@/ui/page-container';

/**
 * Suspense fallback for `/`. It mirrors the hydrated landing layout at every
 * breakpoint — carousel below `md`, stitched BannerStrip frame at `md`+, and
 * the ZinePanel with the `lg` player/headlines grid split — so client-side
 * navigations swap skeleton → page in place instead of flashing a different
 * layout for the duration of the dynamic render (~300ms warm).
 */
export default function HomeLoading() {
  return (
    <PageContainer>
      <div className="w-full">
        {/* Mobile banner treatment (carousel is `md:hidden` when hydrated). */}
        <div data-testid="mobile-banner-skeleton" className="md:hidden">
          {/* Notification strip skeleton — always reserves 2.5rem to match banner-carousel */}
          <div className="bg-muted w-full animate-pulse" style={{ minHeight: '2.5rem' }} />
          {/* Real first banner image — rendered in the Suspense fallback so it
              paints in the first HTML flush during route transitions. The
              hydrated BannerCarousel uses Next/Image's `priority` to emit a
              responsive preload (with matching `imagesrcset`/`imagesizes`) for
              the actual rendered slide. We use `unoptimized` with a single-width
              `src` (so next/image emits no `srcSet`/`sizes`) and `loading="eager"`
              so this fallback paints immediately without the browser running its
              preload-picker algorithm in the suspense interval. `width`/`height`
              carry the source 1920×1097 aspect ratio; CSS controls the rendered box. */}
          <div
            className="bg-muted relative w-full"
            style={{ paddingBottom: BANNER_ASPECT_PADDING }}
          >
            <Image
              data-testid="lcp-banner-img"
              src={buildBannerPreloadUrl(BANNER_SLOTS[0].filename, 750)}
              alt=""
              width={1920}
              height={1097}
              unoptimized
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          {/* Dot indicators skeleton — matches h-11 w-11 button wrappers */}
          <div className="flex justify-center gap-2 py-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex h-11 w-11 items-center justify-center">
                <div className="bg-muted h-2.5 w-2.5 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        {/* Desktop banner treatment — same frame as the real BannerStrip
            (`hidden md:block`, yellow accent, 2px black border) with one
            aspect-locked pulse cell per slot so the strip swaps in without
            moving anything. */}
        <div
          data-testid="banner-strip-skeleton"
          className="zine-accent-yellow shadow-zine-sm mx-auto mt-4 hidden w-full max-w-7xl border-2 border-black md:block"
        >
          {/* Notification ticker row above the image band. */}
          <div className="bg-muted h-10 w-full animate-pulse" />
          <div className="flex w-full">
            {BANNER_SLOTS.map((slot) => (
              <div
                key={slot.slotNumber}
                data-testid="banner-strip-skeleton-cell"
                className="bg-muted relative aspect-[1920/1097] flex-1 animate-pulse"
              />
            ))}
          </div>
        </div>
        <ContentContainer>
          <ZinePanel accent="yellow">
            {/* Search input skeleton — matches ArtistSearchInput's h-9 row. */}
            <div className="lg:mb-8">
              <div className="bg-muted h-9 w-full animate-pulse" />
            </div>
            <div
              data-testid="home-skeleton-grid"
              className="lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-10"
            >
              {/* FEATURED wordmark skeleton — full-width 4:1 image below `sm`,
                  fixed h-14 (224px wide) from `sm` up, right column on `lg`. */}
              <div
                data-testid="featured-heading-skeleton"
                className="mt-8 mb-6 lg:col-start-2 lg:row-start-1 lg:mt-0 lg:mb-8"
              >
                <div className="bg-muted aspect-[4/1] w-full animate-pulse sm:aspect-auto sm:h-14 sm:w-56" />
              </div>
              {/* Player skeleton — left column spanning both rows on `lg`.
                  The shared skeleton matches FeaturedArtistsPlayer's stacked
                  internals and doubles as the player's dynamic-import
                  fallback, so route-fallback → chunk-fallback → player is
                  pixel-stable. */}
              <div
                data-testid="player-skeleton"
                className="lg:col-start-1 lg:row-span-2 lg:row-start-1"
              >
                <FeaturedArtistsPlayerSkeleton />
              </div>
              {/* Release headlines skeleton — desktop-only column, like the
                  hydrated feed (`hidden lg:block`). */}
              <div
                data-testid="headlines-skeleton"
                className="hidden space-y-7 lg:col-start-2 lg:row-start-2 lg:block"
              >
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="bg-muted h-7 w-4/5 animate-pulse" />
                    <div className="bg-muted h-4 w-2/5 animate-pulse" />
                    <div className="bg-muted h-3 w-full animate-pulse" />
                    <div className="bg-muted h-3 w-11/12 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </ZinePanel>
        </ContentContainer>
      </div>
    </PageContainer>
  );
}
