/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { ReactElement } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { Play } from 'lucide-react';

import { useReleasePlayDialog } from '@/hooks/use-release-play-dialog';
import { cn } from '@/lib/utils';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';
import {
  SPOTLIGHT_COVER_SIZES,
  type SpotlightCard as SpotlightCardData,
} from '@/lib/utils/spotlight-card';

import { ReleasePlayDialog } from './release-play-dialog';
import { ReleaseShareWidget } from './release-share-widget';

interface SpotlightCardProps {
  card: SpotlightCardData;
}

/**
 * One cover in the home page's spotlight grid (variant A): the cover with a
 * taped corner, then a centered caption — the artist, and the title (linked
 * to the artist's releases) with its year. The cover is a button: the click
 * primes the card's track and opens the listening modal, as the `/releases`
 * Play button does, and a zine play roundel shows on hover, focus and touch
 * screens. With nothing playable the cover is disabled and the title link
 * still works.
 */
export const SpotlightCard = ({ card }: SpotlightCardProps): ReactElement => {
  const { releaseId, title, year, artistName, artistSlug, coverArt, playSrc } = card;
  const {
    playerOpen,
    prefetchPlayer,
    openPlayer,
    handlePlayerOpenChange,
    warmPlayer,
    takeMediaEl,
  } = useReleasePlayDialog(playSrc);
  const coverButtonRef = useRef<HTMLButtonElement>(null);
  const playable = playSrc !== null;

  /** Closing the modal puts focus back on the cover that opened it. */
  const returnFocusToCover = (event: Event): void => {
    event.preventDefault();
    coverButtonRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        ref={coverButtonRef}
        type="button"
        aria-haspopup="dialog"
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
        {/* A strip of tape over the top-left corner, the ZinePanel gesture. */}
        <span
          data-slot="spotlight-tape"
          aria-hidden="true"
          className="bg-menu-item-yellow-200/85 absolute -top-2 -left-4 z-10 h-5 w-14 -rotate-[35deg] border border-black/25 shadow-[1px_1px_0_0_rgba(0,0,0,0.2)]"
        />
        {playable ? (
          <span
            data-slot="spotlight-play-roundel"
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <span className="shadow-zine-ink flex size-12 items-center justify-center rounded-full border-2 border-black bg-(--card-accent)">
              <Play className="ml-0.5 size-5 fill-current text-zinc-950" />
            </span>
          </span>
        ) : null}
      </button>

      <div className="text-center text-sm leading-snug text-zinc-950">
        {artistName ? <p className="font-semibold">{artistName}</p> : null}
        <p>
          {artistSlug ? (
            <Link
              href={`/artists/${artistSlug}/releases`}
              className="underline underline-offset-4 hover:no-underline"
            >
              {title}
            </Link>
          ) : (
            title
          )}{' '}
          ({year})
        </p>
      </div>

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
