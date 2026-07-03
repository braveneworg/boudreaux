/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

/**
 * Hand-drawn double border for zine headings: two decorative zinc-950
 * frames, each inset asymmetrically, tilted and skewed its own way, so the
 * strokes never quite line up with the box they trace — like a marker run
 * around the edge twice. Render inside a `relative` anchor sized to the
 * content being framed. Purely presentational — hidden from assistive tech.
 */
export const ZineSketchStrokes = (): React.ReactElement => (
  <>
    <span
      data-slot="zine-sketch-stroke"
      aria-hidden="true"
      className="absolute -top-1.5 -right-1 -bottom-1 -left-2 rotate-1 -skew-x-2 border-2 border-zinc-950"
    />
    <span
      data-slot="zine-sketch-stroke"
      aria-hidden="true"
      className="absolute -top-0.5 -right-2.5 -bottom-2 -left-1 -rotate-1 skew-x-3 border border-zinc-950"
    />
  </>
);
