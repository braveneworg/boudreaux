/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';

/** Gesture-time media-element priming + one-shot handoff to a player surface. */
export interface PrimedMediaHandoff {
  /**
   * Call synchronously inside the user's play gesture. Creates the `<video>`
   * element the surface will later play and primes it while the gesture is
   * live: `load()` blesses WebKit, a gestured `play()` blesses Firefox (it
   * rejects for lack of a source — irrelevant, the blessing sticks).
   */
  primeMediaEl: () => void;
  /**
   * One-shot supplier of the primed element for the player surface; returns
   * null once taken (or before any priming), and the surface then falls back
   * to a self-created element (e.g. StrictMode remount).
   */
  takeMediaEl: () => HTMLVideoElement | null;
}

/**
 * A lazily-loaded player surface arrives long after the play click (lazy chunk
 * + video.js init), outside the gesture's activation window — Safari/iOS and
 * Firefox then reject its deferred `play()`, stranding the player paused
 * behind a second play button. Autoplay blessing is per media element in
 * those browsers, so the element must be created and primed NOW, inside the
 * gesture, and handed to the surface to play in place (Google IMA-documented
 * pattern; see PR #708).
 */
export const usePrimedMediaHandoff = (): PrimedMediaHandoff => {
  const primedElRef = useRef<HTMLVideoElement | null>(null);

  const primeMediaEl = (): void => {
    const el = document.createElement('video');
    el.setAttribute('playsinline', '');
    el.load();
    el.play().catch(() => {});
    primedElRef.current = el;
  };

  const takeMediaEl = (): HTMLVideoElement | null => {
    const el = primedElRef.current;
    primedElRef.current = null;
    return el;
  };

  return { primeMediaEl, takeMediaEl };
};
