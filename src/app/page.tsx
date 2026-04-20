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

/**
 * Widths that match generated `_w{width}` S3 variants. Capped at 1200 because
 * `generate-image-variants.ts` skips widths `>= originalWidth`, so a 1920px
 * original never produces a `_w1920` variant and requesting one fails
 * (`ERR_BLOCKED_BY_ORB` on the CDN, 403 via the origin proxy). Tablets with a
 * desktop-class UA fall through to the desktop width — fine since 1200 still
 * looks sharp on tablet and always resolves.
 */
const MOBILE_BANNER_WIDTH = 750;
const DESKTOP_BANNER_WIDTH = 1200;

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
