/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { headers } from 'next/headers';
import { userAgentFromString } from 'next/server';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

import { HomeContent } from './components/home-content';
import PageContainer from './components/ui/page-container';

/** Widths pulled from `deviceSizes` in next.config.ts — must match generated `_w{width}` S3 variants. */
const MOBILE_BANNER_WIDTH = 750;
const DESKTOP_BANNER_WIDTH = 1920;

/**
 * Home page — Server Component that prefetches banners and featured artists,
 * then hydrates client components for interactivity.
 *
 * Note: The LCP image preload lives in layout.tsx (outside the Suspense
 * boundary from loading.tsx) so it's included in the initial HTML response.
 */
export default async function Home() {
  const queryClient = getQueryClient();

  const userAgent = (await headers()).get('user-agent') || '';
  const { device } = userAgentFromString(userAgent);
  const isMobile = device?.type === 'mobile' || device?.type === 'tablet';
  const bannerVariantWidth = isMobile ? MOBILE_BANNER_WIDTH : DESKTOP_BANNER_WIDTH;

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

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <HomeContent bannerVariantWidth={bannerVariantWidth} />
      </PageContainer>
    </HydrationBoundary>
  );
}
