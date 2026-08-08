/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';

import { usePlayerPrefs } from './use-player-prefs';

/** Gesture-time audio-element priming + one-shot handoff to the audio player. */
export interface PrimedAudioHandoff {
  /**
   * Call synchronously inside the user's play gesture with the real track
   * source. Playback STARTS inside the gesture — a gestured play() with a
   * real source is allowed by every autoplay policy, so no later deferred
   * play() (which strict profiles and extensions can reject) is ever needed.
   * The element carries the user's saved volume prefs and hands off playing.
   */
  primeMediaEl: (src: string) => void;
  /**
   * One-shot supplier of the primed element for the audio player; returns
   * null once taken (or before any priming), and the player then falls back
   * to a self-created element (e.g. StrictMode remount).
   */
  takeMediaEl: () => HTMLAudioElement | null;
  /**
   * Stop and release an unclaimed primed element. Call when the play UI is
   * dismissed before the player mounted (e.g. the modal closes while the
   * release detail is still loading) — a source-primed element is audibly
   * playing and must not leak. No-op after a successful handoff.
   */
  discardMediaEl: () => void;
}

/** Fully stop an audio element: pause, detach the source, abort the network. */
const stopMediaEl = (el: HTMLAudioElement): void => {
  el.pause();
  el.removeAttribute('src');
  el.load();
};

/**
 * Audio sibling of {@link usePrimedMediaHandoff} (keep the two mechanisms in
 * sync — see src/hooks/use-primed-media-handoff.ts). The release play modal's
 * player arrives long after the Play click (detail fetch + lazy video.js
 * chunk), outside the gesture's activation window — strict autoplay policies
 * then reject its deferred `play()`. The audio element must therefore be
 * created and started NOW, inside the gesture, and handed to
 * `MediaPlayer.Controls` to adopt in place (see PRs #708/#711/#715).
 */
export const usePrimedAudioHandoff = (): PrimedAudioHandoff => {
  const primedElRef = useRef<HTMLAudioElement | null>(null);

  const primeMediaEl = (src: string): void => {
    // Never leak a previous unclaimed element — it is audibly playing.
    if (primedElRef.current) {
      stopMediaEl(primedElRef.current);
    }

    const el = document.createElement('audio');
    const { volume, muted } = usePlayerPrefs.getState();
    el.volume = volume;
    el.muted = muted;
    el.src = src;
    el.play().catch(() => {});
    // No pause: the audio player adopts the element mid-playback and syncs
    // the video.js UI state itself (it never sees this element's play event).
    primedElRef.current = el;
  };

  const takeMediaEl = (): HTMLAudioElement | null => {
    const el = primedElRef.current;
    primedElRef.current = null;
    return el;
  };

  const discardMediaEl = (): void => {
    if (primedElRef.current) {
      stopMediaEl(primedElRef.current);
    }
    primedElRef.current = null;
  };

  return { primeMediaEl, takeMediaEl, discardMediaEl };
};
