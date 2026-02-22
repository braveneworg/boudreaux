/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import React, { useCallback, useEffect, useRef } from 'react';

import Image from 'next/image';

import videojs from 'video.js';

import 'video.js/dist/video-js.css';

import {
  ensureClasses,
  getAudioRewindButton,
  getAudioFastForwardButton,
  getSkipPreviousButton,
  getSkipNextButton,
} from '@/app/components/ui/audio/audio-controls';

import type Player from 'video.js/dist/types/player';

/**
 * Registers custom VideoJS components if they haven't been registered yet.
 * Must be called only when video.js is fully loaded (inside useEffect).
 * Uses Video.js's own component registry to avoid double-registration
 * issues during client-side navigation.
 *
 * @returns true if all components were registered successfully
 */
const registerVideoJSComponents = (): boolean => {
  // First ensure the lazy classes are built — this is a no-op if already done
  ensureClasses();

  const getters: [string, () => ReturnType<typeof videojs.getComponent> | null][] = [
    ['AudioRewindButton', getAudioRewindButton],
    ['AudioFastForwardButton', getAudioFastForwardButton],
    ['SkipPreviousButton', getSkipPreviousButton],
    ['SkipNextButton', getSkipNextButton],
  ];

  for (const [name, getComponent] of getters) {
    const component = getComponent();
    if (!component) {
      // Classes haven't been built yet (video.js Button not available)
      return false;
    }
    // Only register if not already present in Video.js's registry
    const existing = videojs.getComponent(name);
    if (!existing || existing === videojs.getComponent('Button')) {
      videojs.registerComponent(name, component);
    }
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

interface AudioPlayerProps {
  src: string;
  type?: string;
  poster?: string;
  onReady?: (player: Player) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onPreviousTrack?: (wasPlaying: boolean) => void;
  onNextTrack?: (wasPlaying: boolean) => void;
  autoPlay?: boolean;
  controlsRef?: (controls: { play: () => void; pause: () => void; toggle: () => void }) => void;
}

const SKIP_TIME = 10;
const DOUBLE_CLICK_THRESHOLD = 1000;
const REWIND_THRESHOLD = 3;
/** Maximum number of retry attempts to register video.js components */
const MAX_REGISTRATION_RETRIES = 10;
/** Delay between registration retry attempts in milliseconds */
const REGISTRATION_RETRY_DELAY = 50;

export const AudioPlayer = ({
  src,
  type,
  poster,
  onReady,
  onPlay,
  onPause,
  onEnded,
  onPreviousTrack,
  onNextTrack,
  autoPlay = false,
  controlsRef,
}: AudioPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const isInitializedRef = useRef(false);
  const initialSourceRef = useRef(src);
  const lastPreviousClickRef = useRef(0);

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

  const createPlayer = useCallback(
    (container: HTMLDivElement, audioSrc: string, audioType?: string) => {
      // Create audio element dynamically
      const audioEl = document.createElement('audio');
      audioEl.className = 'video-js vjs-default-skin';
      // iOS requires playsinline for inline media playback
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('webkit-playsinline', '');
      container.appendChild(audioEl);
      audioElRef.current = audioEl;

      const mimeType = audioType ?? getAudioMimeType(audioSrc);

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
        sources: [
          {
            src: audioSrc,
            type: mimeType,
          },
        ],
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

      return player;
    },
    []
  );

  // Initialize player once
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;

    let retryTimerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    /**
     * Attempts to register video.js custom components and initialise the
     * player. If registration fails (video.js Button not yet available
     * during client-side navigation), retries with increasing delay up to
     * MAX_REGISTRATION_RETRIES times.
     */
    const attemptInitialization = (attempt = 0) => {
      if (cancelled || isInitializedRef.current || !containerRef.current) return;

      const registered = registerVideoJSComponents();
      if (!registered) {
        if (attempt < MAX_REGISTRATION_RETRIES) {
          retryTimerId = setTimeout(
            () => attemptInitialization(attempt + 1),
            REGISTRATION_RETRY_DELAY
          );
        }
        return;
      }

      initializePlayer();
    };

    const initializePlayer = () => {
      if (!containerRef.current || isInitializedRef.current || cancelled) return;

      const player = createPlayer(containerRef.current, src, type);

      playerRef.current = player;
      isInitializedRef.current = true;

      player.ready(() => {
        player.addClass('vjs-audio');
        player.addClass('vjs-has-started');
        player.userActive(true);

        onReady?.(player);

        // Expose player controls via controlsRef after player is ready
        if (controlsRefCallback.current) {
          const controls = {
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
        player.userActive(true);
        onPlayRef.current?.();
      });

      player.on('pause', () => {
        onPauseRef.current?.();
      });

      player.on('ended', () => {
        onPauseRef.current?.();
        onEndedRef.current?.();
      });

      player.on('userinactive', () => {
        player.userActive(true);
      });

      // Handle skip previous button click
      player.on('skipprevious', () => {
        const currentTime = player.currentTime() || 0;
        const wasPlaying = !player.paused();
        const now = Date.now();
        const timeSinceLastClick = now - lastPreviousClickRef.current;
        lastPreviousClickRef.current = now;

        if (currentTime < REWIND_THRESHOLD || timeSinceLastClick < DOUBLE_CLICK_THRESHOLD) {
          onPreviousTrackRef.current?.(wasPlaying);
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

      // Handle skip next button click
      player.on('skipnext', () => {
        const wasPlaying = !player.paused();
        onNextTrackRef.current?.(wasPlaying);
      });
    };

    attemptInitialization();

    return () => {
      cancelled = true;
      if (retryTimerId !== null) {
        clearTimeout(retryTimerId);
      }
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
        audioElRef.current = null;
        isInitializedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update source when src changes (without recreating player)
  useEffect(() => {
    if (playerRef.current && isInitializedRef.current) {
      const isInitialSource = src === initialSourceRef.current;
      const mimeType = type ?? getAudioMimeType(src);

      playerRef.current.src({
        src,
        type: mimeType,
      });
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

      if (isInitialSource) {
        initialSourceRef.current = '';
      }
    }
  }, [src, type, autoPlay]);

  return (
    <div className="flex w-full flex-col">
      {poster && (
        <div className="responsive vjs-layout-small mx-auto w-[90%] overflow-hidden shadow-lg">
          <Image width={380} height={10} src={poster} alt="Album cover" priority />
        </div>
      )}
      <div ref={containerRef} className="audio-player-wrapper min-h-14" data-vjs-player />
    </div>
  );
};
