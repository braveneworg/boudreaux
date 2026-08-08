/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';

import { usePlayerPrefs } from './use-player-prefs';

/** Gesture-time media-element priming + one-shot handoff to a player surface. */
export interface PrimedMediaHandoff {
  /**
   * Call synchronously inside the user's play gesture.
   *
   * With `src`, playback of the real media STARTS inside the gesture — a
   * gestured play() with a real source is allowed by every autoplay policy,
   * so no later deferred play() (which strict profiles and extensions can
   * reject) is ever needed. The element carries the user's saved volume
   * prefs and hands off already playing.
   *
   * Without `src` (legacy path), the element is primed for a later deferred
   * play: `load()` blesses WebKit, a gestured `play()` blesses Firefox, and
   * an immediate `pause()` (which the blessings survive) re-arms the play
   * event for video.js.
   */
  primeMediaEl: (src?: string) => void;
  /**
   * One-shot supplier of the primed element for the player surface; returns
   * null once taken (or before any priming), and the surface then falls back
   * to a self-created element (e.g. StrictMode remount).
   */
  takeMediaEl: () => HTMLVideoElement | null;
  /**
   * Stop and release an unclaimed primed element. Call when the play UI is
   * dismissed before the surface mounted (e.g. the modal closes while the
   * lazy chunk is still loading) — a source-primed element is audibly
   * playing and must not leak. No-op after a successful handoff.
   */
  discardMediaEl: () => void;
}

/** Fully stop a media element: pause, detach the source, abort the network. */
const stopMediaEl = (el: HTMLVideoElement): void => {
  el.pause();
  el.removeAttribute('src');
  el.load();
};

/**
 * A lazily-loaded player surface arrives long after the play click (lazy chunk
 * + video.js init), outside the gesture's activation window — strict autoplay
 * policies then reject its deferred `play()`, stranding the player paused.
 * The media element must therefore be created — and, when the source is known
 * at click time, actually started — NOW, inside the gesture, and handed to
 * the surface to adopt in place (see PRs #708/#711).
 */
export const usePrimedMediaHandoff = (): PrimedMediaHandoff => {
  const primedElRef = useRef<HTMLVideoElement | null>(null);

  const primeMediaEl = (src?: string): void => {
    // Never leak a previous unclaimed element — with a source it is playing.
    if (primedElRef.current) {
      stopMediaEl(primedElRef.current);
    }

    const el = document.createElement('video');
    el.setAttribute('playsinline', '');
    if (src) {
      const { volume, muted } = usePlayerPrefs.getState();
      el.volume = volume;
      el.muted = muted;
      el.src = src;
      el.play().catch(() => {});
      // No pause: the surface adopts the element mid-playback and syncs the
      // video.js UI state itself (it never sees this element's play event).
    } else {
      el.load();
      el.play().catch(() => {});
      // A sourceless play() doesn't reject — it flips `paused` to false and
      // fires the element's ONLY play event now, before video.js attaches.
      // Pausing re-arms the play event for the surface's deferred play(); the
      // gesture blessings survive it (verified: Chromium, Firefox strictest
      // autoplay policy, WebKit).
      el.pause();
    }
    primedElRef.current = el;
  };

  const takeMediaEl = (): HTMLVideoElement | null => {
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
