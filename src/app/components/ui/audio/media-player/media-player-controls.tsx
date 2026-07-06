/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import {
  createPlayerInitializer,
  clearPlayerErrorState,
  getAudioMimeType,
} from './create-player-initializer';

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
}

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
}: MediaControlsProps) => {
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
    audioSrcRef.current = audioSrc;
  }, [onPlay, onPause, onEnded, onPreviousTrack, onNextTrack, controlsRef, audioSrc]);

  // Initialize player once
  useEffect(() => {
    if (isInitializedRef.current || !containerRef.current) return;

    const initPlayer = createPlayerInitializer(
      {
        containerRef,
        audioElRef,
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

    // Try to initialize immediately
    if (initPlayer()) return;

    // If Video.js wasn't ready, retry with increasing delays.
    // This handles the case where client-side navigation causes
    // Video.js to be in a transitional state when useEffect fires.
    let retryCount = 0;
    const maxRetries = 10;
    const retryDelays = [0, 10, 25, 50, 100, 150, 200, 300, 500, 1000];

    const retryInit = () => {
      retryCount++;
      if (retryCount > maxRetries || isInitializedRef.current) return;

      if (!initPlayer()) {
        const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)];
        setTimeout(retryInit, delay);
      }
    };

    // Start retry loop with requestAnimationFrame to wait for next paint
    requestAnimationFrame(() => {
      if (!isInitializedRef.current) {
        retryInit();
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
        audioElRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, []);

  // Update source when audioSrc changes (without recreating player)
  useEffect(() => {
    if (playerRef.current && isInitializedRef.current) {
      const isInitialSource = audioSrc === initialSourceRef.current;
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
        const playPromise = playerRef.current.play();
        if (playPromise !== undefined) {
          (playPromise as Promise<void>).catch(() => {
            // iOS may reject autoplay after source change
          });
        }
      }
      // Update initial source ref after first change
      if (isInitialSource) {
        initialSourceRef.current = '';
      }
    }
  }, [audioSrc, autoPlay]);

  return <div ref={containerRef} className="audio-player-wrapper min-h-16" data-vjs-player />;
};
