/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Signed-in videos page at `/videos`.
 * Server Component that gates on auth, prefetches the first page of published
 * videos for SSR, then hydrates the client content island for playback and
 * infinite scroll.
 */
import { redirect } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ContentContainer } from '@/app/components/ui/content-container';
import { ImageHeading } from '@/app/components/ui/image-heading';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { VideosContent } from '@/app/components/videos-content';
import { PUBLISHED_VIDEOS_PAGE_SIZE } from '@/app/hooks/use-infinite-published-videos-query';
import { auth } from '@/auth';
import { queryKeys } from '@/lib/query-keys';
import { VideoService } from '@/lib/services/video-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { toPublicVideoRow } from '@/lib/utils/to-public-video-row';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Videos',
  description: 'Stream music videos and live session footage from the label.',
};

const breadcrumbItems = [{ anchorText: 'Videos', url: '/videos', isActive: true }];

export default async function VideosPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/signin');
  }

  const queryClient = getQueryClient();

  // Prefetch the first page as an infinite query. The query key and
  // initialPageParam must exactly match `useInfinitePublishedVideosQuery('desc')`
  // or hydration misses and the client refetches. Read the service directly
  // instead of self-fetching /api/videos — the internal HTTP roundtrip fails
  // silently under load on the standalone server. A service failure degrades to
  // an empty first page (the client refetches) rather than crashing the page.
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.videos.publishedInfinite('desc'),
    initialPageParam: 0,
    queryFn: async () => {
      const result = await VideoService.getPublishedVideos({
        sort: 'desc',
        skip: 0,
        take: PUBLISHED_VIDEOS_PAGE_SIZE,
      });
      const videos = result.success ? result.data : [];
      // Route through the shared `toPublicVideoRow` so the dehydrated SSR cache
      // strips every audit/probe/enrichment internal — including the
      // `enrichmentJobToken` callback secret and raw `probeData` — exactly like
      // the `/api/videos` listing response does.
      const rows = videos.map(toPublicVideoRow);
      return serializeForResponse({
        rows,
        nextSkip: computeNextSkip(rows.length, 0, PUBLISHED_VIDEOS_PAGE_SIZE),
      });
    },
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ZinePanel chat accent="kraft" breadcrumbs={breadcrumbItems}>
            <ImageHeading
              src="/media/headings/VIDEOS.webp"
              alt="fake four inc videos"
              imageHeight={480}
              priority
            />
            <VideosContent />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
