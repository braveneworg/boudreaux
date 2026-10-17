/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { createPortal } from 'react-dom';

import { Dialog, DialogContent } from '@/app/components/ui/dialog';
import { PlayDialogHeading } from '@/app/components/ui/play-dialog-heading';
import { getZineAccentClass, type ZineAccent } from '@/app/components/ui/zine-panel';
import { cn } from '@/lib/utils';

import { LazyVideoSurface } from './lazy-video-surface';

export interface VideoPlayDialogProps {
  title: string;
  artist: string;
  /**
   * The stream URL, or `null` when the video has none (videos fail closed
   * without a signed URL): the dialog then says it cannot be played.
   */
  src: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * One-shot supplier of a media element primed during the opening click
   * gesture (see `usePrimedMediaHandoff`) — playing THAT element is what lets
   * the surface's deferred autoplay survive Safari/iOS and Firefox
   * per-element autoplay policies.
   */
  takeMediaEl: () => HTMLVideoElement | null;
  /**
   * Which line names the dialog. `'title-first'` (the default) titles it with
   * the video and describes it with the artist; `'artist-first'` swaps them.
   */
  headingOrder?: 'title-first' | 'artist-first';
  /** Center both heading lines. */
  centered?: boolean;
  /** The artist's page: the artist line links there when given. */
  artistHref?: string;
  /** The video's year, shown after the title as `Title (Year)` when given. */
  year?: number;
  /** The frame's accent; the dialog portals out of the page's `ZinePanel`. */
  accent?: ZineAccent;
  /** Rendered under the player, e.g. a "View all videos" link. */
  footer?: ReactNode;
  /** Rendered at the heading's right, e.g. the add-to-playlist kebab. */
  action?: ReactNode;
  /** Radix's close hook: the opener decides where focus returns. */
  onCloseAutoFocus?: (event: Event) => void;
}

interface VideoPlayDialogContentProps extends Omit<
  VideoPlayDialogProps,
  'src' | 'open' | 'onOpenChange' | 'takeMediaEl'
> {
  hasSource: boolean;
  /** Ref callback of the player slot the surface's host moves into. */
  attachToDialog: (slot: HTMLDivElement | null) => (() => void) | undefined;
}

/**
 * The shown dialog: the heading, the slot the player moves into (or, without
 * a source, the reason nothing plays), and the footer.
 */
const VideoPlayDialogContent = ({
  title,
  artist,
  hasSource,
  attachToDialog,
  headingOrder = 'title-first',
  centered = false,
  artistHref,
  year,
  accent,
  footer,
  action,
  onCloseAutoFocus,
}: VideoPlayDialogContentProps): ReactElement => (
  <DialogContent
    className={cn('gap-3 p-4 sm:max-w-3xl lg:max-w-5xl', accent && getZineAccentClass(accent))}
    onCloseAutoFocus={onCloseAutoFocus}
  >
    <PlayDialogHeading
      title={title}
      artistName={artist}
      artistHref={artistHref}
      year={year}
      headingOrder={headingOrder}
      centered={centered}
      compactOnPhone={false}
      action={action}
    />
    {hasSource ? (
      <div ref={attachToDialog} />
    ) : (
      <div
        role="alert"
        className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center border-2 border-black p-4 text-center text-sm"
      >
        This video can’t be played right now.
      </div>
    )}
    {footer ? (
      // min-w-0: a grid child's intrinsic width would otherwise widen the
      // dialog (docs/lessons/react-nextjs/dialog-grid-child-needs-min-w-0.md).
      <div data-slot="video-play-dialog-footer" className="min-w-0 text-sm">
        {footer}
      </div>
    ) : null}
  </DialogContent>
);

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
 * playing in the floating window. Going "back to tab" leaves the video
 * playing, and the modal shows again around the same player, still playing.
 * Closing the floating window pauses the video, so a paused leave requests a
 * close through `onOpenChange(false)` instead: the modal stays hidden and the
 * player is disposed. The page cannot tell "back to tab" from a close once the
 * video is already paused, so "back to tab" on a paused video closes too.
 * Otherwise the hidden state is internal: `onOpenChange` never fires for it,
 * and it ends when `src` changes. The surface renders through a portal into a
 * node of its own, which moves between the dialog and a hidden spot beside it,
 * so the dialog can unmount without unmounting the surface.
 *
 * Closing the shown dialog (Close button, Esc, an overlay click) unmounts the
 * surface once the dialog has animated out, which disposes the player and
 * stops playback. Closing it while hidden unmounts the surface at once.
 *
 * The home search opens it with the artist leading (linked), the year, an
 * accent, a footer link and the add-to-playlist kebab; without those props it
 * is the `/videos` modal as it always was.
 */
export const VideoPlayDialog = ({
  title,
  artist,
  src,
  open,
  onOpenChange,
  takeMediaEl,
  ...contentProps
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
  // Nothing to play without a source.
  const mountedSrc = open || isHostInDialog ? src : null;
  const isSurfaceMounted = mountedSrc !== null;

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
      {mountedSrc !== null && surfaceHost
        ? createPortal(
            <LazyVideoSurface
              title={title}
              src={mountedSrc}
              takeMediaEl={takeMediaEl}
              onEnterPictureInPicture={() => setPictureInPictureSrc(mountedSrc)}
              onLeavePictureInPicture={(isPaused) => {
                if (isPaused) {
                  onOpenChange(false);
                } else {
                  setPictureInPictureSrc(null);
                }
              }}
            />,
            surfaceHost
          )
        : null}
      <Dialog open={open && !isPictureInPicture} onOpenChange={onOpenChange}>
        <VideoPlayDialogContent
          {...contentProps}
          title={title}
          artist={artist}
          hasSource={src !== null}
          attachToDialog={attachToDialog}
        />
      </Dialog>
    </>
  );
};
