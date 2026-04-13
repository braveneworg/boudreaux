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

  // Extract the first featured artist's cover art URL for LCP preloading.
  // Mirrors the getCoverArt resolution order in featured-artists-player.tsx.
  const artistsData = queryClient.getQueryData<{
    featuredArtists?: Array<{
      coverArt?: string | null;
      release?: {
        coverArt?: string | null;
        images?: Array<{ src: string }>;
      } | null;
      artists?: Array<{ images?: Array<{ src: string }> }>;
    }>;
  }>(queryKeys.featuredArtists.active());

  const firstArtist = artistsData?.featuredArtists?.[0];
  const firstCoverArtUrl =
    firstArtist?.coverArt ??
    firstArtist?.release?.coverArt ??
    firstArtist?.release?.images?.[0]?.src ??
    firstArtist?.artists?.find((a) => a.images && a.images.length > 0)?.images?.[0]?.src ??
    null;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {preloadSrcSet && (
        <link
          rel="preload"
          as="image"
          imageSrcSet={preloadSrcSet}
          imageSizes="100vw"
          type="image/webp"
          fetchPriority="high"
        />
      )}
      {firstCoverArtUrl && (
        <link rel="preload" as="image" href={firstCoverArtUrl} fetchPriority="high" />
      )}
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
