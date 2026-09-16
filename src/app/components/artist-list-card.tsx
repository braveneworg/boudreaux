/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Link from 'next/link';

import { Music2, User } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import type { ArtistListingName, ArtistListingRow } from '@/lib/types/domain/artist';
import { formatArtistActiveYears } from '@/lib/utils/artist-active-years';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { splitList } from '@/lib/utils/split-list';

import { BioHtml } from './bio-html';
import { ExpandableThumbnail } from './expandable-thumbnail';

interface ArtistListCardProps {
  artist: ArtistListingRow;
}

/** How many genre badges a card shows before the rest are left to the detail page. */
const MAX_GENRES = 3;

/** Comma-join the display names of related artists for a band line. */
const joinNames = (names: ArtistListingName[]): string =>
  names.map((name) => getArtistDisplayName(name)).join(', ');

/** `"Member of A, B"` for a member, `"Members: A, B"` for a band, `null` when neither applies. */
const formatBandLine = ({
  memberOf,
  members,
}: Pick<ArtistListingRow, 'memberOf' | 'members'>): string | null => {
  if (memberOf.length > 0) return `Member of ${joinNames(memberOf)}`;
  if (members.length > 0) return `Members: ${joinNames(members)}`;
  return null;
};

/** Active years and instruments joined by a middle dot; `null` when neither is set. */
const formatMetaLine = (
  artist: Pick<ArtistListingRow, 'formedOn' | 'bornOn' | 'diedOn' | 'instruments'>
): string | null => {
  const parts = [formatArtistActiveYears(artist), artist.instruments?.trim() || null].filter(
    (part): part is string => part !== null
  );
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** `"3 releases · Latest: Title (2024)"`, singular-aware; `null` when nothing is listed. */
const formatReleaseCredits = ({
  releaseCount,
  newestRelease,
}: Pick<ArtistListingRow, 'releaseCount' | 'newestRelease'>): string | null => {
  if (releaseCount === 0 || newestRelease === null) return null;
  const noun = releaseCount === 1 ? 'release' : 'releases';
  const year = newestRelease.releasedOn.getUTCFullYear();
  return `${releaseCount} ${noun} · Latest: ${newestRelease.title} (${year})`;
};

/**
 * Public artists-index card. Hierarchy, top to bottom: identifying images →
 * name → active years and instruments → genres → band relationships → short
 * bio → release credits. The whole card is clickable through the name link,
 * which is stretched over the card with a pseudo-element: the card cannot be
 * one `<a>` because each thumbnail holds its own dialog trigger, so the
 * thumbnails wrapper sits above the stretched link (`relative z-10`).
 * Mobile-first single column; images sit above the text on small screens and
 * beside it from `sm` up.
 *
 * @param artist - A listed artist row (ADR-0007) from the artists index query.
 */
export const ArtistListCard = ({ artist }: ArtistListCardProps) => {
  const displayName = getArtistDisplayName(artist);
  const genres = splitList(artist.genres).slice(0, MAX_GENRES);
  const images = artist.bioImages;
  const meta = formatMetaLine(artist);
  const bandLine = formatBandLine(artist);
  const credits = formatReleaseCredits(artist);

  return (
    <Card className="shadow-zine-sm relative overflow-hidden bg-white">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
        {images.length > 0 ? (
          <ul data-slot="artist-thumbnails" className="relative z-10 flex shrink-0 gap-2">
            {images.map((image) => (
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
        ) : (
          <div className="bg-muted flex size-20 shrink-0 items-center justify-center sm:size-24">
            <User className="text-muted-foreground size-8" aria-hidden />
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-lg leading-tight font-semibold">
            {/* Stretched over the card: the whole card navigates to the artist. */}
            <Link
              href={`/artists/${artist.slug}`}
              className="after:absolute after:inset-0 after:content-[''] hover:underline"
            >
              {displayName}
            </Link>
          </h2>

          {meta && (
            <p data-slot="artist-meta" className="text-muted-foreground text-xs tracking-wide">
              {meta}
            </p>
          )}

          {genres.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Genres">
              {genres.map((genre) => (
                <li key={genre}>
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Music2 className="size-3" aria-hidden />
                    {genre}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {bandLine && <p className="text-sm text-zinc-700">{bandLine}</p>}

          {artist.shortBio && (
            <BioHtml
              html={artist.shortBio}
              className="text-muted-foreground line-clamp-3 text-sm"
            />
          )}

          {credits && <p className="text-sm font-medium text-zinc-950">{credits}</p>}
        </div>
      </CardContent>
    </Card>
  );
};
