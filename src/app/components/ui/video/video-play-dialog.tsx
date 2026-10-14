/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState, type ReactElement } from 'react';

import { createPortal } from 'react-dom';

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
 * still image overlaying it (the poster belongs to the card).
 *
 * While the player is in picture-in-picture the modal hides: the Radix dialog
 * closes, so the page behind is usable again (no overlay, scroll lock or
 * `aria-hidden`), but the surface stays mounted and its `<video>` keeps
 * playing in the floating window. Leaving picture-in-picture (e.g. "back to
 * tab") shows the modal again around the same player. The hidden state is
 * internal: `onOpenChange` never fires for it, and it ends when `src`
 * changes. The surface renders through a portal into a node of its own, which
 * moves between the dialog and a hidden spot beside it, so the dialog can
 * unmount without unmounting the surface.
 *
 * Closing the shown dialog (Close button, Esc, an overlay click) unmounts the
 * surface once the dialog has animated out, which disposes the player and
 * stops playback.
 */
export const VideoPlayDialog = ({
  title,
  artist,
  src,
  open,
  onOpenChange,
  takeMediaEl,
}: VideoPlayDialogProps): ReactElement => {
  const [surfaceHost] = useState(() =>
    typeof document === 'undefined' ? null : document.createElement('div')
  );
  const parkingRef = useRef<HTMLDivElement | null>(null);
  const [isHostInDialog, setIsHostInDialog] = useState(false);
  // The source whose player is in picture-in-picture, so a new source (a
  // player built from scratch) is shown, never hidden.
  const [pictureInPictureSrc, setPictureInPictureSrc] = useState<string | null>(null);

  if (pictureInPictureSrc !== null && (!open || pictureInPictureSrc !== src)) {
    setPictureInPictureSrc(null);
  }

  const isPictureInPicture = pictureInPictureSrc !== null;
  // Kept while the closing dialog animates out, so the video leaves with it.
  const isSurfaceMounted = open || isHostInDialog;

  // The host joins the document in the same commit as the surface, so the
  // surface never builds its player inside a detached node.
  const attachParking = useCallback(
    (parking: HTMLDivElement | null): void => {
      parkingRef.current = parking;
      if (parking && surfaceHost && !surfaceHost.isConnected) {
        parking.appendChild(surfaceHost);
      }
    },
    [surfaceHost]
  );

  const attachToDialog = useCallback(
    (slot: HTMLDivElement | null): (() => void) | undefined => {
      if (!slot || !surfaceHost) return undefined;
      slot.appendChild(surfaceHost);
      setIsHostInDialog(true);
      return () => {
        // Moved out before the dialog's DOM is removed: a media element
        // removed from the document is paused.
        parkingRef.current?.appendChild(surfaceHost);
        setIsHostInDialog(false);
      };
    },
    [surfaceHost]
  );

  return (
    <>
      {isSurfaceMounted ? <div ref={attachParking} hidden /> : null}
      {isSurfaceMounted && surfaceHost
        ? createPortal(
            <LazyVideoSurface
              title={title}
              src={src}
              takeMediaEl={takeMediaEl}
              onEnterPictureInPicture={() => setPictureInPictureSrc(src)}
              onLeavePictureInPicture={() => setPictureInPictureSrc(null)}
            />,
            surfaceHost
          )
        : null}
      <Dialog open={open && !isPictureInPicture} onOpenChange={onOpenChange}>
        <DialogContent className="gap-3 p-4 sm:max-w-3xl lg:max-w-5xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="font-fake-four-cutout text-xl font-normal break-words text-zinc-950 sm:text-2xl">
              {title}
            </DialogTitle>
            <DialogDescription className="text-zinc-600">{artist}</DialogDescription>
          </DialogHeader>
          <div ref={attachToDialog} />
        </DialogContent>
      </Dialog>
    </>
  );
};
