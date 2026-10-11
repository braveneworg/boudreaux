/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { HomeContent } from '@/components/home-content';
import {
  type ActiveFeaturedArtistsResponse,
  SPOTLIGHT_LIMIT,
} from '@/hooks/queries/use-active-featured-artists-query';
import type { PublishedReleasesPaginatedResponse } from '@/hooks/queries/use-infinite-published-releases-query';
import { queryKeys } from '@/lib/query-keys';
import {
  type BannersApiResponse,
  BannerNotificationService,
} from '@/lib/services/banner-notification-service';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { ReleaseService } from '@/lib/services/release-service';
import { computeNextSkip } from '@/lib/types/pagination';
import {
  buildBannerPreloadSrcSet,
  buildImagePreloadSrcSet,
  isPreloadableImageSrc,
} from '@/lib/utils/cloudfront-loader';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import {
  publishedReleasesToSpotlightCards,
  SPOTLIGHT_COVER_SIZES,
  type SpotlightCard,
  toSpotlightCards,
} from '@/lib/utils/spotlight-card';
import { PageContainer } from '@/ui/page-container';

/**
 * Force dynamic rendering on every request.
 *
 * The spotlights are chosen by today's date, and the banners and releases
 * change as admins publish. A statically generated page would ship the set
 * chosen at build time until the next deploy; the services' own `withCache`
 * keeps the per-request cost low.
 */
export const dynamic = 'force-dynamic';

type HomeQueryClient = ReturnType<typeof getQueryClient>;

/**
 * Prefetch the spotlights and the banners. Both call the services directly
 * rather than fetching our own API routes over HTTP — same data, same shapes
 * as the routes the client hooks hit, minus a self-HTTP round-trip per query
 * on this force-dynamic page. Server-side caching is preserved: the services
 * cache via `withCache` (see the `force-dynamic` comment above).
 */
const prefetchSpotlightsAndBanners = (queryClient: HomeQueryClient): Promise<[void, void]> =>
  Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.featuredArtists.active(),
      queryFn: async () => {
        const result = await FeaturedArtistsService.getFeaturedArtists(new Date(), SPOTLIGHT_LIMIT);
        if (!result.success) {
          throw new Error(result.error);
        }
        // Mirror /api/featured-artists?active=true: BigInt → Number. A featured
        // row carries only the playable format, served unsigned.
        return {
          featuredArtists: serializeForResponse(result.data),
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
  ]);

/**
 * The grid's cards, by the rule HomeContent applies: the spotlights, or — once
 * they have loaded and none can render — the newest published releases, which
 * are prefetched then under the same key and page as
 * `useNewestPublishedReleasesQuery(SPOTLIGHT_LIMIT)`, serialized as the API
 * route does, so the grid hydrates server-filled.
 */
const prefetchGridCards = async (queryClient: HomeQueryClient): Promise<SpotlightCard[]> => {
  const artistsData = queryClient.getQueryData<ActiveFeaturedArtistsResponse>(
    queryKeys.featuredArtists.active()
  );
  const spotlightCards = toSpotlightCards(artistsData?.featuredArtists ?? []);
  if (artistsData === undefined || spotlightCards.length > 0) {
    return spotlightCards;
  }

  const newestKey = queryKeys.releases.newestPublished(SPOTLIGHT_LIMIT);
  await queryClient.prefetchQuery({
    queryKey: newestKey,
    queryFn: async () => {
      const result = await ReleaseService.getPublishedReleases({ skip: 0, take: SPOTLIGHT_LIMIT });
      if (!result.success) {
        throw new Error(result.error);
      }
      return serializeForResponse({
        rows: result.data,
        nextSkip: computeNextSkip(result.data.length, 0, SPOTLIGHT_LIMIT),
      });
    },
  });
  return publishedReleasesToSpotlightCards(
    queryClient.getQueryData<PublishedReleasesPaginatedResponse>(newestKey)?.rows ?? []
  );
};

/**
 * The cover the page preloads: the first card's, when it has one the browser
 * can fetch (a local `data:`/`blob:` source such as the seeded placeholder
 * has nothing to fetch).
 */
const resolveCoverArtPreloadSrc = (cards: SpotlightCard[]): string | null => {
  const coverArt = cards[0]?.coverArt;
  return coverArt && isPreloadableImageSrc(coverArt) ? coverArt : null;
};

/**
 * Home page — Server Component that prefetches the banners and the spotlights
 * (or, with none to show, the newest releases), then hydrates client
 * components for interactivity.
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
 * The first spotlight card's cover gets a preload too. The grid server-renders
 * (see home-content.tsx) above the fold at every width, so this preload has no
 * media query; it starts the fetch at HTML parse instead of after layout.
 * `imageSizes` is the card image's own `sizes`, so the preload picker and the
 * img choose the same `_w` variant and the preload cache hits.
 */
export default async function Home() {
  const queryClient = getQueryClient();
  await prefetchSpotlightsAndBanners(queryClient);

  // Read the prefetched banners back out of the query cache (no extra service
  // call) to build the first-slot preload. `banners[0]` is carousel slide 0.
  const bannersData = queryClient.getQueryData<BannersApiResponse>(queryKeys.banners.active());
  const firstBannerFilename = bannersData?.banners?.[0]?.imageFilename;
  const coverArtPreloadSrc = resolveCoverArtPreloadSrc(await prefetchGridCards(queryClient));

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
          imageSrcSet={buildImagePreloadSrcSet(coverArtPreloadSrc)}
          imageSizes={SPOTLIGHT_COVER_SIZES}
          fetchPriority="high"
        />
      )}
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
