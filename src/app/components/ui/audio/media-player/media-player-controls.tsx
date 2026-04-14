/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import videojs from 'video.js';

import {
  getAudioRewindButton,
  getAudioFastForwardButton,
  getSkipPreviousButton,
  getSkipNextButton,
  resetClasses,
} from '@/app/components/ui/audio/audio-controls';

import type Player from 'video.js/dist/types/player';

import 'video.js/dist/video-js.css';
import './videojs-audio.css';

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
 * Registers custom VideoJS components if they haven't been registered yet.
 * Must be called only when video.js is fully loaded (inside useEffect).
 *
 * Always verifies components are actually in Video.js's registry to handle
 * state resets during Next.js client-side navigation.
 *
 * @returns true if all components were registered successfully
 */
const registerVideoJSComponents = (): boolean => {
  // Always force a fresh rebuild and registration.
  // After player.dispose(), Video.js may silently drop custom components
  // from its registry while keeping the same Button base class reference,
  // making cached-reference checks unreliable.
  resetClasses();

  const getters: [string, () => ReturnType<typeof videojs.getComponent> | null][] = [
    ['AudioRewindButton', getAudioRewindButton],
    ['AudioFastForwardButton', getAudioFastForwardButton],
    ['SkipPreviousButton', getSkipPreviousButton],
    ['SkipNextButton', getSkipNextButton],
  ];

  for (const [name, getComponent] of getters) {
    const component = getComponent();
    if (!component) {
      return false;
    }
    videojs.registerComponent(name, component);
  }

  return true;
};

/**
 * Determines the correct MIME type for an audio URL based on its file extension.
 * Falls back to 'audio/mpeg' if the extension cannot be determined.
 */
const getAudioMimeType = (url: string): string => {
  const extension = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    mpeg: 'audio/mpeg',
    wav: 'audio/wav',
    wave: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    webm: 'audio/webm',
    aiff: 'audio/aiff',
    aif: 'audio/aiff',
  };
  return mimeTypes[extension ?? ''] ?? 'audio/mpeg';
};

/**
 * Browser media stacks can emit transient decode/abort errors while switching
 * sources quickly. These are often recoverable and should not show the Video.js
 * error overlay to users.
 */
const isTransientSourceSwitchError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const mediaError = error as { message?: string };
  const message = mediaError.message?.toLowerCase() ?? '';

  return /aborted due to a corruption|corruption problem|media playback was aborted/.test(message);
};

const clearPlayerErrorState = (player: Player): void => {
  const playerWithErrorApi = player as Player & {
    error?: (value?: null) => unknown;
    removeClass?: (className: string) => void;
    el?: () => Element | null;
  };

  if (typeof playerWithErrorApi.error === 'function') {
    playerWithErrorApi.error(null);
  }

  if (typeof playerWithErrorApi.removeClass === 'function') {
    playerWithErrorApi.removeClass('vjs-error');
  }

  const playerElement =
    typeof playerWithErrorApi.el === 'function' ? playerWithErrorApi.el() : null;
  const errorDisplay = playerElement?.querySelector('.vjs-error-display');
  if (errorDisplay instanceof HTMLElement) {
    errorDisplay.classList.add('vjs-hidden');
    errorDisplay.setAttribute('aria-hidden', 'true');
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

  // Keep refs up to date
  useEffect(() => {
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
    onEndedRef.current = onEnded;
    onPreviousTrackRef.current = onPreviousTrack;
    onNextTrackRef.current = onNextTrack;
    controlsRefCallback.current = controlsRef;
  }, [onPlay, onPause, onEnded, onPreviousTrack, onNextTrack, controlsRef]);

  // Initialize player once
  useEffect(() => {
    // Bail out if already initialized or no container
    if (isInitializedRef.current || !containerRef.current) return;

    /**
     * Attempts to register Video.js components and create the player.
     * Returns true if successful, false if Video.js isn't ready yet.
     */
    const initPlayer = (): boolean => {
      // Verify Video.js is fully loaded — Button must be available
      if (!videojs.getComponent('Button')) {
        return false;
      }

      // Register custom components (always force-rebuilds)
      if (!registerVideoJSComponents()) {
        return false;
      }

      // Double-check registration actually stuck
      const BaseButton = videojs.getComponent('Button');
      const allRegistered = [
        'AudioRewindButton',
        'AudioFastForwardButton',
        'SkipPreviousButton',
        'SkipNextButton',
      ].every((name) => {
        const comp = videojs.getComponent(name);
        return comp && comp !== BaseButton;
      });

      if (!allRegistered) {
        return false;
      }

      if (!containerRef.current) return false;

      // Create audio element dynamically
      const audioEl = document.createElement('audio');
      audioEl.className = 'video-js vjs-default-skin';
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('webkit-playsinline', '');
      containerRef.current.appendChild(audioEl);
      audioElRef.current = audioEl;

      const player = videojs(audioEl, {
        controls: true,
        autoplay: false,
        preload: 'auto',
        playsinline: true,
        responsive: true,
        inactivityTimeout: 0,
        userActions: {
          hotkeys: true,
        },
        sources: [{ src: audioSrc, type: getAudioMimeType(audioSrc) }],
        fluid: false,
        fill: false,
        controlBar: {
          children: [
            'currentTimeDisplay',
            'progressControl',
            'durationDisplay',
            'skipPreviousButton',
            {
              name: 'audioRewindButton',
              seconds: SKIP_TIME,
            },
            'playToggle',
            {
              name: 'audioFastForwardButton',
              seconds: SKIP_TIME,
            },
            'skipNextButton',
            'volumePanel',
          ],
          volumePanel: {
            inline: false,
            vertical: false,
          },
        },
      });

      playerRef.current = player;
      isInitializedRef.current = true;

      player.ready(() => {
        player.addClass('vjs-audio');
        player.addClass('vjs-has-started');
        player.userActive(true);

        if (controlsRefCallback.current) {
          const controls: MediaPlayerControls = {
            play: () => {
              const playPromise = player.play();
              if (playPromise !== undefined) {
                (playPromise as Promise<void>).catch(() => {
                  // iOS may reject play() if not initiated by a user gesture
                });
              }
            },
            pause: () => player.pause(),
            toggle: () => {
              if (player.paused()) {
                const playPromise = player.play();
                if (playPromise !== undefined) {
                  (playPromise as Promise<void>).catch(() => {
                    // iOS may reject play() if not initiated by a user gesture
                  });
                }
              } else {
                player.pause();
              }
            },
          };
          controlsRefCallback.current(controls);
        }
      });

      player.on('play', () => {
        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
        transientErrorRecoveryAttemptedRef.current = false;
        player.userActive(true);
        onPlayRef.current?.();
      });

      player.on('pause', () => {
        onPauseRef.current?.();
      });

      player.on('ended', () => {
        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
        transientErrorRecoveryAttemptedRef.current = false;
        onPauseRef.current?.();
        onEndedRef.current?.();
      });

      player.on('canplay', () => {
        isSwitchingSourceRef.current = false;
        transientErrorRecoveryAttemptedRef.current = false;
      });

      player.on('error', () => {
        const mediaError = player.error();
        if (
          isTransientSourceSwitchError(mediaError) &&
          !transientErrorRecoveryAttemptedRef.current
        ) {
          transientErrorRecoveryAttemptedRef.current = true;
          const playerWithCurrentSrc = player as Player & {
            currentSrc?: string | (() => string);
          };
          const currentSrcValue =
            typeof playerWithCurrentSrc.currentSrc === 'function'
              ? playerWithCurrentSrc.currentSrc()
              : playerWithCurrentSrc.currentSrc;
          const sourceToRetry = currentSrcValue || audioSrc;
          const shouldResume = pendingResumePlaybackRef.current || !player.paused();

          clearPlayerErrorState(player);
          if (sourceToRetry) {
            player.src({ src: sourceToRetry, type: getAudioMimeType(sourceToRetry) });
            player.load();
            if (shouldResume) {
              const playPromise = player.play();
              if (playPromise !== undefined) {
                (playPromise as Promise<void>).catch(() => {
                  // If retry fails, allow normal Video.js error handling on the next error event
                });
              }
            }
          }
          return;
        }

        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
      });

      player.on('userinactive', () => {
        player.userActive(true);
      });

      player.on('skipprevious', () => {
        const currentTime = player.currentTime() || 0;
        const wasPlaying = !player.paused();
        const now = Date.now();
        const timeSinceLastClick = now - lastPreviousClickRef.current;
        lastPreviousClickRef.current = now;

        if (currentTime < REWIND_THRESHOLD || timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
          if (onPreviousTrackRef.current) {
            onPreviousTrackRef.current(wasPlaying);
          }
        } else {
          player.currentTime(0);
          if (wasPlaying) {
            const playPromise = player.play();
            if (playPromise !== undefined) {
              (playPromise as Promise<void>).catch(() => {
                // iOS may reject play() after seeking
              });
            }
          }
        }
      });

      player.on('skipnext', () => {
        const wasPlaying = !player.paused();
        if (onNextTrackRef.current) {
          onNextTrackRef.current(wasPlaying);
        }
      });

      return true;
    };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return <div ref={containerRef} className="audio-player-wrapper min-h-14" data-vjs-player />;
};
