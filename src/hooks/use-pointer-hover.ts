/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * How long after the last scroll event a pointer move is still treated as part
 * of the scroll. A wheel turn nudges the mouse, and those nudges must not zoom
 * the photo that happens to be passing under it.
 */
export const SCROLL_QUIET_MS = 150;

const TOUCH_POINTER_TYPE = 'touch';

interface PointerPosition {
  x: number;
  y: number;
}

export interface PointerHoverProps {
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
}

export interface UsePointerHoverResult {
  /** True only while a mouse or pen has actually moved over the element. */
  isHovered: boolean;
  /** Spread onto the element whose hover is being tracked. */
  hoverProps: PointerHoverProps;
}

// Page-wide pointer facts, shared by every mounted hook so a card knows where
// the pointer last was even when that was over some other element.
let lastPosition: PointerPosition | null = null;
let lastScrollAt: number | null = null;
let subscriberCount = 0;

const recordPosition = ({ clientX, clientY }: PointerEvent): void => {
  lastPosition = { x: clientX, y: clientY };
};

const recordScroll = (): void => {
  lastScrollAt = Date.now();
};

const SCROLL_LISTENER_OPTIONS = { capture: true, passive: true } as const;

/**
 * Starts the page-wide tracking on the first subscriber. The move listener
 * sits on the window in the bubble phase, so it records a position only after
 * the element's own handler has compared against the previous one.
 */
const subscribe = (): void => {
  subscriberCount += 1;
  if (subscriberCount > 1) return;
  globalThis.addEventListener('pointermove', recordPosition);
  globalThis.addEventListener('scroll', recordScroll, SCROLL_LISTENER_OPTIONS);
};

const unsubscribe = (): void => {
  subscriberCount -= 1;
  if (subscriberCount > 0) return;
  globalThis.removeEventListener('pointermove', recordPosition);
  globalThis.removeEventListener('scroll', recordScroll, SCROLL_LISTENER_OPTIONS);
  lastPosition = null;
  lastScrollAt = null;
};

const isScrolling = (): boolean =>
  lastScrollAt !== null && Date.now() - lastScrollAt < SCROLL_QUIET_MS;

const hasMoved = ({ clientX, clientY }: ReactPointerEvent<HTMLElement>): boolean =>
  lastPosition === null || lastPosition.x !== clientX || lastPosition.y !== clientY;

/**
 * Hover that answers to the pointer moving, not to the page moving under it.
 *
 * CSS `:hover` applies to whatever sits under the cursor, so scrolling a list
 * past a resting cursor hovers each row in turn and plays its hover animation.
 * This hook reports hover only when a mouse or pen has really moved: it ignores
 * touch, ignores a move that reports the position the pointer already had,
 * ignores moves made while the page is scrolling, and drops the hover as soon
 * as the page scrolls. An element left under a resting cursor after a scroll
 * therefore stays unhovered until the pointer moves again.
 *
 * Keyboard focus is not covered here — pair it with a `focus-visible` style.
 *
 * @returns The hover flag and the pointer handlers to spread on the element.
 */
export const usePointerHover = (): UsePointerHoverResult => {
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    subscribe();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isHovered) return undefined;
    const clearHover = (): void => setIsHovered(false);
    globalThis.addEventListener('scroll', clearHover, SCROLL_LISTENER_OPTIONS);
    return () => globalThis.removeEventListener('scroll', clearHover, SCROLL_LISTENER_OPTIONS);
  }, [isHovered]);

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === TOUCH_POINTER_TYPE) return;
    if (isScrolling() || !hasMoved(event)) return;
    setIsHovered(true);
  };

  const onPointerLeave = (): void => setIsHovered(false);

  return { isHovered, hoverProps: { onPointerMove, onPointerLeave } };
};
