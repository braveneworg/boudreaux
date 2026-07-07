/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import type { ActiveFeaturedArtistsResponse } from '@/app/hooks/use-active-featured-artists-query';
import { HomeContent } from '@/components/home-content';
import { PUBLISHED_RELEASES_PAGE_SIZE } from '@/hooks/use-infinite-published-releases-query';
import { queryKeys } from '@/lib/query-keys';
import {
  type BannersApiResponse,
  BannerNotificationService,
} from '@/lib/services/banner-notification-service';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { ReleaseService } from '@/lib/services/release-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import {
  buildBannerPreloadSrcSet,
  buildImagePreloadSrcSet,
  isPreloadableImageSrc,
} from '@/lib/utils/cloudfront-loader';
import { getFeaturedArtistCoverArt } from '@/lib/utils/get-featured-artist-cover-art';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { PageContainer } from '@/ui/page-container';

/**
 * Force dynamic rendering on every request.
 *
 * The featured-artists payload contains short-lived CloudFront-signed
 * streaming URLs (~24h TTL) generated server-side by `attachStreamUrls`.
 * If Next.js statically generates this page (or caches the fetch via
 * `revalidate`), the dehydrated state ships with a signature created at
 * build time / cache-write time, which can be stale on the very first
 * request after a deploy or after the fetch cache rolls over — producing
 * 403s in the audio player until a refresh forces a fresh render.
 *
 * Forcing dynamic guarantees every request signs URLs with the current
 * server time, against the current env-provided key pair.
 */
export const dynamic = 'force-dynamic';

/**
 * Resolve the desktop LCP preload target from the prefetched featured-artist
 * cache: the cover art of the first artist with a displayable name — the same
 * selection the SSR'd `FeaturedArtistsPlayer` makes. Returns null when there
 * is nothing preloadable (no artists, no art, or a local `data:`/`blob:`
 * source such as the seeded placeholder, which has nothing to fetch).
 */
const resolveCoverArtPreloadSrc = (
  artistsData: ActiveFeaturedArtistsResponse | undefined
): string | null => {
  const firstDisplayableArtist = artistsData?.featuredArtists?.find(
    (featured) => getFeaturedArtistDisplayName(featured) !== null
  );
  const coverArt = firstDisplayableArtist
    ? getFeaturedArtistCoverArt(firstDisplayableArtist)
    : null;
  return coverArt && isPreloadableImageSrc(coverArt) ? coverArt : null;
};

/**
 * Home page — Server Component that prefetches banners and featured artists,
 * then hydrates client components for interactivity.
 *
 * The hero banner LCP preload is emitted here as a media-scoped
 * `<link rel=preload as=image media="(max-width: 767.98px)">` for the first
 * banner slot. It is REQUIRED for mobile LCP — HomeContent hydrates from a
 * client query cache, so without a server-rendered preload the banner isn't
 * discovered until hydration (pushing LCP to ~9s). Scoping it to the mobile
 * breakpoint matters because the `BannerCarousel` is `md:hidden` on desktop
 * (the `BannerStrip` shows instead); an unconditional preload — e.g. the one
 * `next/image` `priority` emits — would be fetched on desktop and never used,
 * triggering Chrome's "preloaded but not used" warning. The `imagesrcset`
 * mirrors what the carousel's `<Image>` requests (via `buildBannerPreloadSrcSet`,
 * same custom loader), so the preload cache hits the rendered `<img>`.
 *
 * The featured-artist cover art gets the mirror treatment for desktop: the
 * player server-renders (see home-content.tsx), so its `<Image>` — the desktop
 * LCP element — is already in the initial HTML, but as a non-priority lazy
 * image it wouldn't start fetching until after layout. The
 * `(min-width: 1024px)` preload below starts that fetch at HTML parse.
 * The media query matches the `lg` grid split that places the cover above the
 * fold; below `lg` it sits below the fold, where a preload would be flagged
 * "preloaded but not used". `imageSizes="576px"` mirrors the img's effective
 * `sizes` at those viewports so the preload picker and the img choose the
 * same `_w` variant and the preload cache hits.
 */
export default async function Home() {
  const queryClient = getQueryClient();

  // Both prefetches call the services directly rather than fetching our own
  // API routes over HTTP — same data, same shapes as the routes the client
  // hooks hit, minus a self-HTTP round-trip per query on this force-dynamic
  // page. Server-side caching is preserved: both services cache via
  // `withCache`, and `attachStreamUrls` signs URLs at request time (see the
  // `force-dynamic` comment above).
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.featuredArtists.active(),
      queryFn: async () => {
        const result = await FeaturedArtistsService.getFeaturedArtists(new Date(), 7);
        if (!result.success) {
          throw new Error(result.error);
        }
        // Mirror /api/featured-artists?active=true: BigInt → Number, then
        // attach fresh CloudFront-signed stream URLs.
        return {
          featuredArtists: attachStreamUrls(serializeForResponse(result.data)),
          count: result.data.length,
        };
      },
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.banners.active(),
      queryFn: async () => {
        const result = await BannerNotificationService.getActiveBanners();
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
    }),
    // First page of the desktop headlines feed. The query key and
    // initialPageParam must exactly match useInfinitePublishedReleasesQuery('')
    // in ReleaseHeadlines or hydration misses and the column renders empty
    // until a client refetch — the last piece of the landing that used to pop
    // in after navigation. Same service-direct pattern as /releases/page.tsx.
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.releases.publishedInfinite(''),
      initialPageParam: 0,
      queryFn: async () => {
        const result = await ReleaseService.getPublishedReleases({
          skip: 0,
          take: PUBLISHED_RELEASES_PAGE_SIZE,
        });
        const rows = result.success ? result.data : [];
        return serializeForResponse({
          rows,
          nextSkip: computeNextSkip(rows.length, 0, PUBLISHED_RELEASES_PAGE_SIZE),
        });
      },
    }),
  ]);

  // Read the prefetched banners back out of the query cache (no extra service
  // call) to build the first-slot preload. `banners[0]` is carousel slide 0.
  const bannersData = queryClient.getQueryData<BannersApiResponse>(queryKeys.banners.active());
  const firstBannerFilename = bannersData?.banners?.[0]?.imageFilename;

  // Same read-back for the featured artists (see resolveCoverArtPreloadSrc).
  const coverArtPreloadSrc = resolveCoverArtPreloadSrc(
    queryClient.getQueryData<ActiveFeaturedArtistsResponse>(queryKeys.featuredArtists.active())
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {firstBannerFilename && (
        <link
          rel="preload"
          as="image"
          media="(max-width: 767.98px)"
          imageSrcSet={buildBannerPreloadSrcSet(firstBannerFilename)}
          imageSizes="100vw"
          fetchPriority="high"
        />
      )}
      {coverArtPreloadSrc && (
        <link
          rel="preload"
          as="image"
          media="(min-width: 1024px)"
          imageSrcSet={buildImagePreloadSrcSet(coverArtPreloadSrc)}
          imageSizes="576px"
          fetchPriority="high"
        />
      )}
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
