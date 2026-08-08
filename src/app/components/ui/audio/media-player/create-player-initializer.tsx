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
import { bindPlayerVolumePersistence } from '@/hooks/use-player-prefs';

import { claimPlayback } from '../../playback-session';

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
  /** Stable per-instance identity used to claim the shared playback session. */
  instanceIdRef: MutableRefObject<string>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  audioElRef: MutableRefObject<HTMLAudioElement | null>;
  /**
   * One-shot supplier of an audio element primed (and usually already
   * playing) inside the user's play gesture — see `usePrimedAudioHandoff`.
   * When absent or exhausted, the initializer creates its own element.
   */
  takeMediaElRef: MutableRefObject<(() => HTMLAudioElement | null) | undefined>;
  /**
   * Set when a pre-sourced element was adopted, so the source-change effect
   * skips its mount-time re-set of the same src (which would rerun the media
   * load algorithm and kill the gesture-started playback).
   */
  adoptedInitialSrcRef: MutableRefObject<boolean>;
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

interface AcquiredAudioElement {
  audioEl: HTMLAudioElement;
  /** True when the adopted element already carries the current src. */
  isPreSourced: boolean;
}

/**
 * Adopts the gesture-primed element when one is available — autoplay blessings
 * are per element, so only playing THAT element survives strict policies —
 * falling back to a fresh `<audio>` otherwise. The adoption is "pre-sourced"
 * when the element already carries the current src (and is usually still
 * playing from the click gesture): re-setting the same source would rerun the
 * media load algorithm and kill that playback, so the initializer must skip
 * its `sources` option and the mount-time re-set in that case.
 */
const acquireAudioElement = (
  takeMediaEl: (() => HTMLAudioElement | null) | undefined,
  currentSrc: string
): AcquiredAudioElement => {
  const adopted = takeMediaEl?.() ?? null;
  const audioEl = adopted ?? document.createElement('audio');
  const isPreSourced = adopted !== null && adopted.getAttribute('src') === currentSrc;
  return { audioEl, isPreSourced };
};

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

    // video.js adopts the data-vjs-player parent as the player root
    // (playerElIngest) and dispose() removes that parent from the DOM — so
    // the parent is created here, fresh per init, inside the React-owned
    // host div: otherwise the init after a dispose (StrictMode remount in
    // dev) would append into a node the prior dispose already detached,
    // leaving the player invisible.
    const playerContainer = document.createElement('div');
    playerContainer.setAttribute('data-vjs-player', '');

    // The adopted (or fresh) element must sit inside the data-vjs-player
    // container when videojs() is called (player-element ingest) or the
    // gesture's autoplay blessing is lost.
    const { audioEl, isPreSourced } = acquireAudioElement(
      takeMediaElRef.current,
      audioSrcRef.current
    );
    audioEl.className = 'video-js vjs-default-skin';
    audioEl.setAttribute('playsinline', '');
    audioEl.setAttribute('webkit-playsinline', '');
    playerContainer.appendChild(audioEl);
    containerRef.current.appendChild(playerContainer);
    audioElRef.current = audioEl;

    if (isPreSourced) {
      adoptedInitialSrcRef.current = true;
    }

    const player = videojs(audioEl, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      playsinline: true,
      responsive: true,
      inactivityTimeout: 0,
      userActions: { hotkeys: true },
      ...(isPreSourced
        ? {}
        : { sources: [{ src: audioSrcRef.current, type: getAudioMimeType(audioSrcRef.current) }] }),
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
    bindPlayerVolumePersistence(player);

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
      // Every audio player in the app is built here, so claiming the shared
      // session once covers the release, artist, featured and playlist players.
      claimPlayback(instanceIdRef.current, () => player.pause());
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

    if (isPreSourced && !audioEl.paused) {
      // Playing since the gesture: video.js attached after the element's only
      // play event, so re-fire it once ready — after the handlers above are
      // registered — to sync the control bar, claim the shared session, and
      // notify the parent's isPlaying state.
      player.ready(() => {
        player.removeClass('vjs-paused');
        player.addClass('vjs-playing');
        player.trigger('play');
      });
    }

    return true;
  };
};
