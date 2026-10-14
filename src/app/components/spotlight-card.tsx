/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { ReactElement } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { useHydrated } from '@/hooks/use-hydrated';
import { useReleasePlayDialog } from '@/hooks/use-release-play-dialog';
import { cn } from '@/lib/utils';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';
import {
  SPOTLIGHT_COVER_SIZES,
  type SpotlightCard as SpotlightCardData,
} from '@/lib/utils/spotlight-card';

import { PlaySharpIcon } from './icons/play-sharp-icon';
import { ReleasePlayDialog } from './release-play-dialog';
import { ReleaseShareWidget } from './release-share-widget';

import type { ZineAccent } from './ui/zine-panel';

interface SpotlightCardProps {
  card: SpotlightCardData;
  /**
   * What the caption under the cover names: the artist (linked) and then the
   * title with its year (the default, as on home), or the title alone.
   */
  caption?: 'artist-and-title' | 'title';
  /** The page's accent, for the listening modal (see `ReleasePlayDialog`). */
  accent?: ZineAccent;
}

interface SpotlightCardCaptionProps {
  card: SpotlightCardData;
  caption: 'artist-and-title' | 'title';
}

/** The centered caption under a cover (see {@link SpotlightCard}). */
const SpotlightCardCaption = ({ card, caption }: SpotlightCardCaptionProps): ReactElement => {
  const { title, year, artistName, artistSlug } = card;

  if (caption === 'title') {
    return (
      <div className="text-center text-sm leading-snug text-zinc-950">
        <p>{title}</p>
      </div>
    );
  }

  return (
    <div className="text-center text-sm leading-snug text-zinc-950">
      {artistName ? (
        <p className="font-semibold">
          {artistSlug ? (
            <Link
              href={`/artists/${artistSlug}`}
              className="underline underline-offset-4 hover:no-underline"
            >
              {artistName}
            </Link>
          ) : (
            artistName
          )}
        </p>
      ) : null}
      <p>{`${title} (${year})`}</p>
    </div>
  );
};

/**
 * One cover in a grid of release covers, on the home page and on `/releases`:
 * the cover, as wide as the panel on phones and at most 13rem from `sm`,
 * centered in its grid cell, then a centered caption — by default the artist
 * (linked to the artist's page) and the title with its year, or with
 * `caption="title"` the title alone. The cover is a button: the click primes
 * the card's track and opens the listening modal (a bottom sheet on phones),
 * and a square zine play stamp shows on hover and keyboard focus. Touch
 * screens get no stamp; the page tells them to tap the cover instead. With
 * nothing playable the cover is disabled and the artist link still works.
 */
export const SpotlightCard = ({
  card,
  caption = 'artist-and-title',
  accent,
}: SpotlightCardProps): ReactElement => {
  const { releaseId, title, artistName, artistSlug, coverArt, playSrc } = card;
  const {
    playerOpen,
    prefetchPlayer,
    openPlayer,
    handlePlayerOpenChange,
    warmPlayer,
    takeMediaEl,
  } = useReleasePlayDialog(playSrc);
  const coverButtonRef = useRef<HTMLButtonElement>(null);
  const hydrated = useHydrated();
  const playable = playSrc !== null;

  /** Closing the modal puts focus back on the cover that opened it. */
  const returnFocusToCover = (event: Event): void => {
    event.preventDefault();
    coverButtonRef.current?.focus();
  };

  return (
    <div className="mx-auto flex w-full flex-col gap-3 sm:max-w-52">
      <button
        ref={coverButtonRef}
        type="button"
        aria-haspopup="dialog"
        // "false" in the server markup, "true" once the click handler is
        // attached: an E2E click must wait for it or the click is lost.
        data-hydrated={hydrated}
        aria-label={artistName ? `Play ${title} by ${artistName}` : `Play ${title}`}
        disabled={!playable}
        onClick={openPlayer}
        onPointerEnter={playable ? warmPlayer : undefined}
        onFocus={playable ? warmPlayer : undefined}
        className={cn(
          'group shadow-zine-sm relative block aspect-square w-full cursor-pointer border-2 border-black bg-zinc-200',
          'transition-transform duration-200 hover:scale-[1.03] motion-reduce:transition-none',
          'focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:hover:scale-100'
        )}
      >
        <span className="absolute inset-0 overflow-hidden">
          {coverArt ? (
            <Image
              {...resolveCdnImageSource(coverArt)}
              alt={`${title} cover art`}
              fill
              sizes={SPOTLIGHT_COVER_SIZES}
              className="object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center p-3 text-center text-sm text-zinc-950">
              {title}
            </span>
          )}
        </span>
        {playable ? (
          <span
            data-slot="spotlight-play-stamp"
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {/* A square zine stamp, a black glyph on white in the site's
                hard-border box; a press pushes it onto its ink shadow. */}
            <span className="shadow-zine-ink flex size-11 items-center justify-center border-2 border-black bg-white transition-[translate,box-shadow] duration-100 group-active:translate-x-0.5 group-active:translate-y-0.5 group-active:shadow-none motion-reduce:transition-none">
              <PlaySharpIcon className="ml-0.5 size-5 fill-current text-black" />
            </span>
          </span>
        ) : null}
      </button>

      <SpotlightCardCaption card={card} caption={caption} />

      {playable ? (
        <ReleasePlayDialog
          releaseId={releaseId}
          title={title}
          artistName={artistName}
          open={playerOpen}
          onOpenChange={handlePlayerOpenChange}
          takeMediaEl={takeMediaEl}
          prefetch={prefetchPlayer}
          onCloseAutoFocus={returnFocusToCover}
          headingOrder="artist-first"
          centered
          sheetOnPhone
          accent={accent}
          initialTrackNumber={card.initialTrackNumber ?? undefined}
          shareWidget={
            <ReleaseShareWidget
              artistSlug={artistSlug}
              artistName={artistName}
              releaseTitle={title}
            />
          }
        />
      ) : null}
    </div>
  );
};
