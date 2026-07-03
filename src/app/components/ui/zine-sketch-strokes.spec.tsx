/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { ZineSketchStrokes } from './zine-sketch-strokes';

describe('ZineSketchStrokes', () => {
  const renderStrokes = () =>
    render(
      <span className="relative inline-block">
        <ZineSketchStrokes />
      </span>
    );

  it('renders two decorative strokes', () => {
    const { container } = renderStrokes();

    const strokes = container.querySelectorAll('[data-slot="zine-sketch-stroke"]');
    expect(strokes).toHaveLength(2);
  });

  it('hides the strokes from assistive tech and anchors them absolutely', () => {
    const { container } = renderStrokes();

    container.querySelectorAll('[data-slot="zine-sketch-stroke"]').forEach((stroke) => {
      expect(stroke).toHaveAttribute('aria-hidden', 'true');
      expect(stroke).toHaveClass('absolute', 'border-zinc-950');
    });
  });

  it('tilts and skews each stroke differently so they never line up', () => {
    const { container } = renderStrokes();

    const strokes = [...container.querySelectorAll('[data-slot="zine-sketch-stroke"]')];
    strokes.forEach((stroke) => {
      expect(stroke.className).toMatch(/skew-x-/);
      expect(stroke.className).toMatch(/rotate-/);
    });
    expect(new Set(strokes.map((stroke) => stroke.className)).size).toBe(strokes.length);
  });
});
