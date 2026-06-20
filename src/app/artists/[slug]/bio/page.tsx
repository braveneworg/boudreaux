/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Full artist bio page at `/artists/[slug]/bio`.
 * Server Component that prefetches artist data for SSR, then hydrates the
 * client bio content. Shares the artist-by-slug query key with the detail page
 * so navigation between them reuses the cache.
 */

import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { ArtistBioContent } from '@/app/components/artist-bio-content';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { queryKeys } from '@/lib/query-keys';
import { ArtistService } from '@/lib/services/artist-service';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { sanitizeBioText } from '@/lib/utils/sanitize-bio-html';

import type { Metadata } from 'next';

interface ArtistBioPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArtistBioPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await ArtistService.getArtistBySlugWithReleases(slug);

  if (!result.success) {
    return { title: 'Artist Not Found' };
  }

  const displayName = getArtistDisplayName(result.data);
  // shortBio is now rich HTML; strip tags for the plain-text meta description.
  const shortBioText = result.data.shortBio ? sanitizeBioText(result.data.shortBio) : '';
  return {
    title: `${displayName} — Bio`,
    description: shortBioText || `Read the full biography of ${displayName}.`,
  };
}

export default async function ArtistBioPage({ params }: ArtistBioPageProps) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // Fetch directly via the service (server-only) to avoid an internal HTTP
  // roundtrip — same SSRF-safe pattern as the detail page.
  const result = await ArtistService.getArtistBySlugWithReleases(slug);

  if (!result.success) {
    notFound();
  }

  const artistData = JSON.parse(
    JSON.stringify(result.data, (_key, v) => (typeof v === 'bigint' ? Number(v) : v))
  );
  queryClient.setQueryData(queryKeys.artists.bySlug(slug), artistData);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ArtistBioContent slug={slug} />
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
