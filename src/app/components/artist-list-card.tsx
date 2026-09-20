/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, Music2, User } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import type { ArtistListingName, ArtistListingRow } from '@/lib/types/domain/artist';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { splitList } from '@/lib/utils/split-list';

import { BioHtml } from './bio-html';

interface ArtistListCardProps {
  artist: ArtistListingRow;
}

/** How many genre badges a card shows before the rest are left to the detail page. */
const MAX_GENRES = 3;

/** Comma-join the display names of related artists for a band line. */
const joinNames = (names: ArtistListingName[]): string =>
  names.map((name) => getArtistDisplayName(name)).join(', ');

/**
 * `"Member of A, B"` for an artist who plays in bands; `null` when they play in
 * none. A band's own roster is deliberately absent — the index card says what
 * an act belongs to, not who is in it; the line-up lives on the artist page.
 */
const formatBandLine = ({ memberOf }: Pick<ArtistListingRow, 'memberOf'>): string | null =>
  memberOf.length > 0 ? `Member of ${joinNames(memberOf)}` : null;

/**
 * Formation year and instruments joined by a middle dot; `null` when neither is
 * set. A person's `bornOn`/`diedOn` are deliberately absent — the index card
 * carries no lifespan, only what describes the act. The year is read in UTC so
 * a stored UTC-day date never shifts a year back.
 */
const formatMetaLine = ({
  formedOn,
  instruments,
}: Pick<ArtistListingRow, 'formedOn' | 'instruments'>): string | null => {
  const parts = [
    formedOn ? `Formed ${formedOn.getUTCFullYear()}` : null,
    instruments?.trim() || null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
};

/** `"3 releases"` / `"1 release"`, singular-aware. */
const formatReleaseCount = (releaseCount: number): string =>
  `${releaseCount} ${releaseCount === 1 ? 'release' : 'releases'}`;

/**
 * Public artists-index card. A summary row — identifying images beside the
 * name, formation year and instruments, genres, the bands the artist belongs
 * to, and release credits — sits above the short bio, which runs the full
 * width of the card beneath the images and every other detail so the teaser
 * prose has room to breathe, and a closing "View full bio" link.
 *
 * The card body itself is inert — no stretched link over the whole surface.
 * Four explicit targets carry the navigation instead: the images and the name
 * both open the artist page, the latest-release title opens that release, and
 * the closing link opens the full bio. Clicking anywhere else does nothing,
 * so a reader can select the bio text without being navigated away.
 *
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
  const newestRelease = artist.releaseCount > 0 ? artist.newestRelease : null;
  // The bio page renders for any artist, so gate the link on there being
  // something to read. The listing row carries no `bio`/`bioLinks` — the exact
  // `hasFullBio` the detail page computes — but the generator always writes a
  // short bio alongside a long one, so these two stand in for it.
  const hasBioPage = Boolean(artist.shortBio) || images.length > 0;

  return (
    <Card className="shadow-zine-sm overflow-hidden bg-white">
      <CardContent className="flex flex-col gap-4 p-4">
        <div data-slot="artist-summary-row" className="flex flex-col gap-4 sm:flex-row">
          {/* The images are a way into the artist, not a lightbox: the card no
              longer opens a dialog, it navigates. The placeholder is inside the
              link too, so an artist without images still has a clickable photo
              slot. `aria-label` names the link for the placeholder case, where
              there is no `alt` to name it. */}
          <Link
            data-slot="artist-thumbnails"
            href={`/artists/${artist.slug}`}
            aria-label={`${displayName} artist page`}
            className="focus-visible:ring-primary flex shrink-0 gap-2 focus-visible:ring-2 focus-visible:outline-none"
          >
            {images.length > 0 ? (
              images.map((image) => (
                <span
                  key={image.id}
                  className="block size-20 overflow-hidden border-2 border-black sm:size-24"
                >
                  <Image
                    src={image.thumbnailUrl ?? image.url}
                    alt={image.alt ?? image.title ?? `${displayName} image`}
                    width={240}
                    height={240}
                    className="size-full object-cover transition-transform duration-300 hover:scale-110"
                  />
                </span>
              ))
            ) : (
              <span className="bg-muted flex size-20 shrink-0 items-center justify-center sm:size-24">
                <User className="text-muted-foreground size-8" aria-hidden />
              </span>
            )}
          </Link>

          <div data-slot="artist-details" className="min-w-0 flex-1 space-y-2">
            <h2 className="text-lg leading-tight font-semibold">
              <Link href={`/artists/${artist.slug}`} className="hover:underline">
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

            {newestRelease && (
              <p data-slot="artist-credits" className="text-sm font-medium text-zinc-950">
                {formatReleaseCount(artist.releaseCount)} · Latest:{' '}
                <Link
                  href={`/releases/${newestRelease.id}`}
                  className="underline underline-offset-2 hover:no-underline"
                >
                  {newestRelease.title}
                </Link>{' '}
                ({newestRelease.releasedOn.getUTCFullYear()})
              </p>
            )}
          </div>
        </div>

        {/* Wrapper, not a `BioHtml` prop: the clamp must stay on `BioHtml`'s own
            box, since `line-clamp` only clamps the element it is applied to. */}
        {artist.shortBio && (
          <div data-slot="artist-short-bio">
            <BioHtml
              html={artist.shortBio}
              className="text-muted-foreground line-clamp-4 text-sm"
            />
          </div>
        )}

        {/* `w-fit` so the hit target is the words, not the card's full width. */}
        {hasBioPage && (
          <Link
            data-slot="artist-full-bio-link"
            href={`/artists/${artist.slug}/bio`}
            className="text-primary inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
          >
            View full bio
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </CardContent>
    </Card>
  );
};
