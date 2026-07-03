/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { ZineSquareTrail } from './zine-square-trail';

/** Query the trail's square elements in document order. */
const getSquares = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-slot="zine-square-trail"] > span'));

/** Parse the numeric value out of a `prefix-[N%]` / `prefix-N` utility class. */
const parseUtilityValue = (className: string, pattern: RegExp): number => {
  const match = pattern.exec(className);
  if (!match) {
    throw new Error(`expected ${pattern} in "${className}"`);
  }
  return Number(match[1]);
};

const leftPercentOf = (square: HTMLElement): number =>
  parseUtilityValue(square.className, /left-\[(\d+)%\]/);

const topPercentOf = (square: HTMLElement): number =>
  parseUtilityValue(square.className, /top-\[(\d+)%\]/);

const opacityOf = (square: HTMLElement): number =>
  parseUtilityValue(square.className, /opacity-(\d+)/);

const sizeClassOf = (square: HTMLElement): string => {
  const match = /size-[\d.]+/.exec(square.className);
  if (!match) {
    throw new Error(`expected a size-N class in "${square.className}"`);
  }
  return match[0];
};

/** Squares ordered by horizontal position, nearest the heading first. */
const getSquaresByLeft = (container: HTMLElement): HTMLElement[] =>
  [...getSquares(container)].sort((a, b) => leftPercentOf(a) - leftPercentOf(b));

const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

describe('ZineSquareTrail', () => {
  it('renders a decorative aria-hidden container', () => {
    const { container } = render(<ZineSquareTrail />);

    const trail = container.querySelector('[data-slot="zine-square-trail"]');
    expect(trail).toHaveAttribute('aria-hidden', 'true');
  });

  it('fills leftover row width and stretches to the row height', () => {
    const { container } = render(<ZineSquareTrail />);

    // self-stretch (not a fixed height) keeps the scatter as tall as the
    // heading image it trails, at every viewport.
    const trail = container.querySelector('[data-slot="zine-square-trail"]');
    expect(trail).toHaveClass('relative', 'flex-1', 'self-stretch', 'overflow-hidden');
    expect(trail?.className).not.toMatch(/(?:^|\s)h-\d/);
  });

  it('renders a scatter of same-size squares tinted by the current color', () => {
    const { container } = render(<ZineSquareTrail />);

    const squares = getSquares(container);
    expect(squares.length).toBeGreaterThanOrEqual(64);
    squares.forEach((square) => {
      expect(square).toHaveClass('absolute', 'bg-current');
    });
    // Squares never shrink — the trail-off is carried by opacity alone.
    expect(new Set(squares.map(sizeClassOf))).toEqual(new Set(['size-2']));
  });

  it('jumbles squares vertically across multiple rows', () => {
    const { container } = render(<ZineSquareTrail />);

    const tops = getSquares(container).map(topPercentOf);

    // Wide vertical spread (several rows), with per-square jitter rather
    // than ruler-straight lines.
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(40);
    expect(new Set(tops).size).toBeGreaterThanOrEqual(8);
  });

  it('keeps every square inside the wordmark block height', () => {
    const { container } = render(<ZineSquareTrail />);

    const tops = getSquares(container).map(topPercentOf);

    // The heading image carries transparent fringe around its color block
    // (~8% top, ~92% bottom of the row). Squares must never poke past it.
    tops.forEach((top) => {
      expect(top).toBeGreaterThanOrEqual(9);
      expect(top).toBeLessThanOrEqual(81);
    });
  });

  it('keeps its full height all the way as it trails off', () => {
    const { container } = render(<ZineSquareTrail />);

    const tops = getSquaresByLeft(container).map(topPercentOf);
    const third = Math.floor(tops.length / 3);
    const spreadOf = (values: number[]): number => Math.max(...values) - Math.min(...values);

    // No wedge: the scatter spans the block height at the start AND at the
    // far end — only opacity carries the trail-off.
    expect(spreadOf(tops.slice(0, third))).toBeGreaterThanOrEqual(55);
    expect(spreadOf(tops.slice(-third))).toBeGreaterThanOrEqual(55);
  });

  it('packs rows densely down the block height with no empty lanes', () => {
    const { container } = render(<ZineSquareTrail />);

    const uniqueTops = [...new Set(getSquares(container).map(topPercentOf))].sort((a, b) => a - b);

    // Vertically dense: adjacent occupied heights are never more than a
    // square apart, so no horizontal lane of blank space opens up.
    uniqueTops.slice(1).forEach((top, index) => {
      expect(top - (uniqueTops.at(index) ?? top)).toBeLessThanOrEqual(8);
    });
  });

  it('spans the full trail width, denser beside the heading', () => {
    const { container } = render(<ZineSquareTrail />);

    const lefts = getSquares(container).map(leftPercentOf);
    const nearCount = lefts.filter((left) => left < 33).length;
    const farCount = lefts.filter((left) => left >= 66).length;

    expect(Math.min(...lefts)).toBeLessThanOrEqual(5);
    expect(Math.max(...lefts)).toBeGreaterThanOrEqual(90);
    expect(nearCount).toBeGreaterThan(farCount);
  });

  it('trails off in opacity across the width', () => {
    const { container } = render(<ZineSquareTrail />);

    const opacities = getSquaresByLeft(container).map(opacityOf);
    const quarter = Math.floor(opacities.length / 4);

    expect(average(opacities.slice(0, quarter))).toBeGreaterThanOrEqual(70);
    expect(average(opacities.slice(-quarter))).toBeLessThanOrEqual(35);
  });

  it('varies opacity with jitter instead of fading uniformly', () => {
    const { container } = render(<ZineSquareTrail />);

    const opacities = getSquaresByLeft(container).map(opacityOf);

    opacities.forEach((opacity) => {
      expect(opacity).toBeGreaterThanOrEqual(15);
      expect(opacity).toBeLessThanOrEqual(90);
    });
    expect(new Set(opacities).size).toBeGreaterThanOrEqual(5);
    // Jitter, not a straight fade: somewhere a square outshines its
    // left-hand neighbor.
    const risesSomewhere = opacities.some(
      (opacity, index) => index > 0 && opacity > (opacities.at(index - 1) ?? opacity)
    );
    expect(risesSomewhere).toBe(true);
  });

  it('cn-merges a custom className onto the container', () => {
    const { container } = render(<ZineSquareTrail className="hidden text-[#45fefc] sm:block" />);

    const trail = container.querySelector('[data-slot="zine-square-trail"]');
    expect(trail).toHaveClass('hidden', 'sm:block', 'text-[#45fefc]', 'flex-1');
  });

  it('spreads extra props onto the container', () => {
    const { container } = render(<ZineSquareTrail id="releases-trail" />);

    expect(container.querySelector('[data-slot="zine-square-trail"]')).toHaveAttribute(
      'id',
      'releases-trail'
    );
  });
});
