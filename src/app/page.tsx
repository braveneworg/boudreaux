/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { HomeContent } from './components/home-content';
import PageContainer from './components/ui/page-container';

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
 * The hero banner LCP preload is emitted as an HTTP Link header (see
 * next.config.ts). The featured-artist cover art is intentionally NOT
 * preloaded here: the `FeaturedArtistsPlayer` is dynamic-imported with
 * `ssr: false`, so the `<img>` that would consume the preload doesn't
 * render until after Video.js's chunk has loaded — well past the
 * `window.load` event — which causes Chrome to log
 * "preloaded using link preload but not used within a few seconds".
 */
export default async function Home() {
  const queryClient = getQueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.featuredArtists.active(),
      // No `revalidate` here on purpose — see the `force-dynamic` comment
      // above. Caching the response would cache the signed streamUrl too.
      queryFn: () => fetchApi('/api/featured-artists?active=true&limit=7'),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.banners.active(),
      queryFn: () => fetchApi('/api/notification-banners', { revalidate: 60 }),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
