/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement, ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useReleaseQuery } from '@/hooks/queries/use-release-query';
import { cn } from '@/lib/utils';

import { ReleasePlayer } from './release-player';

export interface ReleasePlayDialogProps {
  releaseId: string;
  title: string;
  artistName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * One-shot supplier of the audio element primed (and already playing)
   * during the opening click gesture (see `usePrimedAudioHandoff`) — adopting
   * THAT element is what lets playback survive strict autoplay policies while
   * the release detail and lazy player chunk load.
   */
  takeMediaEl: () => HTMLAudioElement | null;
  /**
   * Start fetching the release detail before the dialog opens (e.g. on
   * hover/focus of the Play button) so the player mounts without a skeleton.
   */
  prefetch?: boolean;
  /**
   * Radix's close hook: the opener decides where focus returns (its Play
   * button, the artist page's latest-release link) instead of wherever the
   * document's focus happened to sit when the dialog opened.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /** Rendered under the player, e.g. a "View all releases" link. */
  footer?: ReactNode;
  /**
   * Which line names the dialog. `'title-first'` (the default) titles it with
   * the release and describes it with the artist; `'artist-first'` swaps the
   * two, and falls back to the release when there is no artist to name.
   */
  headingOrder?: 'title-first' | 'artist-first';
  /** Center both heading lines. */
  centered?: boolean;
  /** Track number the player starts on (see `ReleasePlayer`). */
  initialTrackNumber?: number;
  /** Rendered under the player, e.g. a `ReleaseShareWidget`. */
  shareWidget?: ReactNode;
}

/** Loading placeholder shaped like the player: square cover + controls bar. */
const ReleasePlayerSkeleton = (): ReactElement => (
  <div className="flex flex-col" aria-busy="true">
    <p role="status" className="sr-only">
      Loading release…
    </p>
    <Skeleton className="aspect-square w-full" />
    <Skeleton className="mt-px h-16 w-full" />
  </div>
);

interface ReleasePlayDialogHeadingProps {
  title: string;
  artistName: string | null;
  headingOrder: 'title-first' | 'artist-first';
  centered: boolean;
}

/**
 * The dialog's two heading lines: the title names the dialog, the description
 * describes it. Artist-first needs an artist; without one the release leads.
 */
const ReleasePlayDialogHeading = ({
  title,
  artistName,
  headingOrder,
  centered,
}: ReleasePlayDialogHeadingProps): ReactElement => {
  const artistFirst = headingOrder === 'artist-first' && artistName !== null;

  return (
    <DialogHeader className="pr-8">
      <DialogTitle
        className={cn(
          'font-fake-four-cutout text-xl font-normal break-words text-zinc-950 sm:text-2xl',
          centered && 'text-center'
        )}
      >
        {artistFirst ? artistName : title}
      </DialogTitle>
      <DialogDescription className={cn('text-zinc-600', centered && 'text-center')}>
        {artistFirst ? title : (artistName ?? 'Release audio player')}
      </DialogDescription>
    </DialogHeader>
  );
};

/**
 * Listening-station modal for the `/releases` listing. Opened by a card's Play
 * button — the click gesture source-primes the first MP3 track (audio starts
 * immediately) while this dialog fetches the `withTracks` release detail and
 * mounts the full {@link ReleasePlayer}, which adopts the playing element.
 * Kept to a tasteful width (square cover ≤ 32rem on desktop, full-width on
 * mobile) and scrollable on short viewports. Closing unmounts the player,
 * which disposes video.js and stops playback.
 */
export const ReleasePlayDialog = ({
  releaseId,
  title,
  artistName,
  open,
  onOpenChange,
  takeMediaEl,
  prefetch = false,
  onCloseAutoFocus,
  footer,
  headingOrder = 'title-first',
  centered = false,
  initialTrackNumber,
  shareWidget,
}: ReleasePlayDialogProps): ReactElement => {
  const {
    isPending,
    isError,
    data: release,
  } = useReleaseQuery(releaseId, { enabled: open || prefetch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-md lg:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <ReleasePlayDialogHeading
          title={title}
          artistName={artistName}
          headingOrder={headingOrder}
          centered={centered}
        />
        {isPending ? (
          <ReleasePlayerSkeleton />
        ) : isError || !release ? (
          <div role="alert" className="py-8 text-center text-sm text-zinc-950">
            This release can’t be played right now.
          </div>
        ) : (
          <ReleasePlayer
            release={release}
            autoPlay
            releaseId={releaseId}
            releaseTitle={release.title}
            takeMediaEl={takeMediaEl}
            initialTrackNumber={initialTrackNumber}
          />
        )}
        {shareWidget ? (
          // min-w-0: see the footer below.
          <div data-slot="release-play-dialog-share" className="min-w-0">
            {shareWidget}
          </div>
        ) : null}
        {footer ? (
          // min-w-0: a grid child's intrinsic width would otherwise widen the
          // dialog (docs/lessons/react-nextjs/dialog-grid-child-needs-min-w-0.md).
          <div data-slot="release-play-dialog-footer" className="min-w-0 text-sm">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
