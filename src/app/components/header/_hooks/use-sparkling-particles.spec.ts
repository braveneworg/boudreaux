/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';

import { useSparklingParticles } from './use-sparkling-particles';

describe('useSparklingParticles', () => {
  it('generates 20 sparkles', () => {
    const { result } = renderHook(() => useSparklingParticles());

    expect(result.current.sparkles).toHaveLength(20);
  });

  it('generates 15 extinguish particles', () => {
    const { result } = renderHook(() => useSparklingParticles());

    expect(result.current.extinguishParticles).toHaveLength(15);
  });

  it('assigns sequential ids to sparkles', () => {
    const { result } = renderHook(() => useSparklingParticles());

    expect(result.current.sparkles.map((sparkle) => sparkle.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `sparkle-${i}`)
    );
  });

  it('assigns sequential ids to extinguish particles', () => {
    const { result } = renderHook(() => useSparklingParticles());

    expect(result.current.extinguishParticles.map((particle) => particle.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `extinguish-${i}`)
    );
  });

  it('produces deterministic positions across renders', () => {
    const { result } = renderHook(() => useSparklingParticles());
    const first = result.current.sparkles;

    const { result: secondResult } = renderHook(() => useSparklingParticles());

    expect(secondResult.current.sparkles).toEqual(first);
  });

  it('rounds positions to at most 4 decimal places', () => {
    const { result } = renderHook(() => useSparklingParticles());

    const allRounded = result.current.sparkles.every(
      (sparkle) => Math.round(sparkle.left * 1_000_000) % 100 === 0
    );
    expect(allRounded).toBe(true);
  });

  it('keeps the same reference between re-renders (memoized)', () => {
    const { result, rerender } = renderHook(() => useSparklingParticles());
    const first = result.current.sparkles;

    rerender();

    expect(result.current.sparkles).toBe(first);
  });

  it('produces sparkle positions within the 0-100 percent range', () => {
    const { result } = renderHook(() => useSparklingParticles());

    const withinRange = result.current.sparkles.every(
      (sparkle) =>
        sparkle.left >= 0 && sparkle.left <= 100 && sparkle.top >= 0 && sparkle.top <= 100
    );
    expect(withinRange).toBe(true);
  });
});
