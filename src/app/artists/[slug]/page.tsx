/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Artist detail page at `/artists/[slug]`.
 * Server Component that prefetches artist data for SSR,
 * then hydrates client components for interactivity.
 */

import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ArtistDetailContent } from '@/app/components/artist-detail-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { ArtistService } from '@/lib/services/artist-service';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';
import { getQueryClient } from '@/lib/utils/get-query-client';

import type { Metadata } from 'next';

interface ArtistDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Generate dynamic metadata for SEO using the artist name and bio.
 * Uses ArtistService directly (server-only code, not a component).
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
 * Artist detail page — prefetches artist data with releases,
 * then hydrates the client content component.
 */
export default async function ArtistDetailPage({ params, searchParams }: ArtistDetailPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const initialReleaseId =
    typeof resolvedSearchParams.release === 'string' ? resolvedSearchParams.release : undefined;

  const queryClient = getQueryClient();

  // Prefetch artist with direct fetch for 404 handling
  const artistUrl = getInternalApiUrl(
    `/api/artists/slug/${encodeURIComponent(slug)}?withReleases=true`
  );
  const artistResponse = await fetch(artistUrl, { cache: 'no-store' });

  if (artistResponse.status === 404) {
    notFound();
  }

  if (artistResponse.ok) {
    const artistData = await artistResponse.json();
    queryClient.setQueryData(queryKeys.artists.bySlug(slug), artistData);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ArtistDetailContent slug={slug} initialReleaseId={initialReleaseId} />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
