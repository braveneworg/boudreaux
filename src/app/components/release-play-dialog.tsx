/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useReleaseQuery } from '@/hooks/queries/use-release-query';

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
}: ReleasePlayDialogProps): ReactElement => {
  const {
    isPending,
    isError,
    data: release,
  } = useReleaseQuery(releaseId, { enabled: open || prefetch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-3 overflow-y-auto p-4 sm:max-w-md lg:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="font-fake-four-cutout text-xl break-words text-zinc-950 sm:text-2xl">
            {title}
          </DialogTitle>
          <DialogDescription className="text-zinc-600">
            {artistName ?? 'Release audio player'}
          </DialogDescription>
        </DialogHeader>
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
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
