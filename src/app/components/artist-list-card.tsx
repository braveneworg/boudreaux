/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, Music2, User } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import type { ArtistListingRow } from '@/lib/types/domain/artist';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { splitList } from '@/lib/utils/split-list';

import { BioHtml } from './bio-html';

interface ArtistListCardProps {
  artist: ArtistListingRow;
}

/** How many genre badges a card shows before the rest are left to the detail page. */
const MAX_GENRES = 3;

/** Intrinsic size requested from the CDN loader: 2× the 144px frame at `sm`. */
const THUMBNAIL_SOURCE_PX = 288;

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

interface ArtistThumbnailsProps {
  slug: string;
  displayName: string;
  images: ArtistListingRow['bioImages'];
}

/**
 * The card's identifying images, as one link into the artist page. They are a
 * way in, not a lightbox — the card navigates rather than opening a dialog.
 * The placeholder sits inside the link too, so an artist with no images still
 * has a clickable photo slot, and `aria-label` names the link for that case,
 * where there is no `alt` to name it.
 */
const ArtistThumbnails = ({ slug, displayName, images }: ArtistThumbnailsProps) => (
  <Link
    data-slot="artist-thumbnails"
    href={`/artists/${slug}`}
    aria-label={`${displayName} artist page`}
    className="focus-visible:ring-primary flex shrink-0 gap-2 focus-visible:ring-2 focus-visible:outline-none"
  >
    {images.length > 0 ? (
      images.map((image) => (
        <span
          key={image.id}
          className="block size-32 overflow-hidden border-2 border-black sm:size-36"
        >
          <Image
            src={image.thumbnailUrl ?? image.url}
            alt={image.alt ?? image.title ?? `${displayName} image`}
            width={THUMBNAIL_SOURCE_PX}
            height={THUMBNAIL_SOURCE_PX}
            className="size-full object-cover transition-transform duration-300 hover:scale-110"
          />
        </span>
      ))
    ) : (
      <span className="bg-muted flex size-32 shrink-0 items-center justify-center sm:size-36">
        <User className="text-muted-foreground size-10" aria-hidden />
      </span>
    )}
  </Link>
);

interface ArtistBioColumnProps {
  slug: string;
  shortBio: string | null;
  hasBioPage: boolean;
}

/**
 * The card's right-hand column from `lg` up: the short-bio teaser under its
 * own heading, and a "View full bio" link pinned to the bottom right.
 */
const ArtistBioColumn = ({ slug, shortBio, hasBioPage }: ArtistBioColumnProps) => (
  <div
    data-slot="artist-bio-column"
    className="flex min-w-0 flex-col gap-2 lg:flex-1 lg:justify-between"
  >
    {shortBio && (
      <div className="space-y-1">
        <h3 className="text-xs font-semibold tracking-wider text-zinc-950 uppercase">Short bio</h3>
        {/* Wrapper, not a `BioHtml` prop: the clamp must stay on `BioHtml`'s
            own box, since `line-clamp` only clamps the element it is applied
            to. zinc-600 (#52525b) on the white card is 7.73:1 — the muted
            token it replaced was #71717b at 4.83:1, passing AA for 14px body
            text but with almost no margin, and this is the longest run of
            prose on the card. */}
        <div data-slot="artist-short-bio">
          <BioHtml html={shortBio} className="line-clamp-4 text-sm text-zinc-600" />
        </div>
      </div>
    )}

    {/* `self-end` right-aligns it; `w-fit` keeps the hit target on the words
        rather than the full width of the column. */}
    {hasBioPage && (
      <Link
        data-slot="artist-full-bio-link"
        href={`/artists/${slug}/bio`}
        className="text-primary inline-flex w-fit items-center gap-1 self-end text-sm font-medium hover:underline"
      >
        View full bio
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    )}
  </div>
);

/**
 * Public artists-index card, in two columns from `lg` up: a summary row —
 * identifying images beside the name, formation year and instruments, genres,
 * and release credits — and, to its right, a bio column holding the short-bio
 * teaser above a right-aligned "View full bio" link. Below `lg` the two stack,
 * so the reading order is unchanged: images, details, bio, link. Band
 * relationships are deliberately absent: neither the bands an act belongs to
 * nor its roster appears here; both live on the artist page.
 *
 * The card body itself is inert — no stretched link over the whole surface.
 * Four explicit targets carry the navigation instead: the images and the name
 * both open the artist page, the latest-release title opens that release, and
 * the closing link opens the full bio. Clicking anywhere else does nothing,
 * so a reader can select the bio text without being navigated away.
 *
 * Mobile-first single column; images sit above the text on the smallest
 * screens and beside it from `sm` up.
 *
 * @param artist - A listed artist row (ADR-0007) from the artists index query.
 */
export const ArtistListCard = ({ artist }: ArtistListCardProps) => {
  const displayName = getArtistDisplayName(artist);
  const genres = splitList(artist.genres).slice(0, MAX_GENRES);
  const images = artist.bioImages;
  const meta = formatMetaLine(artist);
  const newestRelease = artist.releaseCount > 0 ? artist.newestRelease : null;
  // The bio page renders for any artist, so gate the link on there being
  // something to read. The listing row carries no `bio`/`bioLinks` — the exact
  // `hasFullBio` the detail page computes — but the generator always writes a
  // short bio alongside a long one, so these two stand in for it.
  const hasBioPage = Boolean(artist.shortBio) || images.length > 0;

  return (
    <Card className="shadow-zine-sm overflow-hidden bg-white">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:gap-6">
        <div data-slot="artist-summary-row" className="flex flex-col gap-4 sm:flex-row lg:flex-1">
          <ArtistThumbnails slug={artist.slug} displayName={displayName} images={images} />

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

        {(artist.shortBio || hasBioPage) && (
          <ArtistBioColumn slug={artist.slug} shortBio={artist.shortBio} hasBioPage={hasBioPage} />
        )}
      </CardContent>
    </Card>
  );
};
