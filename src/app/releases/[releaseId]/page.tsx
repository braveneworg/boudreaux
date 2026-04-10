/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Release media player page at `/releases/[releaseId]`.
 * Server Component that prefetches release data for SSR,
 * then hydrates client components for interactivity.
 */

import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ReleaseDetailContent } from '@/app/components/release-detail-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { fetchApi } from '@/lib/utils/fetch-api';
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';
import { getQueryClient } from '@/lib/utils/get-query-client';

interface ReleasePlayerPageProps {
  params: Promise<{ releaseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Release player page — prefetches release, user status, digital formats,
 * and related releases, then hydrates the client content component.
 */
export default async function ReleasePlayerPage({ params, searchParams }: ReleasePlayerPageProps) {
  const { releaseId } = await params;
  const resolvedSearchParams = await searchParams;
  const autoPlay = resolvedSearchParams.autoplay === 'true';

  const queryClient = getQueryClient();

  // Prefetch the release with direct fetch for 404 handling
  const releaseUrl = getInternalApiUrl(
    `/api/releases/${encodeURIComponent(releaseId)}?withTracks=true`
  );
  const releaseResponse = await fetch(releaseUrl, { cache: 'no-store' });

  if (releaseResponse.status === 404) {
    notFound();
  }

  if (releaseResponse.ok) {
    const releaseData = await releaseResponse.json();
    queryClient.setQueryData(queryKeys.releases.detail(releaseId), releaseData);
  }

  // Prefetch supplementary data in parallel (errors are swallowed by prefetchQuery)
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.releases.userStatus(releaseId),
      queryFn: () =>
        fetchApi(`/api/releases/${encodeURIComponent(releaseId)}/user-status`, {
          forwardCookies: true,
        }),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.releases.digitalFormats(releaseId),
      queryFn: () => fetchApi(`/api/releases/${encodeURIComponent(releaseId)}/digital-formats`),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.releases.related(releaseId),
      queryFn: () => fetchApi(`/api/releases/${encodeURIComponent(releaseId)}/related`),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ReleaseDetailContent releaseId={releaseId} autoPlay={autoPlay} />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
