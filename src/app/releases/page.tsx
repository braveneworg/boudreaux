/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public releases listing page at `/releases`, or `/releases?artist=<slug>`
 * for every release one artist holds a release credit on (ADR-0006).
 * Server Component that prefetches published releases for SSR,
 * then hydrates the client content component.
 */

import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getPublicArtist } from '@/app/artists/[slug]/get-public-artist';
import { ReleasesContent } from '@/app/components/releases-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { PUBLISHED_RELEASES_PAGE_SIZE } from '@/hooks/queries/use-infinite-published-releases-query';
import { queryKeys } from '@/lib/query-keys';
import { ReleaseService } from '@/lib/services/release-service';
import { computeNextSkip } from '@/lib/types/pagination';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';

import type { Metadata } from 'next';

const breadcrumbItems = [{ anchorText: 'Releases', url: '/releases', isActive: true }];

interface ReleasesPageProps {
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

export async function generateMetadata({ searchParams }: ReleasesPageProps): Promise<Metadata> {
  const artist = readArtistSlug((await searchParams).artist);
  if (!artist) {
    return {
      title: 'Releases',
      description: 'Browse all published releases. Search by artist or title.',
    };
  }
  const artistName = await readArtistName(artist);
  if (!artistName) return { title: 'Artist Not Found' };
  return {
    title: `Releases by ${artistName}`,
    description: `Every release by ${artistName}.`,
  };
}

/**
 * Releases listing page — prefetches published releases (only the releases
 * the `?artist=` slug's artist holds a release credit on, when given), then
 * renders the search, the RELEASES wordmark and the cover grid via the client
 * content component, inside the page's cyan zine panel. A filter that names
 * no public artist is a 404, as the artist page is.
 */
export default async function ReleasesPage({ searchParams }: ReleasesPageProps) {
  const artist = readArtistSlug((await searchParams).artist);
  const artistName = artist ? await readArtistName(artist) : '';
  if (artistName === null) notFound();
  const queryClient = getQueryClient();

  // Prefetch the first (unsearched) page, filtered by the artist when given, as
  // an infinite query. The query key and initialPageParam must exactly match the
  // client `useInfinitePublishedReleasesQuery('', artist)` hook or hydration
  // misses and the client refetches. Read the service directly instead of
  // self-fetching /api/releases — the internal HTTP roundtrip fails silently
  // under load on the standalone server.
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.releases.publishedInfinite('', artist),
    initialPageParam: 0,
    queryFn: async () => {
      const result = await ReleaseService.getPublishedReleases({
        skip: 0,
        take: PUBLISHED_RELEASES_PAGE_SIZE,
        ...(artist && { artist }),
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
          <ZinePanel chat accent="cyan" breadcrumbs={breadcrumbItems}>
            <ReleasesContent artist={artist} artistName={artistName} />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
