/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import {
  type BannersApiResponse,
  BannerNotificationService,
} from '@/lib/services/banner-notification-service';
import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import { buildBannerPreloadSrcSet } from '@/lib/utils/cloudfront-loader';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';

import { HomeContent } from './components/home-content';
import { PageContainer } from './components/ui/page-container';

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
 * The featured-artist cover art is intentionally NOT preloaded: the
 * `FeaturedArtistsPlayer` is dynamic-imported with `ssr: false`, so the `<img>`
 * that would consume the preload doesn't render until after Video.js's chunk
 * loads — well past `window.load` — which also logs "preloaded but not used".
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
  ]);

  // Read the prefetched banners back out of the query cache (no extra service
  // call) to build the first-slot preload. `banners[0]` is carousel slide 0.
  const bannersData = queryClient.getQueryData<BannersApiResponse>(queryKeys.banners.active());
  const firstBannerFilename = bannersData?.banners?.[0]?.imageFilename;

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
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
