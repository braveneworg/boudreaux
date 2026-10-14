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
import { getZineAccentClass, type ZineAccent } from '@/app/components/ui/zine-panel';
import { useReleaseQuery } from '@/hooks/queries/use-release-query';
import type { PublishedReleaseDetail } from '@/hooks/queries/use-release-query';
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
  /**
   * Below the `sm` breakpoint, slide up from the bottom as a full-width sheet
   * instead of centering, with the player and heading sized so the whole
   * sheet fits the screen without scrolling.
   */
  sheetOnPhone?: boolean;
  /**
   * The opening page's accent. The dialog portals to `<body>`, out of the
   * page's `ZinePanel`, so without it the player frame and buttons take the
   * root pink `--card-accent`.
   */
  accent?: ZineAccent;
}

/**
 * Below `sm` the dialog is the bottom sheet of `SheetContent side="bottom"`:
 * pinned to the bottom edge, full width, top border only, sliding up (just
 * fading under reduced motion).
 */
const PHONE_SHEET_CLASS = cn(
  'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0',
  'max-sm:gap-2 max-sm:border-x-0 max-sm:border-b-0 max-sm:duration-300',
  'max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100',
  'max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom',
  'max-sm:motion-reduce:data-[state=open]:slide-in-from-bottom-0 max-sm:motion-reduce:data-[state=closed]:slide-out-to-bottom-0'
);

/**
 * The square cover is the one part of the sheet that can give, so on a phone
 * the player is as wide as the sheet's 90dvh cap leaves room for once the
 * heading, controls, ticker, tracks row and share row (about 20rem) are in.
 * It never drops below the audio controls' 16rem minimum plus the frame's
 * border; a screen shorter than that scrolls the sheet instead.
 */
const PHONE_SHEET_PLAYER_CLASS = 'max-sm:w-[min(100%,max(16.25rem,calc(90dvh-20rem)))]';

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
  /** Set both lines smaller below `sm`, for the phone sheet. */
  compactOnPhone: boolean;
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
  compactOnPhone,
}: ReleasePlayDialogHeadingProps): ReactElement => {
  const artistFirst = headingOrder === 'artist-first' && artistName !== null;

  return (
    <DialogHeader className={cn('pr-8', compactOnPhone && 'max-sm:gap-0.5')}>
      <DialogTitle
        className={cn(
          'font-fake-four-cutout text-xl font-normal break-words text-zinc-950 sm:text-2xl',
          centered && 'text-center',
          compactOnPhone && 'max-sm:text-lg max-sm:leading-tight'
        )}
      >
        {artistFirst ? artistName : title}
      </DialogTitle>
      <DialogDescription
        className={cn(
          'text-zinc-600',
          centered && 'text-center',
          compactOnPhone && 'max-sm:text-xs'
        )}
      >
        {artistFirst ? title : (artistName ?? 'Release audio player')}
      </DialogDescription>
    </DialogHeader>
  );
};

interface ReleasePlayDialogPlayerProps extends Pick<
  ReleasePlayDialogProps,
  'releaseId' | 'takeMediaEl' | 'initialTrackNumber'
> {
  isPending: boolean;
  isError: boolean;
  release: PublishedReleaseDetail | null | undefined;
  /** Size the player to fit the phone sheet below `sm`. */
  fitPhoneSheet: boolean;
}

/**
 * The dialog's player, or its loading skeleton in the same box, or the error
 * when the release can't be loaded.
 */
const ReleasePlayDialogPlayer = ({
  isPending,
  isError,
  release,
  releaseId,
  takeMediaEl,
  initialTrackNumber,
  fitPhoneSheet,
}: ReleasePlayDialogPlayerProps): ReactElement => {
  const slotClass = cn('mx-auto w-full', fitPhoneSheet && PHONE_SHEET_PLAYER_CLASS);

  if (isPending) {
    return (
      <div data-slot="release-play-dialog-player" className={slotClass}>
        <ReleasePlayerSkeleton />
      </div>
    );
  }

  if (isError || !release) {
    return (
      <div role="alert" className="py-8 text-center text-sm text-zinc-950">
        This release can’t be played right now.
      </div>
    );
  }

  return (
    <div data-slot="release-play-dialog-player" className={slotClass}>
      <ReleasePlayer
        release={release}
        autoPlay
        releaseId={releaseId}
        releaseTitle={release.title}
        takeMediaEl={takeMediaEl}
        initialTrackNumber={initialTrackNumber}
      />
    </div>
  );
};

/**
 * Listening-station modal for a release. Opened by a cover in the home and
 * `/releases` grids, a release card's Play button or the artist page's latest
 * release — the click gesture source-primes the card's track (audio starts
 * immediately) while this dialog fetches the `withTracks` release detail and
 * mounts the full {@link ReleasePlayer}, which adopts the playing element.
 * Kept to a tasteful width (square cover ≤ 32rem on desktop, full-width on
 * mobile) and scrollable on short viewports; `sheetOnPhone` makes it a bottom
 * sheet on phones instead, and `accent` gives it the opening page's accent.
 * Closing unmounts the player, which disposes video.js and stops playback.
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
  sheetOnPhone = false,
  accent,
}: ReleasePlayDialogProps): ReactElement => {
  const {
    isPending,
    isError,
    data: release,
  } = useReleaseQuery(releaseId, { enabled: open || prefetch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-md lg:max-w-lg',
          sheetOnPhone && PHONE_SHEET_CLASS,
          accent && getZineAccentClass(accent)
        )}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <ReleasePlayDialogHeading
          title={title}
          artistName={artistName}
          headingOrder={headingOrder}
          centered={centered}
          compactOnPhone={sheetOnPhone}
        />
        <ReleasePlayDialogPlayer
          isPending={isPending}
          isError={isError}
          release={release}
          releaseId={releaseId}
          takeMediaEl={takeMediaEl}
          initialTrackNumber={initialTrackNumber}
          fitPhoneSheet={sheetOnPhone}
        />
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
