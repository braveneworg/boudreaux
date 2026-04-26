/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2 } from 'lucide-react';

import { useArtistBySlugQuery } from '@/app/hooks/use-artist-by-slug-query';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { ArtistPlayer } from './artist-player';
import { BreadcrumbMenu } from './ui/breadcrumb-menu';

interface ArtistDetailContentProps {
  slug: string;
  initialReleaseId?: string;
}

/**
 * Client content wrapper for the artist detail page.
 * Uses TanStack Query to fetch artist data (hydrated from SSR prefetch).
 */
export const ArtistDetailContent = ({ slug, initialReleaseId }: ArtistDetailContentProps) => {
  const { isPending, error, data } = useArtistBySlugQuery(slug);

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-950-foreground">
            {error ? 'Failed to load artist' : 'Artist not found'}
          </h3>
          <p className="mt-2 text-sm text-zinc-950-foreground">
            {error ? 'Please try again later.' : 'The artist you are looking for does not exist.'}
          </p>
        </div>
      </div>
    );
  }

  const artist = data as unknown as ArtistWithPublishedReleases;
  const displayName = getArtistDisplayName(artist);

  // Filter to only releases with playable tracks, sorted newest-first
  const artistWithPlayableReleases = {
    ...artist,
    releases: artist.releases
      .filter(
        (ar: ArtistWithPublishedReleases['releases'][number]) =>
          (ar.release.digitalFormats.find((fmt) => fmt.formatType === 'MP3_320KBPS')?.files
            .length ?? 0) > 0
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
    <>
      <BreadcrumbMenu items={breadcrumbItems} />
      <ArtistPlayer artist={artistWithPlayableReleases} initialReleaseId={initialReleaseId} />
    </>
  );
};
