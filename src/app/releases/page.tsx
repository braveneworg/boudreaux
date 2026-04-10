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
import { Heading } from '@/app/components/ui/heading';
import PageContainer from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

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

  await queryClient.prefetchQuery({
    queryKey: queryKeys.releases.published(),
    queryFn: () => fetchApi('/api/releases?listing=published'),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <BreadcrumbMenu items={breadcrumbItems} />
          <Heading level={1}>Releases</Heading>
          <ReleasesContent />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
