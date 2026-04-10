/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Artist detail page at `/artists/[slug]`.
 * Server Component that fetches an artist with published releases and
 * renders the ArtistPlayer with release thumbnail carousel and audio player.
 */
import 'server-only';

import { notFound } from 'next/navigation';

import { ArtistPlayer } from '@/app/components/artist-player';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';

import type { Metadata } from 'next';

interface ArtistDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function fetchArtistBySlug(slug: string) {
  const url = getInternalApiUrl(`/api/artists/slug/${encodeURIComponent(slug)}?withReleases=true`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Generate dynamic metadata for SEO using the artist name and bio.
 */
export async function generateMetadata({ params }: ArtistDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const artist = await fetchArtistBySlug(slug);

  if (!artist) {
    return { title: 'Artist Not Found' };
  }

  const displayName = getArtistDisplayName(artist);

  return {
    title: displayName,
    description: artist.shortBio || `Listen to releases by ${displayName}.`,
  };
}

/**
 * Artist detail page — renders the artist's published releases with
 * a thumbnail carousel and audio player.
 */
const ArtistDetailPage = async ({ params, searchParams }: ArtistDetailPageProps) => {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const initialReleaseId =
    typeof resolvedSearchParams.release === 'string' ? resolvedSearchParams.release : undefined;

  const artist = await fetchArtistBySlug(slug);

  if (!artist) {
    notFound();
    return;
  }

  const displayName = getArtistDisplayName(artist);

  // DEBUG: Log releases pipeline for diagnosis (disabled in production)
  if (process.env.NODE_ENV !== 'production') {
    if (artist.releases.length === 0) {
      console.warn(`[artist-detail] ${slug}: API returned 0 releases`);
    } else {
      for (const ar of artist.releases) {
        console.info(
          `[artist-detail] ${slug}: release "${ar.release.title}" — ` +
            `publishedAt=${ar.release.publishedAt}, deletedOn=${ar.release.deletedOn}, ` +
            `mp3Files=${ar.release.digitalFormats.find((fmt: { formatType: string }) => fmt.formatType === 'MP3_320KBPS')?.files.length ?? 0}`
        );
      }
    }
  }

  // Filter to only releases with playable tracks, sorted newest-first
  const artistWithPlayableReleases = {
    ...artist,
    releases: artist.releases
      .filter(
        (ar: ArtistWithPublishedReleases['releases'][number]) =>
          (ar.release.digitalFormats.find(
            (fmt: { formatType: string }) => fmt.formatType === 'MP3_320KBPS'
          )?.files.length ?? 0) > 0
      )
      .sort(
        (
          a: ArtistWithPublishedReleases['releases'][number],
          b: ArtistWithPublishedReleases['releases'][number]
        ) => {
          const dateA = a.release.releasedOn ? new Date(a.release.releasedOn).getTime() : 0;
          const dateB = b.release.releasedOn ? new Date(b.release.releasedOn).getTime() : 0;
          return dateB - dateA;
        }
      ),
  };

  const breadcrumbItems = [
    {
      anchorText: displayName,
      url: `/artists/${slug}`,
      isActive: true,
      className: 'max-w-[200px] truncate sm:max-w-none sm:overflow-visible',
    },
  ];

  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={breadcrumbItems} />
        <ArtistPlayer artist={artistWithPlayableReleases} initialReleaseId={initialReleaseId} />
      </ContentContainer>
    </PageContainer>
  );
};

export default ArtistDetailPage;
