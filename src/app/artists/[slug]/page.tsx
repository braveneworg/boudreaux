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
import { ArtistService } from '@/lib/services/artist-service';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import type { Metadata } from 'next';

interface ArtistDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Generate dynamic metadata for SEO using the artist name and bio.
 */
export async function generateMetadata({ params }: ArtistDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await ArtistService.getArtistBySlugWithReleases(slug);

  if (!result.success) {
    return { title: 'Artist Not Found' };
  }

  const artist = result.data;
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
  const result = await ArtistService.getArtistBySlugWithReleases(slug);

  if (!result.success) {
    notFound();
    return;
  }

  const artist = result.data;
  const displayName = getArtistDisplayName(artist);

  // Filter to only releases with playable tracks, sorted newest-first
  const artistWithPlayableReleases = {
    ...artist,
    releases: artist.releases
      .filter((ar) => ar.release.releaseTracks.length > 0)
      .sort((a, b) => {
        const dateA = a.release.releasedOn ? new Date(a.release.releasedOn).getTime() : 0;
        const dateB = b.release.releasedOn ? new Date(b.release.releasedOn).getTime() : 0;
        return dateB - dateA;
      }),
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
