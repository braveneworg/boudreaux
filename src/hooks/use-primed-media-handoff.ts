/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef } from 'react';

import { usePlayerPrefs } from './use-player-prefs';

/** What a handoff primes: a release's track (`<audio>`) or a video. */
export type PrimedMediaKind = 'audio' | 'video';

/** Gesture-time media-element priming + one-shot handoff to a player. */
export interface PrimedMediaHandoff<MediaEl extends HTMLMediaElement> {
  /**
   * Call synchronously inside the user's play gesture.
   *
   * With `src`, playback of the real media STARTS inside the gesture — a
   * gestured play() with a real source is allowed by every autoplay policy,
   * so no later deferred play() (which strict profiles and extensions can
   * reject) is ever needed. The element carries the user's saved volume
   * prefs and hands off already playing.
   *
   * Without `src` (legacy video path), the element is primed for a later
   * deferred play: `load()` blesses WebKit, a gestured `play()` blesses
   * Firefox, and an immediate `pause()` (which the blessings survive) re-arms
   * the play event for video.js.
   */
  primeMediaEl: (src?: string) => void;
  /**
   * One-shot supplier of the primed element for the player; returns null once
   * taken (or before any priming), and a player that gets null creates its
   * own element. The video surface keeps the player it built on the taken
   * element across React StrictMode's effect replay, so one take is enough on
   * the dev server too.
   */
  takeMediaEl: () => MediaEl | null;
  /**
   * Stop and release an untaken primed element. Call when the play UI is
   * dismissed before the player mounted (e.g. the modal closes while the
   * release detail or the lazy chunk is still loading) — a source-primed
   * element is audibly playing and must not leak. No-op after a handoff.
   */
  discardMediaEl: () => void;
}

/** Fully stop a media element: pause, detach the source, abort the network. */
const stopMediaEl = (el: HTMLMediaElement): void => {
  el.pause();
  el.removeAttribute('src');
  el.load();
};

/** A fresh element of the kind; a video plays inline instead of fullscreen on iOS. */
const createMediaEl = <Kind extends PrimedMediaKind>(kind: Kind): HTMLElementTagNameMap[Kind] => {
  const el = document.createElement(kind);
  if (kind === 'video') el.setAttribute('playsinline', '');
  return el;
};

/**
 * A player that arrives long after the play click (a release detail fetch, a
 * lazy chunk, video.js init) is outside the gesture's activation window, and
 * strict autoplay policies reject its deferred `play()`, stranding it paused.
 * The media element must therefore be created — and, when the source is known
 * at click time, actually started — NOW, inside the gesture, and handed to the
 * player to adopt in place (see PRs #708/#711/#715): `MediaPlayer.Controls`
 * for a release's `<audio>`, the video surface for a `<video>`.
 *
 * @param kind - `'audio'` for a release's track, `'video'` for a video.
 */
export const usePrimedMediaHandoff = <Kind extends PrimedMediaKind>(
  kind: Kind
): PrimedMediaHandoff<HTMLElementTagNameMap[Kind]> => {
  const primedElRef = useRef<HTMLElementTagNameMap[Kind] | null>(null);

  // An owner that unmounts between the gesture and the player's mount (a
  // navigation, a route change under the modal) would otherwise strand a
  // playing element with no UI. Priming happens on a click, after mount, so
  // StrictMode's mount/cleanup/mount in dev never sees a primed element here.
  useEffect(
    () => () => {
      if (primedElRef.current) {
        stopMediaEl(primedElRef.current);
        primedElRef.current = null;
      }
    },
    []
  );

  const primeMediaEl = (src?: string): void => {
    // Never leak a previous untaken element — with a source it is playing.
    if (primedElRef.current) {
      stopMediaEl(primedElRef.current);
    }

    const el = createMediaEl(kind);
    if (src) {
      const { volume, muted } = usePlayerPrefs.getState();
      el.volume = volume;
      el.muted = muted;
      el.src = src;
      el.play().catch(() => {});
      // No pause: the player adopts the element mid-playback and syncs the
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

  const takeMediaEl = (): HTMLElementTagNameMap[Kind] | null => {
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
