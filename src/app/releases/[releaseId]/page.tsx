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
import { PageContainer } from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { ReleaseService } from '@/lib/services/release-service';
import { attachStreamUrls } from '@/lib/utils/attach-stream-urls';
import { fetchApi } from '@/lib/utils/fetch-api';
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

  // Fetch release directly via service (Server Component → service is server-only).
  // This avoids an internal HTTP roundtrip (SSRF-safe) and works regardless of
  // how the standalone server's network/host is configured.
  const releaseResult = await ReleaseService.getReleaseWithTracks(releaseId);

  if (!releaseResult.success) {
    notFound();
  }

  // Match the API response shape: BigInt → Number, Date → string, plus stream URLs.
  const releaseData = attachStreamUrls(
    JSON.parse(
      JSON.stringify(releaseResult.data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v))
    )
  );
  queryClient.setQueryData(queryKeys.releases.detail(releaseId), releaseData);

  // Extract primaryArtistId from release data for related releases prefetch
  const releaseCache = queryClient.getQueryData<{
    artistReleases?: Array<{ artist?: { id?: string } }>;
  }>(queryKeys.releases.detail(releaseId));
  const primaryArtistId = releaseCache?.artistReleases?.[0]?.artist?.id ?? null;

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
      queryKey: queryKeys.releases.related(releaseId, primaryArtistId),
      queryFn: () => {
        const relatedUrl = primaryArtistId
          ? `/api/releases/${encodeURIComponent(releaseId)}/related?artistId=${encodeURIComponent(primaryArtistId)}`
          : `/api/releases/${encodeURIComponent(releaseId)}/related`;
        return fetchApi(relatedUrl);
      },
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
