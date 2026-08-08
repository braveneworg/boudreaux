/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useRef } from 'react';
import type { MutableRefObject } from 'react';

import {
  createPlayerInitializer,
  clearPlayerErrorState,
  getAudioMimeType,
} from './create-player-initializer';
import { releasePlayback } from '../../playback-session';

import type Player from 'video.js/dist/types/player';

// video.js base skin + ./videojs-audio.css are imported globally in
// globals.css — chunk-level CSS on this `ssr: false` subtree would arrive as
// late-inserted stylesheets (unstyled first paint + FontFaceSet re-sync).

/**
 * Interface for accessing player controls from parent components.
 *
 * @property play - Function to start playback
 * @property pause - Function to pause playback
 * @property toggle - Function to toggle between play and pause
 */
export interface MediaPlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

/**
 * Props interface for the MediaControls component.
 */
interface MediaControlsProps {
  audioSrc: string;
  onPreviousTrack?: (wasPlaying: boolean) => void;
  onNextTrack?: (wasPlaying: boolean) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  autoPlay?: boolean;
  controlsRef?: (controls: MediaPlayerControls | null) => void;
  /**
   * One-shot supplier of an audio element primed (and usually already
   * playing) during the user's play gesture — see `usePrimedAudioHandoff`.
   * The initializer adopts it in place so the gesture's autoplay blessing
   * survives; returns null once taken, and a fresh element is created.
   */
  takeMediaEl?: () => HTMLAudioElement | null;
}

/**
 * Consumes the one-shot adopted-initial-source marker. Returns true when the
 * source-change effect must skip re-setting the source: the adopted element is
 * already playing it, and a same-src re-assign reruns the media load
 * algorithm, killing the gesture-started playback.
 */
const consumeAdoptedInitialSource = (
  isInitialSource: boolean,
  adoptedInitialSrcRef: MutableRefObject<boolean>,
  initialSourceRef: MutableRefObject<string>
): boolean => {
  if (!isInitialSource || !adoptedInitialSrcRef.current) return false;
  adoptedInitialSrcRef.current = false;
  initialSourceRef.current = '';
  return true;
};

/** Starts playback after a source change, swallowing iOS autoplay rejections. */
const attemptPlayAfterSourceChange = (player: Player): void => {
  const playPromise = player.play();
  if (playPromise !== undefined) {
    (playPromise as Promise<void>).catch(() => {
      // iOS may reject autoplay after source change
    });
  }
};

/**
 * Controls component for the media player.
 * Uses video.js library for audio playback — dynamically loaded to avoid
 * blocking the initial page bundle.
 */
export const Controls = ({
  audioSrc,
  onPreviousTrack,
  onNextTrack,
  onPlay,
  onPause,
  onEnded,
  autoPlay = false,
  controlsRef,
  takeMediaEl,
}: MediaControlsProps) => {
  const instanceId = useId();
  const instanceIdRef = useRef(instanceId);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const isInitializedRef = useRef(false);
  const isSwitchingSourceRef = useRef(false);
  const pendingResumePlaybackRef = useRef(false);
  const transientErrorRecoveryAttemptedRef = useRef(false);
  const initialSourceRef = useRef(audioSrc);
  const lastPreviousClickRef = useRef<number>(0);
  const SKIP_TIME = 10;
  const DOUBLE_CLICK_THRESHOLD = 1000;
  const REWIND_THRESHOLD = 3;

  // Use refs for callbacks to avoid re-running the effect when they change
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onPreviousTrackRef = useRef(onPreviousTrack);
  const onNextTrackRef = useRef(onNextTrack);
  const controlsRefCallback = useRef(controlsRef);
  const takeMediaElRef = useRef(takeMediaEl);
  // Set by the initializer when it adopts a pre-sourced primed element; the
  // source-change effect consumes it to skip the mount-time same-src re-set.
  const adoptedInitialSrcRef = useRef(false);

  // Use a ref for the source prop so the mount-once init effect can read the
  // latest value (initial source + error-recovery fallback) without listing it
  // as a dependency, which would re-create the player. Source changes are
  // handled by the dedicated effect below.
  const audioSrcRef = useRef(audioSrc);

  // Keep refs up to date
  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onEndedRef.current = onEnded;
    onPreviousTrackRef.current = onPreviousTrack;
    onNextTrackRef.current = onNextTrack;
    controlsRefCallback.current = controlsRef;
    takeMediaElRef.current = takeMediaEl;
    audioSrcRef.current = audioSrc;
  }, [onPlay, onPause, onEnded, onPreviousTrack, onNextTrack, controlsRef, takeMediaEl, audioSrc]);

  // Initialize player once
  useEffect(() => {
    if (isInitializedRef.current || !containerRef.current) return;

    const initPlayer = createPlayerInitializer(
      {
        instanceIdRef,
        containerRef,
        audioElRef,
        takeMediaElRef,
        adoptedInitialSrcRef,
        playerRef,
        isInitializedRef,
        isSwitchingSourceRef,
        pendingResumePlaybackRef,
        transientErrorRecoveryAttemptedRef,
        lastPreviousClickRef,
        audioSrcRef,
        controlsRefCallback,
        onPlayRef,
        onPauseRef,
        onEndedRef,
        onPreviousTrackRef,
        onNextTrackRef,
      },
      { SKIP_TIME, DOUBLE_CLICK_THRESHOLD, REWIND_THRESHOLD }
    );

    let isUnmounted = false;

    const cleanup = () => {
      isUnmounted = true;
      // Released unconditionally: a player disposed mid-playback must not stay
      // the session's claimant, or the next player would "pause" a dead one.
      releasePlayback(instanceIdRef.current);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        audioElRef.current = null;
        isInitializedRef.current = false;
      }
    };

    // Try to initialize immediately. Returning `cleanup` on this path too is
    // load-bearing: the immediate success case is the common one, so an early
    // bare `return` here left every audio player undisposed on unmount.
    if (initPlayer()) return cleanup;

    // If Video.js wasn't ready, retry with increasing delays.
    // This handles the case where client-side navigation causes
    // Video.js to be in a transitional state when useEffect fires.
    let retryCount = 0;
    const maxRetries = 10;
    const retryDelays = [0, 10, 25, 50, 100, 150, 200, 300, 500, 1000];

    const retryInit = () => {
      retryCount++;
      // `cleanup` resets `isInitializedRef`, so an in-flight retry would
      // happily build a player for an unmounted component without this guard.
      if (isUnmounted || retryCount > maxRetries || isInitializedRef.current) return;

      if (!initPlayer()) {
        const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
        setTimeout(retryInit, delay);
      }
    };

    // Start retry loop with requestAnimationFrame to wait for next paint
    requestAnimationFrame(() => {
      if (!isUnmounted && !isInitializedRef.current) {
        retryInit();
      }
    });

    return cleanup;
  }, []);

  // Update source when audioSrc changes (without recreating player)
  useEffect(() => {
    if (playerRef.current && isInitializedRef.current) {
      const isInitialSource = audioSrc === initialSourceRef.current;
      if (consumeAdoptedInitialSource(isInitialSource, adoptedInitialSrcRef, initialSourceRef)) {
        return;
      }
      const wasPlayingBeforeSourceChange = !playerRef.current.paused();
      isSwitchingSourceRef.current = true;
      transientErrorRecoveryAttemptedRef.current = false;
      pendingResumePlaybackRef.current =
        wasPlayingBeforeSourceChange || (autoPlay && !isInitialSource);
      clearPlayerErrorState(playerRef.current);
      playerRef.current.src({ src: audioSrc, type: getAudioMimeType(audioSrc) });
      playerRef.current.load();
      // Ensure controls remain visible after source change
      playerRef.current.addClass('vjs-has-started');
      playerRef.current.userActive(true);

      // Auto-play if enabled and this is not the initial source
      if (autoPlay && !isInitialSource) {
        attemptPlayAfterSourceChange(playerRef.current);
      }
      // Update initial source ref after first change
      if (isInitialSource) {
        initialSourceRef.current = '';
      }
    }
  }, [audioSrc, autoPlay]);

  // The data-vjs-player container lives INSIDE this host div and is created
  // per init by the initializer — video.js dispose() removes it, so it must
  // never be a React-rendered node.
  return <div ref={containerRef} className="audio-player-wrapper min-h-16" />;
};
