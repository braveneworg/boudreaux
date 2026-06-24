/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { MutableRefObject } from 'react';

import {
  applyElasticResistance,
  executeSwipeRelease,
  resolveSwipe,
  type BannerCarouselDragOptions,
} from './use-banner-carousel-drag';

/* ---------- resolveSwipe ---------- */

describe('resolveSwipe', () => {
  it('returns "next" when dragged past the negative distance threshold', () => {
    expect(resolveSwipe(-60, 0)).toBe('next');
  });

  it('returns "next" when flung past the negative velocity threshold', () => {
    expect(resolveSwipe(-10, -600)).toBe('next');
  });

  it('returns "previous" when dragged past the positive distance threshold', () => {
    expect(resolveSwipe(60, 0)).toBe('previous');
  });

  it('returns "previous" when flung past the positive velocity threshold', () => {
    expect(resolveSwipe(10, 600)).toBe('previous');
  });

  it('returns "snap-back" when neither distance nor velocity threshold is met', () => {
    expect(resolveSwipe(20, 100)).toBe('snap-back');
  });

  it('treats the distance threshold as exclusive at exactly 50px', () => {
    expect(resolveSwipe(50, 0)).toBe('snap-back');
  });
});

/* ---------- applyElasticResistance ---------- */

describe('applyElasticResistance', () => {
  it('returns the raw delta within half the width', () => {
    expect(applyElasticResistance(100, 800)).toBe(100);
  });

  it('returns the raw delta at exactly half the width', () => {
    expect(applyElasticResistance(400, 800)).toBe(400);
  });

  it('compresses positive drags beyond half the width to 10% past the limit', () => {
    // limit = 400; overshoot = 500 - 400 = 100; result = 400 + 100 * 0.1 = 410
    expect(applyElasticResistance(500, 800)).toBe(410);
  });

  it('compresses negative drags symmetrically beyond half the width', () => {
    expect(applyElasticResistance(-500, 800)).toBe(-410);
  });
});

/* ---------- executeSwipeRelease ---------- */

type AnimateTrackSpy = ReturnType<typeof vi.fn<(targetX: number, onComplete: () => void) => void>>;
type IndexSpy = ReturnType<typeof vi.fn<(index: number) => void>>;

interface SwipeSpies {
  options: BannerCarouselDragOptions;
  animateTrack: AnimateTrackSpy;
  completeTransition: IndexSpy;
  setIncomingIndex: IndexSpy;
  isAnimatingRef: MutableRefObject<boolean>;
}

const makeSwipeOptions = (totalSlides: number, currentIndex: number): SwipeSpies => {
  const animateTrack: AnimateTrackSpy = vi.fn();
  const completeTransition: IndexSpy = vi.fn();
  const setIncomingIndex: IndexSpy = vi.fn();
  const isAnimatingRef: MutableRefObject<boolean> = { current: false };
  const currentIndexRef: MutableRefObject<number> = { current: currentIndex };

  const options: BannerCarouselDragOptions = {
    totalSlides,
    isAnimatingRef,
    currentIndexRef,
    measureWidth: () => 800,
    withTrack: () => {},
    animateTrack,
    completeTransition,
    setIncomingIndex,
    resetTimer: () => {},
  };

  return { options, animateTrack, completeTransition, setIncomingIndex, isAnimatingRef };
};

describe('executeSwipeRelease', () => {
  it('advances to the next slide and marks the incoming index on a left swipe', () => {
    const { options, setIncomingIndex } = makeSwipeOptions(3, 0);

    executeSwipeRelease({ deltaX: -100, velocity: 0, width: 800, options });

    expect(setIncomingIndex).toHaveBeenCalledWith(1);
  });

  it('animates the track left by the full width when advancing', () => {
    const { options, animateTrack } = makeSwipeOptions(3, 0);

    executeSwipeRelease({ deltaX: -100, velocity: 0, width: 800, options });

    expect(animateTrack).toHaveBeenCalledWith(-800, expect.any(Function));
  });

  it('wraps to the last slide when swiping back from the first', () => {
    const { options, setIncomingIndex } = makeSwipeOptions(3, 0);

    executeSwipeRelease({ deltaX: 100, velocity: 0, width: 800, options });

    expect(setIncomingIndex).toHaveBeenCalledWith(2);
  });

  it('sets the animating flag when a swipe commits to a slide', () => {
    const { options, isAnimatingRef } = makeSwipeOptions(3, 0);

    executeSwipeRelease({ deltaX: -100, velocity: 0, width: 800, options });

    expect(isAnimatingRef.current).toBe(true);
  });

  it('snaps the track back to center without changing the index on a small drag', () => {
    const { options, animateTrack, setIncomingIndex } = makeSwipeOptions(3, 0);

    executeSwipeRelease({ deltaX: 10, velocity: 0, width: 800, options });

    expect(animateTrack).toHaveBeenCalledWith(0, expect.any(Function));
    expect(setIncomingIndex).not.toHaveBeenCalled();
  });

  it('clears the animating flag from the snap-back completion callback', () => {
    const { options, animateTrack, isAnimatingRef } = makeSwipeOptions(3, 0);
    isAnimatingRef.current = true;

    executeSwipeRelease({ deltaX: 10, velocity: 0, width: 800, options });
    const onComplete = animateTrack.mock.calls[0]?.[1];
    onComplete?.();

    expect(isAnimatingRef.current).toBe(false);
  });

  it('finishes the transition with the target index from the animate callback', () => {
    const { options, animateTrack, completeTransition } = makeSwipeOptions(3, 0);

    executeSwipeRelease({ deltaX: -100, velocity: 0, width: 800, options });
    const onComplete = animateTrack.mock.calls[0]?.[1];
    onComplete?.();

    expect(completeTransition).toHaveBeenCalledWith(1);
  });
});
