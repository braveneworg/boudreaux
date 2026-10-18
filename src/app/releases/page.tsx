/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public releases listing page at `/releases`, or `/releases?artist=<slug>`
 * for every release one artist holds a release credit on (ADR-0006), or
 * `/releases?artist=<slug>&release=<id>`, the release deep link, which opens
 * that release's listening modal over the filtered grid (ADR-0023).
 * Server Component that prefetches published releases for SSR,
 * then hydrates the client content component.
 */

import { cache } from 'react';

import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getPublicArtist } from '@/app/artists/[slug]/get-public-artist';
import type { DeepLinkRelease } from '@/app/components/deep-link-play-dialog';
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
import {
  getArtistDisplayNameForRelease,
  getFirstTrackStreamSource,
} from '@/lib/utils/release-helpers';
import { serializeForResponse } from '@/lib/utils/serialize-for-response';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { Metadata } from 'next';

const breadcrumbItems = [{ anchorText: 'Releases', url: '/releases', isActive: true }];

interface ReleasesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** A query param's first value when repeated, trimmed; `''` when missing or blank. */
const readFirstParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/** The `?artist=` slug. */
const readArtistSlug = readFirstParam;

/** The `?release=` id when it is an ObjectId, else `''`. */
const readReleaseId = (value: string | string[] | undefined): string => {
  const id = readFirstParam(value);
  return isValidObjectId(id) ? id : '';
};

/** The deep-linked release with its serialized detail, for the modal and its query cache. */
interface DeepLinkReleaseRead {
  release: DeepLinkRelease;
  /** The detail as the API serves it (BigInt → Number, Date → string). */
  detail: unknown;
}

/**
 * The release a deep link names, when it is listed, credited to the
 * `?artist=` filter's artist and playable; else `null`, and the page shows
 * the plain grid. Memoised per request, so `generateMetadata` and the page
 * share one read.
 */
const readDeepLinkRelease = cache(
  async (artist: string, releaseId: string): Promise<DeepLinkReleaseRead | null> => {
    const result = await ReleaseService.getReleaseWithTracks(releaseId, artist);
    if (!result.success) return null;
    const { data } = result;
    const playSrc = getFirstTrackStreamSource(data);
    if (!playSrc) return null;
    return {
      release: {
        id: data.id,
        title: data.title,
        artistName: data.albumArtist ? getArtistDisplayNameForRelease(data.albumArtist) : null,
        playSrc,
        year: data.releasedOn.getUTCFullYear(),
      },
      detail: JSON.parse(
        JSON.stringify(data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v))
      ),
    };
  }
);

/** The deep link's release read, or `null` when the params name none. */
const readDeepLink = (
  artist: string,
  params: Record<string, string | string[] | undefined>
): Promise<DeepLinkReleaseRead | null> => {
  const releaseId = readReleaseId(params.release);
  return artist && releaseId ? readDeepLinkRelease(artist, releaseId) : Promise.resolve(null);
};

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
  const params = await searchParams;
  const artist = readArtistSlug(params.artist);
  if (!artist) {
    return {
      title: 'Releases',
      description: 'Browse all published releases. Search by artist or title.',
    };
  }
  const artistName = await readArtistName(artist);
  if (!artistName) return { title: 'Artist Not Found' };
  const deepLink = await readDeepLink(artist, params);
  return {
    title: deepLink?.release.title ?? `Releases by ${artistName}`,
    description: `Every release by ${artistName}.`,
  };
}

/**
 * Releases listing page — prefetches published releases (only the releases
 * the `?artist=` slug's artist holds a release credit on, when given), then
 * renders the search, the RELEASES wordmark and the cover grid via the client
 * content component, inside the page's cyan zine panel. A filter that names
 * no public artist is a 404, as the artist page is. A deep-linked release is
 * seeded into the query cache, so its listening modal opens without a
 * skeleton; one that is not listed, credited or playable is ignored.
 */
export default async function ReleasesPage({ searchParams }: ReleasesPageProps) {
  const params = await searchParams;
  const artist = readArtistSlug(params.artist);
  const artistName = artist ? await readArtistName(artist) : '';
  if (artistName === null) notFound();
  const queryClient = getQueryClient();
  const deepLink = await readDeepLink(artist, params);
  if (deepLink) {
    queryClient.setQueryData(queryKeys.releases.detail(deepLink.release.id), deepLink.detail);
  }

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
            <ReleasesContent
              artist={artist}
              artistName={artistName}
              initialRelease={deepLink?.release ?? null}
            />
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
