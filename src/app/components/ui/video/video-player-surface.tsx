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

import type Player from 'video.js/dist/types/player';

export interface VideoPlayerSurfaceProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  /** Fired when playback reaches the end of the source (e.g. queue advance). */
  onEnded?: () => void;
  /**
   * One-shot supplier of a media element primed (load()/play()) during the
   * user's play gesture. Safari/iOS and Firefox bless autoplay per element, so
   * playing THAT element is what lets the deferred autoplay succeed. The
   * surface calls it each time it builds a player, and keeps that player
   * across React StrictMode's effect replay, so the replay does not ask for
   * the element a second time. When it returns null (nothing primed, or
   * already taken) the surface creates its own element.
   */
  takeMediaEl?: () => HTMLVideoElement | null;
}

/** A player and the inputs it was built from. */
interface PlayerSession {
  player: Player;
  src: string;
  posterUrl: string | null | undefined;
  title: string;
  /** True from the effect's cleanup until the player is disposed or kept. */
  isReleased: boolean;
}

/**
 * Owns the video.js lifecycle. Mounted by the facade's play click, so it
 * autoplays once ready — playing the gesture-primed element from `takeMediaEl`
 * when provided, since browsers with per-element autoplay blessing would
 * reject a deferred play() on any other element. Registers with the playback
 * coordinator on 'play' so only one surface plays at a time, and disposes
 * cleanly on unmount (list virtualization / refetch), in a microtask of the
 * unmounting task. A player 'error' swaps in an inline fallback. An optional
 * `onEnded` callback fires when playback finishes (queue advance).
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
  // The player the effect built, so a replay of that effect can keep it.
  const sessionRef = useRef<PlayerSession | null>(null);

  useEffect(() => {
    onEndedRef.current = onEnded;
    takeMediaElRef.current = takeMediaEl;
  }, [onEnded, takeMediaEl]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const disposeReleased = (session: PlayerSession): void => {
      if (!session.isReleased) return;
      session.isReleased = false;
      sessionRef.current = null;
      releasePlayback(instanceId);
      session.player.dispose();
    };

    // The cleanup only marks the player released; a microtask disposes it.
    // React StrictMode (on in development) replays a new component's effects
    // — effect, cleanup, effect — in one synchronous pass, so the replay
    // reaches the check below first and keeps the player. Disposing in the
    // cleanup would empty the primed element (video.js strips its src and
    // calls load()), and the one-shot takeMediaEl has no second one to give.
    // A real unmount has no replay, and its microtask runs in the same task:
    // no timer or animation frame, which a hidden tab would never fire while
    // a source-primed element plays on.
    const releaseOnCleanup = (session: PlayerSession) => (): void => {
      session.isReleased = true;
      queueMicrotask(() => disposeReleased(session));
    };

    const released = sessionRef.current;
    if (released) {
      if (released.src === src && released.posterUrl === posterUrl && released.title === title) {
        released.isReleased = false;
        return releaseOnCleanup(released);
      }
      // Changed inputs (e.g. a playlist advancing): the old player goes now,
      // before the new one claims the playback session under the same id.
      disposeReleased(released);
    }

    // video.js adopts the data-vjs-player parent as the player root
    // (playerElIngest) and dispose() removes that parent from the DOM — so
    // the parent must be created here, fresh per player, never rendered by
    // React: otherwise the run after a dispose (a src change, e.g. a playlist
    // advancing) appends into a detached node and the player is invisible.
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

    // A source-primed element already carries this src (and is usually already
    // playing from the click gesture). Re-setting the same source would rerun
    // the media load algorithm and kill that playback.
    const isPreSourced = videoEl.getAttribute('src') === src;

    const player = videojs(videoEl, {
      controls: true,
      fluid: true,
      playsinline: true,
      preload: 'auto',
      poster: posterUrl ?? undefined,
      ...(isPreSourced ? {} : { sources: [{ src, type: getVideoMimeType(src) }] }),
    });

    bindPlayerVolumePersistence(player);

    player.ready(() => {
      if (!videoEl.paused) {
        // Playing since the gesture: video.js attached after the element's
        // only play event, so replicate what handleTechPlay_ would have done
        // (UI state + session claim) or the controls stay stuck not-started.
        player.hasStarted(true);
        player.removeClass('vjs-paused');
        player.addClass('vjs-playing');
        claimPlayback(instanceId, () => player.pause());
        return;
      }
      // Fresh element, or the gestured play() was rejected — try the deferred
      // play. Autoplay policies can reject it even now; swallow, and video.js
      // keeps its big play button as the direct-gesture recovery.
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

    const session: PlayerSession = { player, src, posterUrl, title, isReleased: false };
    sessionRef.current = session;
    return releaseOnCleanup(session);
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
