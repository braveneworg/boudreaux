/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public releases listing page at `/releases`.
 * Server Component that prefetches published releases for SSR,
 * then hydrates the client content component.
 */

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ReleasesContent } from '@/app/components/releases-content';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { PUBLISHED_RELEASES_PAGE_SIZE } from '@/app/hooks/use-infinite-published-releases-query';
import { ImageHeading } from '@/components/ui/image-heading';
import { queryKeys } from '@/lib/query-keys';
import { ReleaseService } from '@/lib/services/release-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Releases',
  description: 'Browse all published releases. Search by artist or title.',
};

const breadcrumbItems = [{ anchorText: 'Releases', url: '/releases', isActive: true }];

/**
 * Releases listing page — prefetches published releases, then renders
 * a searchable card grid via the client content component.
 */
export default async function ReleasesPage() {
  const queryClient = getQueryClient();

  // Prefetch the first (unsearched) page as an infinite query. The query key and
  // initialPageParam must exactly match the client `usePublishedReleasesQuery('')`
  // hook or hydration misses and the client refetches. Read the service directly
  // instead of self-fetching /api/releases — the internal HTTP roundtrip fails
  // silently under load on the standalone server.
  await queryClient.prefetchInfiniteQuery({
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
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <BreadcrumbMenu items={breadcrumbItems} />
          <ImageHeading
            src="/media/headings/RELEASES.webp"
            alt="releases"
            imageHeight={480}
            priority
          />
          <ReleasesContent />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
