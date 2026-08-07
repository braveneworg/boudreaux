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
   * live: `load()` blesses WebKit, a gestured `play()` blesses Firefox — then
   * an immediate `pause()` (which the blessings survive) so the element is
   * handed off paused and the surface's deferred play() still fires a real
   * play event for video.js.
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
    // A sourceless play() doesn't reject — it flips `paused` to false, fires
    // the element's ONLY play event now (before video.js attaches a listener),
    // and playback then auto-resumes when the source arrives: the player UI
    // stays on the poster + big play button while audio runs underneath.
    // Pausing re-arms the play event for the surface's deferred play(); the
    // gesture blessings survive it (verified: Chromium, Firefox strictest
    // autoplay policy, WebKit).
    el.pause();
    primedElRef.current = el;
  };

  const takeMediaEl = (): HTMLVideoElement | null => {
    const el = primedElRef.current;
    primedElRef.current = null;
    return el;
  };

  return { primeMediaEl, takeMediaEl };
};
