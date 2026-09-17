/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public artists index at `/artists`.
 * Server Component that prefetches the first A–Z page of listed artists
 * (ADR-0007) for SSR, then hydrates the client content island that owns the
 * search combobox, the sort toggle, and infinite scroll. No sign-in is
 * required — the listing (like `/videos`) is open to anonymous visitors.
 */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ArtistsContent } from '@/app/components/artists-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { ImageHeading } from '@/app/components/ui/image-heading';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { PUBLISHED_ARTISTS_PAGE_SIZE } from '@/hooks/queries/use-infinite-published-artists-query';
import { queryKeys } from '@/lib/query-keys';
import { ArtistService } from '@/lib/services/artist-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { getQueryClient } from '@/lib/utils/get-query-client';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Artists',
  description: 'Browse artists on the label, with bios, images, and releases.',
};

const breadcrumbItems = [{ anchorText: 'Artists', url: '/artists', isActive: true }];

export default async function ArtistsIndexPage() {
  const queryClient = getQueryClient();

  // Prefetch the first page as an infinite query. The query key, initialPageParam,
  // and page shape must exactly match `useInfinitePublishedArtistsQuery('alpha')`
  // or hydration misses and the client refetches — the service's listing row is
  // the single projection both this prefetch and `/api/artists?listing=published`
  // ship, so the shapes cannot drift. Read the service directly instead of
  // self-fetching the API route — the internal HTTP roundtrip fails silently
  // under load on the standalone server. A service failure degrades to an empty
  // first page (the client refetches) rather than crashing the page.
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.artists.publishedInfinite('alpha', ''),
    initialPageParam: 0,
    queryFn: async () => {
      const result = await ArtistService.listPublishedArtists({
        sort: 'alpha',
        skip: 0,
        take: PUBLISHED_ARTISTS_PAGE_SIZE,
      });
      const rows = result.success ? result.data : [];
      return { rows, nextSkip: computeNextSkip(rows.length, 0, PUBLISHED_ARTISTS_PAGE_SIZE) };
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ZinePanel chat accent="hot-pink" breadcrumbs={breadcrumbItems}>
            <ImageHeading
              src="/media/headings/ARTISTS.webp"
              alt="artists"
              imageHeight={480}
              priority
            />
            <ArtistsContent />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
