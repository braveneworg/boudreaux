/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { buildBannerPreloadSrcSet } from '@/lib/utils/cloudfront-loader';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { HomeContent } from './components/home-content';
import PageContainer from './components/ui/page-container';

/**
 * Home page — Server Component that prefetches banners and featured artists,
 * then hydrates client components for interactivity.
 */
export default async function Home() {
  const queryClient = getQueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.featuredArtists.active(),
      queryFn: () => fetchApi('/api/featured-artists?active=true&limit=7', { revalidate: 60 }),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.banners.active(),
      queryFn: () => fetchApi('/api/notification-banners', { revalidate: 60 }),
    }),
  ]);

  // Extract the first banner's image filename for LCP preloading
  const bannersData = queryClient.getQueryData<{
    banners?: { imageFilename: string }[];
  }>(queryKeys.banners.active());
  const firstBannerFilename = bannersData?.banners?.[0]?.imageFilename;
  const preloadSrcSet = firstBannerFilename ? buildBannerPreloadSrcSet(firstBannerFilename) : null;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {preloadSrcSet && (
        <link
          rel="preload"
          as="image"
          imageSrcSet={preloadSrcSet}
          imageSizes="(max-width: 1200px) 100vw, 1200px"
          type="image/webp"
          fetchPriority="high"
        />
      )}
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
