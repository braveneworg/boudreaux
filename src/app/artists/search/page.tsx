/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Artist search results page at `/artists/search`.
 * Server Component that prefetches search results for SSR.
 */
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ArtistSearchInput } from '@/app/components/artist-search-input';
import { ArtistSearchResults } from '@/app/components/artist-search-results';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { Heading } from '@/app/components/ui/heading';
import PageContainer from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getQueryClient } from '@/lib/utils/get-query-client';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search Artists',
  description: 'Search for artists by name.',
};

const breadcrumbItems = [
  { anchorText: 'Home', url: '/', isActive: false },
  { anchorText: 'Search Artists', url: '/artists/search', isActive: true },
];

interface ArtistSearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ArtistSearchPage({ searchParams }: ArtistSearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : '';

  const queryClient = getQueryClient();

  if (query) {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.artists.search(query),
      queryFn: () => fetchApi(`/api/artists/search?q=${encodeURIComponent(query)}&format=full`),
    });
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <BreadcrumbMenu items={breadcrumbItems} />
          <Heading level={1}>Search Artists</Heading>
          <div className="px-4 py-2">
            <ArtistSearchInput />
          </div>
          <ArtistSearchResults query={query} />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
