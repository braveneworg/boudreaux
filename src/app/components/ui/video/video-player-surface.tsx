/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useRef, useState, type ReactElement } from 'react';

import videojs from 'video.js';

// video.js base skin CSS is imported globally in globals.css — do NOT re-import
// it here; a chunk-level stylesheet on this ssr:false subtree would arrive late.

import { bindPlayerVolumePersistence } from '@/hooks/use-player-prefs';
import { cn } from '@/lib/utils';

import { getVideoMimeType } from './get-video-mime-type';
import { claimPlayback, releasePlayback } from '../playback-session';

export interface VideoPlayerSurfaceProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  /** Fired when playback reaches the end of the source (e.g. queue advance). */
  onEnded?: () => void;
  /**
   * One-shot supplier of a media element primed (load()/play()) during the
   * user's play gesture. Safari/iOS and Firefox bless autoplay per element, so
   * playing THAT element is what lets the deferred autoplay succeed; returns
   * null once taken, and the surface then falls back to a fresh element.
   */
  takeMediaEl?: () => HTMLVideoElement | null;
}

/**
 * Owns the video.js lifecycle. Mounted by the facade's play click, so it
 * autoplays once ready — playing the gesture-primed element from `takeMediaEl`
 * when provided, since browsers with per-element autoplay blessing would
 * reject a deferred play() on any other element. Registers with the playback
 * coordinator on 'play' so only one surface plays at a time, and disposes
 * cleanly on unmount (list virtualization / refetch). A player 'error' swaps
 * in an inline fallback. An optional `onEnded` callback fires when playback
 * finishes (queue advance).
 */
export const VideoPlayerSurface = ({
  title,
  src,
  posterUrl,
  onEnded,
  takeMediaEl,
}: VideoPlayerSurfaceProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const [hasError, setHasError] = useState(false);
  // Ref-carried so callback identity changes never tear down the player.
  const onEndedRef = useRef(onEnded);
  const takeMediaElRef = useRef(takeMediaEl);

  useEffect(() => {
    onEndedRef.current = onEnded;
    takeMediaElRef.current = takeMediaEl;
  }, [onEnded, takeMediaEl]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    // video.js adopts the data-vjs-player parent as the player root
    // (playerElIngest) and dispose() removes that parent from the DOM — so
    // the parent must be created here, fresh per effect run, never rendered
    // by React: otherwise the run after a dispose (StrictMode remount in
    // dev, a src change in prod) appends into a detached node and the
    // player is invisible.
    const container = document.createElement('div');
    container.setAttribute('data-vjs-player', '');

    // The primed element must reach video.js as-is, inside the
    // data-vjs-player container: that parent turns on player-element ingest,
    // without which iOS video.js clones the element and drops the blessing.
    const videoEl = takeMediaElRef.current?.() ?? document.createElement('video');
    videoEl.className = 'video-js vjs-default-skin';
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('aria-label', title);
    container.appendChild(videoEl);
    host.appendChild(container);

    const player = videojs(videoEl, {
      controls: true,
      fluid: true,
      playsinline: true,
      preload: 'auto',
      poster: posterUrl ?? undefined,
      sources: [{ src, type: getVideoMimeType(src) }],
    });

    bindPlayerVolumePersistence(player);

    player.ready(() => {
      // Autoplay policies can reject play() even after a gesture — swallow it.
      player.play()?.catch(() => {});
    });

    player.on('play', () => {
      claimPlayback(instanceId, () => player.pause());
    });

    player.on('ended', () => {
      onEndedRef.current?.();
    });

    player.on('error', () => {
      setHasError(true);
    });

    return () => {
      releasePlayback(instanceId);
      player.dispose();
    };
  }, [src, posterUrl, title, instanceId]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} className={cn('w-full', hasError && 'hidden')} />
      {hasError ? (
        <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center border-2 border-black p-4 text-center text-sm">
          This video can’t be played right now.
        </div>
      ) : null}
    </div>
  );
};
