/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, User } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { Card, CardContent } from '@/app/components/ui/card';
import type { ArtistListingRow } from '@/lib/types/domain/artist';
import { cn } from '@/lib/utils';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { splitList } from '@/lib/utils/split-list';
import { formatVocabularyTerm } from '@/utils/vocabulary-term';

import { BioHtml } from './bio-html';

interface ArtistListCardProps {
  artist: ArtistListingRow;
}

/** How many genre badges a card shows before the rest are left to the detail page. */
const MAX_GENRES = 3;

/**
 * How many photos a card shows. The listing row already arrives resolved —
 * the human's chosen rows, else the job's suggestions, else pool order, capped
 * at `DISPLAY_IMAGE_CAP` — so the first row is the one worth showing, and the
 * rest belong to the artist page's gallery.
 */
const MAX_CARD_IMAGES = 1;

/**
 * The photo frame at each breakpoint, as one class string so the photo, the
 * no-photo placeholder, and the loading skeleton (`artists-content.tsx`)
 * cannot drift apart: 128px on phones, 176px from `sm`, 192px from `xl`.
 */
export const ARTIST_PHOTO_FRAME_CLASS = 'size-32 sm:size-44 xl:size-48';

/** Intrinsic size requested from the CDN loader: 2× the widest 192px frame. */
const THUMBNAIL_SOURCE_PX = 384;

/**
 * Formation year and instruments joined by a middle dot; `null` when neither is
 * set. A person's `bornOn`/`diedOn` are deliberately absent — the index card
 * carries no lifespan, only what describes the act. The year is read in UTC so
 * a stored UTC-day date never shifts a year back. The dot, not a comma, keeps
 * the year apart from the instruments' own comma-separated list.
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

/**
 * The stored a.k.a. names minus any that merely repeat the display name
 * (case-insensitive) — a pseudonymous act often stores its stage name in both
 * fields, and "a.k.a. Ceschi" under "Ceschi" says nothing.
 */
const otherNames = (akaNames: string | null, displayName: string): string[] => {
  const shown = displayName.trim().toLowerCase();
  return splitList(akaNames).filter((aka) => aka.toLowerCase() !== shown);
};

interface ArtistThumbnailsProps {
  slug: string;
  displayName: string;
  images: ArtistListingRow['bioImages'];
}

/**
 * The card's identifying photo, as a link into the artist page. It is a way
 * in, not a lightbox — the card navigates rather than opening a dialog. The
 * placeholder sits inside the link too, so an artist with no images still has
 * a clickable photo slot, and `aria-label` names the link for that case, where
 * there is no `alt` to name it. The placeholder wears the same black frame as
 * a photo so an empty slot keeps the paste-up edge. Takes a list rather than a
 * single row so the caller owns how many it shows (see `MAX_CARD_IMAGES`).
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
          className={cn('block overflow-hidden border-2 border-black', ARTIST_PHOTO_FRAME_CLASS)}
        >
          <Image
            src={image.thumbnailUrl ?? image.url}
            alt={image.alt ?? image.title ?? `${displayName} image`}
            width={THUMBNAIL_SOURCE_PX}
            height={THUMBNAIL_SOURCE_PX}
            className="size-full object-cover transition-transform duration-300 hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100"
          />
        </span>
      ))
    ) : (
      <span
        data-slot="artist-photo-placeholder"
        className={cn(
          'flex shrink-0 items-center justify-center border-2 border-black bg-zinc-100',
          ARTIST_PHOTO_FRAME_CLASS
        )}
      >
        <User className="text-muted-foreground size-10" aria-hidden />
      </span>
    )}
  </Link>
);

/**
 * Public artists-index card: one identifying photo beside a single column of
 * text — the name (with any a.k.a. names under it), formation year and
 * instruments, genres, the latest release with the release count, then the
 * short-bio teaser and a "View full bio" link at the end of it. The photo sits
 * above the text on the smallest screens and beside it from `sm` up; nothing
 * changes at `lg`, so the reading order is the same at every width. Band
 * relationships are deliberately absent: neither the bands an act belongs to
 * nor its roster appears here; both live on the artist page.
 *
 * The card body itself is inert — no stretched link over the whole surface.
 * Three destinations, four explicit targets, carry the navigation instead:
 * the photo and the name both open the artist page, the latest-release title
 * opens that release, and the closing link opens the biography on that same
 * artist page. There is no separate "all releases" link — it opened the same
 * page — so the release count rides on the latest line. Clicking anywhere
 * else does nothing, so a reader can select the bio text without being
 * navigated away.
 *
 * Spacing: the `Card` primitive's own margin and padding are zeroed here so
 * the list owns the distance between rows and the card content owns one
 * even 20px/24px inset all round; the gap right of the photo matches that
 * inset so the photo reads as sitting in the same margin.
 *
 * @param artist - A listed artist row (ADR-0007) from the artists index query.
 */
export const ArtistListCard = ({ artist }: ArtistListCardProps) => {
  const displayName = getArtistDisplayName(artist);
  const akaNames = otherNames(artist.akaNames, displayName);
  const genres = splitList(artist.genres).slice(0, MAX_GENRES);
  const images = artist.bioImages.slice(0, MAX_CARD_IMAGES);
  const meta = formatMetaLine(artist);
  const newestRelease = artist.releaseCount > 0 ? artist.newestRelease : null;
  // The artist page renders for any artist, so gate the link on there being a
  // biography worth jumping to. The listing row carries no `bio`/`bioLinks`,
  // but the generator always writes a short bio alongside a long one, so these
  // two stand in for it.
  const hasBioPage = Boolean(artist.shortBio) || images.length > 0;

  return (
    <Card className="shadow-zine-sm mb-0 overflow-hidden bg-white p-0">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-6">
        <ArtistThumbnails slug={artist.slug} displayName={displayName} images={images} />

        <div data-slot="artist-details" className="flex min-w-0 flex-1 flex-col gap-2">
          {/* The cutout face is a single-weight display font, so no
              `font-semibold` — it carries the emphasis itself, the same way
              video-card titles do. The underline is the site's link
              treatment: it tells the reader this opens the artist page. */}
          <h2 className="text-2xl leading-tight break-words text-zinc-950">
            <Link
              href={`/artists/${artist.slug}`}
              className="font-fake-four-cutout hover:underline"
            >
              {displayName}
            </Link>
          </h2>

          {akaNames.length > 0 && (
            <p data-slot="artist-aka" className="-mt-1 text-sm text-zinc-600">
              a.k.a. {akaNames.join(', ')}
            </p>
          )}

          {meta && (
            <p data-slot="artist-meta" className="text-muted-foreground text-xs tracking-wide">
              {meta}
            </p>
          )}

          {/* No icon per chip — three identical notes said nothing the list's
              own label does not; a faint edge marks the chip instead, since
              the secondary fill alone is near-invisible on the white card. */}
          {genres.length > 0 && (
            <ul data-slot="artist-genres" className="flex flex-wrap gap-1.5" aria-label="Genres">
              {genres.map((genre) => (
                <li key={genre}>
                  <Badge variant="secondary" className="border-black/15 bg-zinc-100 text-xs">
                    {formatVocabularyTerm(genre)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}

          {newestRelease && (
            <p data-slot="artist-credits" className="text-sm font-medium text-zinc-950">
              Latest:{' '}
              <Link
                href={`/releases/${newestRelease.id}`}
                className="underline underline-offset-2 hover:no-underline"
              >
                {newestRelease.title}
              </Link>{' '}
              ({newestRelease.releasedOn.getUTCFullYear()})
              {artist.releaseCount > 1 && `, ${artist.releaseCount} releases`}
            </p>
          )}

          {/* Wrapper, not a `BioHtml` prop: the clamp must stay on `BioHtml`'s
              own box, since `line-clamp` only clamps the element it is applied
              to. `max-w-prose` caps the measure at 65ch so a wide card does
              not run the line out to 100+ characters. zinc-600 (#52525b) on
              the white card is 7.73:1 — the muted token it replaced was
              #71717b at 4.83:1, passing AA for 14px body text but with almost
              no margin, and this is the longest run of prose on the card. */}
          {artist.shortBio && (
            <div data-slot="artist-short-bio" className="max-w-prose pt-1">
              <BioHtml
                html={artist.shortBio}
                className="line-clamp-3 text-sm leading-relaxed text-zinc-600"
              />
            </div>
          )}

          {/* `w-fit` keeps the hit target on the words rather than the full
              width of the column; it sits at the end of the bio, where the
              reader who wants more has just run out of text. */}
          {hasBioPage && (
            <Link
              data-slot="artist-full-bio-link"
              href={`/artists/${artist.slug}`}
              className="text-primary inline-flex w-fit items-center gap-1 text-sm font-medium hover:underline"
            >
              View full bio
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
