/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public videos page at `/videos`, or `/videos?artist=<slug>` for every video
 * one artist holds a video credit on.
 * Server Component that prefetches the first page of published videos for
 * SSR, then hydrates the client content island for playback and infinite
 * scroll. No sign-in is required — the listing (like `/releases`) is open to
 * anonymous visitors.
 */
import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getPublicArtist } from '@/app/artists/[slug]/get-public-artist';
import { ContentContainer } from '@/app/components/ui/content-container';
import { ImageHeading } from '@/app/components/ui/image-heading';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { VideosContent } from '@/app/components/videos-content';
import { PUBLISHED_VIDEOS_PAGE_SIZE } from '@/hooks/queries/use-infinite-published-videos-query';
import { queryKeys } from '@/lib/query-keys';
import { VideoService } from '@/lib/services/video-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { toPublicVideoRow } from '@/lib/utils/to-public-video-row';

import type { Metadata } from 'next';

const breadcrumbItems = [{ anchorText: 'Videos', url: '/videos', isActive: true }];

interface VideosPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The `?artist=` slug: the first value when repeated, `''` when missing or blank. */
const readArtistSlug = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * The display name of the public artist a filter names, or `null` when no
 * public artist has that slug. The read is shared with the metadata through
 * `getPublicArtist`'s per-request memo.
 */
const readArtistName = async (slug: string): Promise<string | null> => {
  const artist = await getPublicArtist(slug);
  return artist ? getArtistDisplayName(artist) : null;
};

export async function generateMetadata({ searchParams }: VideosPageProps): Promise<Metadata> {
  const artist = readArtistSlug((await searchParams).artist);
  if (!artist) {
    return {
      title: 'Videos',
      description: 'Stream music videos and live session footage from the label.',
    };
  }
  const artistName = await readArtistName(artist);
  if (!artistName) return { title: 'Artist Not Found' };
  return {
    title: `Videos by ${artistName}`,
    description: `Every video by ${artistName}.`,
  };
}

/**
 * Videos listing page — prefetches the first page of published videos (only
 * the videos the `?artist=` slug's artist holds a video credit on, when
 * given), then renders the wordmark and the client content island. A filter
 * that names no public artist is a 404, as on `/releases`.
 */
export default async function VideosPage({ searchParams }: VideosPageProps) {
  const artist = readArtistSlug((await searchParams).artist);
  const artistName = artist ? await readArtistName(artist) : '';
  if (artistName === null) notFound();
  const queryClient = getQueryClient();

  // Prefetch the first page as an infinite query. The query key and
  // initialPageParam must exactly match
  // `useInfinitePublishedVideosQuery('desc', '', artist)` or hydration misses
  // and the client refetches. Read the service directly
  // instead of self-fetching /api/videos — the internal HTTP roundtrip fails
  // silently under load on the standalone server. A service failure degrades to
  // an empty first page (the client refetches) rather than crashing the page.
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.videos.publishedInfinite('desc', '', artist),
    initialPageParam: 0,
    queryFn: async () => {
      const result = await VideoService.getPublishedVideos({
        sort: 'desc',
        skip: 0,
        take: PUBLISHED_VIDEOS_PAGE_SIZE,
        ...(artist && { artist }),
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
            <VideosContent artist={artist} artistName={artistName} />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
