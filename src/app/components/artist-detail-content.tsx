/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Link from 'next/link';

import { ArrowRight, Loader2, Music2 } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { useArtistBySlugQuery } from '@/app/hooks/use-artist-by-slug-query';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { toBioTeaser } from '@/lib/utils/bio-teaser';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { ArtistPlayer } from './artist-player';
import { ExpandableThumbnail } from './expandable-thumbnail';
import { BreadcrumbMenu } from './ui/breadcrumb-menu';

interface ArtistDetailContentProps {
  slug: string;
  initialReleaseId?: string;
}

const splitList = (value: string | null | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

/**
 * Client content wrapper for the artist detail page.
 *
 * Concise by design — short bio, genres, a few identifying images, and the
 * release combobox + player. The full bio, image gallery, and links live on
 * the dedicated bio page reached via "Read full bio".
 */
export const ArtistDetailContent = ({ slug, initialReleaseId }: ArtistDetailContentProps) => {
  const { isPending, error, data } = useArtistBySlugQuery(slug);

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center rounded-lg border-2 border-dashed p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-950">
            {error ? 'Failed to load artist' : 'Artist not found'}
          </h3>
          <p className="mt-2 text-sm text-zinc-950">
            {error ? 'Please try again later.' : 'The artist you are looking for does not exist.'}
          </p>
        </div>
      </div>
    );
  }

  const artist = data as unknown as ArtistWithPublishedReleases;
  const displayName = getArtistDisplayName(artist);
  const genres = splitList(artist.genres);

  // Show the 2–3 best identifying images beside the short bio; fall back to the
  // first few discovered images when none are explicitly marked primary.
  const primaryImages = artist.bioImages.filter((image) => image.isPrimary);
  const detailImages = (primaryImages.length ? primaryImages : artist.bioImages).slice(0, 3);
  const hasFullBio =
    Boolean(artist.bio) || artist.bioImages.length > 0 || artist.bioLinks.length > 0;

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
    { anchorText: 'Home', url: '/', isActive: false },
    { anchorText: 'Artists', url: '/artists', isActive: false },
    {
      anchorText: displayName,
      url: `/artists/${slug}`,
      isActive: true,
      className: 'max-w-[200px] truncate sm:max-w-none sm:overflow-visible',
    },
  ];

  return (
    <div className="space-y-5">
      <BreadcrumbMenu items={breadcrumbItems} />

      {(artist.shortBio || genres.length > 0 || detailImages.length > 0) && (
        <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {detailImages.length > 0 && (
            <ul className="flex shrink-0 gap-2">
              {detailImages.map((image) => (
                <li key={image.id} className="size-20 sm:size-24">
                  <ExpandableThumbnail
                    src={image.url}
                    thumbnailSrc={image.thumbnailUrl}
                    alt={image.title ?? `${displayName} image`}
                    caption={image.title}
                    attribution={image.attribution}
                    license={image.license}
                    sourceUrl={image.sourceUrl}
                    className="size-full"
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            {genres.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <li key={genre}>
                    <Badge variant="secondary" className="gap-1">
                      <Music2 className="size-3" aria-hidden />
                      {genre}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {artist.shortBio && (
              // Header shows a short plain-text teaser; the full rich short bio
              // (with inline links) lives on the dedicated /bio page.
              <p className="text-muted-foreground text-sm">{toBioTeaser(artist.shortBio)}</p>
            )}
            {hasFullBio && (
              <Link
                href={`/artists/${slug}/bio`}
                className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                Read full bio
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
        </section>
      )}

      <ArtistPlayer artist={artistWithPlayableReleases} initialReleaseId={initialReleaseId} />
    </div>
  );
};
