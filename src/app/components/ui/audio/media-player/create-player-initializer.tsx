/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { MutableRefObject } from 'react';

import videojs from 'video.js';

import {
  getAudioRewindButton,
  getAudioFastForwardButton,
  getSkipPreviousButton,
  getSkipNextButton,
  resetClasses,
} from '@/app/components/ui/audio/audio-controls';

import type { MediaPlayerControls } from './media-player-controls';
import type Player from 'video.js/dist/types/player';

/**
 * Determines the correct MIME type for an audio URL based on its file extension.
 * Falls back to 'audio/mpeg' if the extension cannot be determined.
 */
export const getAudioMimeType = (url: string): string => {
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

export const clearPlayerErrorState = (player: Player): void => {
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

const registerVideoJSComponents = (): boolean => {
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

const safePlay = (player: Player): void => {
  const playPromise = player.play();
  if (playPromise !== undefined) {
    (playPromise as Promise<void>).catch(() => {});
  }
};

const retrySourceLoad = (player: Player, sourceToRetry: string, shouldResume: boolean): void => {
  player.src({ src: sourceToRetry, type: getAudioMimeType(sourceToRetry) });
  player.load();
  if (shouldResume) {
    safePlay(player);
  }
};

export interface PlayerInitializerRefs {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  audioElRef: MutableRefObject<HTMLAudioElement | null>;
  playerRef: MutableRefObject<Player | null>;
  isInitializedRef: MutableRefObject<boolean>;
  isSwitchingSourceRef: MutableRefObject<boolean>;
  pendingResumePlaybackRef: MutableRefObject<boolean>;
  transientErrorRecoveryAttemptedRef: MutableRefObject<boolean>;
  lastPreviousClickRef: MutableRefObject<number>;
  audioSrcRef: MutableRefObject<string>;
  controlsRefCallback: MutableRefObject<
    ((controls: MediaPlayerControls | null) => void) | undefined
  >;
  onPlayRef: MutableRefObject<(() => void) | undefined>;
  onPauseRef: MutableRefObject<(() => void) | undefined>;
  onEndedRef: MutableRefObject<(() => void) | undefined>;
  onPreviousTrackRef: MutableRefObject<((wasPlaying: boolean) => void) | undefined>;
  onNextTrackRef: MutableRefObject<((wasPlaying: boolean) => void) | undefined>;
}

export interface PlayerInitializerConstants {
  SKIP_TIME: number;
  DOUBLE_CLICK_THRESHOLD: number;
  REWIND_THRESHOLD: number;
}

/**
 * Returns an `initPlayer` function that, when called, attempts to create and
 * configure a Video.js player using the supplied ref container. Returns `true`
 * on success, `false` when Video.js is not yet ready (caller should retry).
 */
export const createPlayerInitializer = (
  refs: PlayerInitializerRefs,
  constants: PlayerInitializerConstants
): (() => boolean) => {
  const {
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
  } = refs;
  const { SKIP_TIME, DOUBLE_CLICK_THRESHOLD, REWIND_THRESHOLD } = constants;

  return (): boolean => {
    if (!videojs.getComponent('Button')) {
      return false;
    }

    if (!registerVideoJSComponents()) {
      return false;
    }

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
      userActions: { hotkeys: true },
      sources: [{ src: audioSrcRef.current, type: getAudioMimeType(audioSrcRef.current) }],
      fluid: false,
      fill: false,
      controlBar: {
        children: [
          'currentTimeDisplay',
          'progressControl',
          'durationDisplay',
          'skipPreviousButton',
          { name: 'audioRewindButton', seconds: SKIP_TIME },
          'playToggle',
          { name: 'audioFastForwardButton', seconds: SKIP_TIME },
          'skipNextButton',
          'volumePanel',
        ],
        volumePanel: { inline: false, vertical: false },
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
          play: () => safePlay(player),
          pause: () => player.pause(),
          toggle: () => {
            if (player.paused()) {
              safePlay(player);
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
      if (!isTransientSourceSwitchError(mediaError) || transientErrorRecoveryAttemptedRef.current) {
        isSwitchingSourceRef.current = false;
        pendingResumePlaybackRef.current = false;
        return;
      }

      transientErrorRecoveryAttemptedRef.current = true;
      const playerWithCurrentSrc = player as Player & {
        currentSrc?: string | (() => string);
      };
      const currentSrcValue =
        typeof playerWithCurrentSrc.currentSrc === 'function'
          ? playerWithCurrentSrc.currentSrc()
          : playerWithCurrentSrc.currentSrc;
      const sourceToRetry = currentSrcValue || audioSrcRef.current;
      const shouldResume = pendingResumePlaybackRef.current || !player.paused();

      clearPlayerErrorState(player);
      if (sourceToRetry) {
        retrySourceLoad(player, sourceToRetry, shouldResume);
      }
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
        onPreviousTrackRef.current?.(wasPlaying);
      } else {
        player.currentTime(0);
        if (wasPlaying) {
          safePlay(player);
        }
      }
    });

    player.on('skipnext', () => {
      const wasPlaying = !player.paused();
      onNextTrackRef.current?.(wasPlaying);
    });

    return true;
  };
};
