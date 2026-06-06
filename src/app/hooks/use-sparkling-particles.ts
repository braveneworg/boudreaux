/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMemo } from 'react';

interface Particle {
  id: string;
  left: number;
  top: number;
  delay: number;
  duration: number;
}

interface SparklingParticles {
  sparkles: Particle[];
  extinguishParticles: Particle[];
}

/**
 * Deterministic pseudo-random based on index — avoids hydration mismatch
 * while producing visually varied positions/delays.
 *
 * Rounded to 4 decimal places so Node and browser `Math.sin` float
 * differences don't cause mismatched style strings.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49979;
  return Math.round((x - Math.floor(x)) * 10000) / 10000;
}

/**
 * Generates two stable sets of deterministically-positioned particles for the
 * header animation: rising white sparkles and falling orange "extinguishing"
 * embers. Memoized so the same positions persist across re-renders.
 */
export const useSparklingParticles = (): SparklingParticles => {
  const sparkles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: `sparkle-${i}`,
        left: seededRandom(i * 3 + 1) * 100,
        top: seededRandom(i * 3 + 2) * 100,
        delay: seededRandom(i * 3 + 3) * 2,
        duration: 1.4 + seededRandom(i * 3 + 4) * 0.4,
      })),
    []
  );

  const extinguishParticles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => ({
        id: `extinguish-${i}`,
        left: seededRandom(i * 5 + 100) * 100,
        top: seededRandom(i * 5 + 101) * 100,
        delay: seededRandom(i * 5 + 102) * 1,
        duration: 1.2 + seededRandom(i * 5 + 103) * 0.6,
      })),
    []
  );

  return { sparkles, extinguishParticles };
};
