/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import ReactDOM from 'react-dom';

import { IMAGE_VARIANT_DEVICE_SIZES } from '@/lib/constants/image-variants';
import imageLoader from '@/lib/image-loader';
import { queryKeys } from '@/lib/query-keys';
import type { FeaturedArtist } from '@/lib/types/media-models';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getFeaturedArtistCoverArt } from '@/lib/utils/get-featured-artist-cover-art';
import { getFeaturedArtistDisplayName } from '@/lib/utils/get-featured-artist-display-name';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { HomeContent } from './components/home-content';
import PageContainer from './components/ui/page-container';

/**
 * Home page — Server Component that prefetches banners and featured artists,
 * then hydrates client components for interactivity.
 *
 * The hero banner LCP preload is emitted as an HTTP Link header (see
 * next.config.ts). The featured-artist cover art below it is preloaded here
 * because the player is dynamic-imported with `ssr: false`, so `<Image
 * priority>` can't auto-preload it during SSR.
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

  const featuredArtistsData = queryClient.getQueryData<{ featuredArtists?: FeaturedArtist[] }>(
    queryKeys.featuredArtists.active()
  );
  const firstCoverArt = featuredArtistsData?.featuredArtists
    ?.filter((fa) => getFeaturedArtistDisplayName(fa) !== null)
    .map((fa) => getFeaturedArtistCoverArt(fa))
    .find((src): src is string => Boolean(src));

  if (firstCoverArt) {
    // `sizes="(max-width: 640px) 100vw, 576px"` matches InteractiveCoverArt.
    // Below the banner but frequently the LCP on mobile; preloading trims
    // hundreds of ms off the first paint of the artist cover.
    const imageSrcSet = IMAGE_VARIANT_DEVICE_SIZES.map(
      (w) => `${imageLoader({ src: firstCoverArt, width: w })} ${w}w`
    ).join(', ');
    ReactDOM.preload(imageLoader({ src: firstCoverArt, width: 828 }), {
      as: 'image',
      imageSrcSet,
      imageSizes: '(max-width: 640px) 100vw, 576px',
      fetchPriority: 'high',
    });
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <HomeContent />
      </PageContainer>
    </HydrationBoundary>
  );
}
