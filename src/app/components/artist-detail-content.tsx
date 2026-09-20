/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2, Music2 } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { useArtistBySlugQuery } from '@/hooks/queries/use-artist-by-slug-query';
import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';
import { compareByCreditThenNewest } from '@/lib/utils/artist-release-credits';
import { toBioTeaser } from '@/lib/utils/bio-teaser';
import { resolveDisplayImages } from '@/lib/utils/display-images';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { splitList } from '@/lib/utils/split-list';

import { ArtistFullBio } from './artist-full-bio';
import { ArtistPlayer } from './artist-player';
import { ExpandableThumbnail } from './expandable-thumbnail';
import { ZinePanel } from './ui/zine-panel';

interface ArtistDetailContentProps {
  slug: string;
  initialReleaseId?: string;
}

type ArtistRelease = ArtistWithPublishedReleases['releases'][number];

/** Whether a release has at least one playable MP3_320KBPS track. */
const hasPlayableTracks = (artistRelease: ArtistRelease): boolean =>
  (artistRelease.release.digitalFormats.find((fmt) => fmt.formatType === 'MP3_320KBPS')?.files
    .length ?? 0) > 0;

/**
 * Project an artist down to only its releases with playable tracks — own
 * releases first, then featured and band appearances, newest first within
 * each — the shape the {@link ArtistPlayer} expects.
 */
const withPlayableReleases = (
  artist: ArtistWithPublishedReleases
): ArtistWithPublishedReleases => ({
  ...artist,
  releases: artist.releases.filter(hasPlayableTracks).sort(compareByCreditThenNewest),
});

type ArtistBioImage = ArtistWithPublishedReleases['bioImages'][number];

interface ArtistDetailHeaderProps {
  artist: ArtistWithPublishedReleases;
  displayName: string;
  genres: string[];
  detailImages: ArtistBioImage[];
}

/**
 * Concise artist header: a few identifying thumbnails, genre badges and a short
 * bio teaser. No "Read full bio" link — the full biography sits further down
 * this same page. Rendered only when there is something to show (short bio,
 * genres, or images).
 */
const ArtistDetailHeader = ({
  artist,
  displayName,
  genres,
  detailImages,
}: ArtistDetailHeaderProps) => {
  if (!artist.shortBio && genres.length === 0 && detailImages.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {detailImages.length > 0 && (
        <ul data-slot="artist-display-images" className="flex shrink-0 gap-2">
          {detailImages.map((image) => (
            <li key={image.id} className="size-20 sm:size-24">
              <ExpandableThumbnail
                src={image.url}
                thumbnailSrc={image.thumbnailUrl}
                alt={image.alt ?? image.title ?? `${displayName} image`}
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
      </div>
    </section>
  );
};

/**
 * Client content wrapper for the artist page — the one page for an artist.
 *
 * Short bio, genres and a few identifying images up top, then the release
 * combobox + player, then the full biography and image gallery. The bio used
 * to live at `/artists/[slug]/bio`; that route now redirects here, so a reader
 * never navigates twice to read it.
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
      <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center border-2 border-dashed p-8">
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

  // The artist's display images beside the short bio: the human's chosen rows,
  // else the job's suggested rows, else the first discovered ones (ADR-0008).
  const detailImages = resolveDisplayImages(artist.bioImages);
  const breadcrumbItems = [
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
      <ZinePanel chat accent="hot-pink" contentClassName="space-y-5" breadcrumbs={breadcrumbItems}>
        <ArtistDetailHeader
          artist={artist}
          displayName={displayName}
          genres={genres}
          detailImages={detailImages}
        />

        <ArtistPlayer artist={withPlayableReleases(artist)} initialReleaseId={initialReleaseId} />

        <ArtistFullBio displayName={displayName} bioImages={artist.bioImages} bio={artist.bio} />
      </ZinePanel>
    </div>
  );
};
