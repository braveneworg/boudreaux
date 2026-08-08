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

import { LazyVideoSurface } from './lazy-video-surface';

export interface VideoPlayDialogProps {
  title: string;
  artist: string;
  src: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * One-shot supplier of a media element primed during the opening click
   * gesture (see `usePrimedMediaHandoff`) — playing THAT element is what lets
   * the surface's deferred autoplay survive Safari/iOS and Firefox
   * per-element autoplay policies.
   */
  takeMediaEl: () => HTMLVideoElement | null;
}

/**
 * Enlarged modal player for the `/videos` listing. Opened by a poster click,
 * it mounts the lazy video.js surface immediately — mounting IS the user
 * gesture, so playback starts as soon as the player is ready. No poster is
 * handed to the surface: the modal shows only the playing video, never a
 * still image overlaying it (the poster belongs to the card). Closing the
 * dialog unmounts the surface, which disposes the player and stops playback.
 */
export const VideoPlayDialog = ({
  title,
  artist,
  src,
  open,
  onOpenChange,
  takeMediaEl,
}: VideoPlayDialogProps): ReactElement => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="gap-3 p-4 sm:max-w-3xl lg:max-w-5xl">
      <DialogHeader className="pr-8">
        <DialogTitle className="font-fake-four-cutout text-xl break-words text-zinc-950 sm:text-2xl">
          {title}
        </DialogTitle>
        <DialogDescription className="text-zinc-600">{artist}</DialogDescription>
      </DialogHeader>
      <LazyVideoSurface title={title} src={src} takeMediaEl={takeMediaEl} />
    </DialogContent>
  </Dialog>
);
