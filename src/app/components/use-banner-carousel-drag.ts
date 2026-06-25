/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, type MutableRefObject, type PointerEvent } from 'react';

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;

/** Outcome of evaluating a finished drag against the swipe thresholds. */
export type SwipeOutcome = 'next' | 'previous' | 'snap-back';

/**
 * Decide how a finished drag resolves: advance, go back, or snap to center.
 * A swipe counts when the drag distance OR fling velocity passes its threshold.
 */
export const resolveSwipe = (deltaX: number, velocity: number): SwipeOutcome => {
  if (deltaX < -SWIPE_THRESHOLD || velocity < -VELOCITY_THRESHOLD) return 'next';
  if (deltaX > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) return 'previous';
  return 'snap-back';
};

/**
 * Apply elastic resistance past the halfway point so the track resists, rather
 * than freely following the finger, once dragged beyond half its width.
 */
export const applyElasticResistance = (deltaX: number, width: number): number => {
  const limit = width * 0.5;
  if (Math.abs(deltaX) <= limit) return deltaX;
  return Math.sign(deltaX) * (limit + (Math.abs(deltaX) - limit) * 0.1);
};

export interface BannerCarouselDragOptions {
  /** Total number of slides; drag is a no-op when 1 or fewer. */
  totalSlides: number;
  /** True while a slide animation is in flight — drag yields to it. */
  isAnimatingRef: MutableRefObject<boolean>;
  /** Index currently shown; read to compute the next/previous target. */
  currentIndexRef: MutableRefObject<number>;
  /** Current container width in px, with `fallback` before layout. */
  measureWidth: (fallback: number) => number;
  /** Run `fn` with the track element when it is mounted. */
  withTrack: (fn: (track: HTMLDivElement) => void) => void;
  /** Transition the track to `targetX`, invoking `onComplete` at transitionend. */
  animateTrack: (targetX: number, onComplete: () => void) => void;
  /** Finish a slide transition: commit `toIndex` and snap the track home. */
  completeTransition: (toIndex: number) => void;
  /** Mark the incoming slide so its strip/image render mid-transition. */
  setIncomingIndex: (index: number) => void;
  /** Reset and restart the auto-rotation timer after user interaction. */
  resetTimer: () => void;
}

export interface BannerCarouselDragHandlers {
  handlePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}

export interface ReleaseContext {
  deltaX: number;
  velocity: number;
  width: number;
  options: BannerCarouselDragOptions;
}

/**
 * Resolve a finished drag: either animate to the adjacent slide (committing the
 * incoming index) or snap the track back to center. Lives at module scope so the
 * `handlePointerUp` callback stays small and within the per-function line limit.
 */
export const executeSwipeRelease = ({ deltaX, velocity, width, options }: ReleaseContext): void => {
  const { isAnimatingRef, currentIndexRef, totalSlides } = options;
  const outcome = resolveSwipe(deltaX, velocity);

  if (outcome === 'snap-back') {
    options.animateTrack(0, () => {
      isAnimatingRef.current = false;
    });
    return;
  }

  isAnimatingRef.current = true;
  const step = outcome === 'next' ? 1 : -1;
  const target = (currentIndexRef.current + step + totalSlides) % totalSlides;
  options.setIncomingIndex(target);
  options.animateTrack(-step * width, () => options.completeTransition(target));
};

/**
 * Pointer-based drag/swipe gesture for the banner carousel. Tracks the active
 * pointer in refs (no re-renders mid-drag), translates the track live with
 * elastic resistance, and on release either animates to the adjacent slide or
 * snaps back — mirroring keyboard/dot navigation. Behavior is identical to the
 * inline handlers it replaces.
 */
export const useBannerCarouselDrag = (
  options: BannerCarouselDragOptions
): BannerCarouselDragHandlers => {
  const { totalSlides, isAnimatingRef, measureWidth, withTrack, resetTimer } = options;
  const pointerStartXRef = useRef(0);
  const pointerStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const currentDragXRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (isAnimatingRef.current || totalSlides <= 1) return;
      isDraggingRef.current = true;
      pointerStartXRef.current = e.clientX;
      pointerStartTimeRef.current = Date.now();
      currentDragXRef.current = 0;
      withTrack((track) => {
        track.style.transition = 'none';
        e.currentTarget.setPointerCapture(e.pointerId);
      });
    },
    [totalSlides, isAnimatingRef, withTrack]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const delta = applyElasticResistance(e.clientX - pointerStartXRef.current, measureWidth(1));
      currentDragXRef.current = delta;
      withTrack((track) => {
        track.style.transform = `translateX(${delta}px)`;
      });
    },
    [measureWidth, withTrack]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (isAnimatingRef.current) return;

      const deltaX = currentDragXRef.current;
      const elapsed = Date.now() - pointerStartTimeRef.current;
      const velocity = elapsed > 0 ? (deltaX / elapsed) * 1000 : 0;
      executeSwipeRelease({ deltaX, velocity, width: measureWidth(0), options });
      resetTimer();
    },
    [isAnimatingRef, measureWidth, options, resetTimer]
  );

  return { handlePointerDown, handlePointerMove, handlePointerUp };
};
