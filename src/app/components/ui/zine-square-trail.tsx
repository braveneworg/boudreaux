/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cn } from '@/lib/utils';

export type ZineSquareTrailProps = React.ComponentProps<'div'>;

/**
 * Hand-tuned scatter, six tight rows of same-size squares spanning the full
 * band height from end to end. Within each row the horizontal gaps only
 * ever grow and every top is jittered off its row's band, so nothing reads
 * as a ruler line. Tops stay inside 10%–79% so no square pokes past the
 * wordmark block's edges (the heading image carries ~8% transparent
 * fringe). The trail-off is carried by opacity alone — it slides toward
 * transparent with the horizontal position, wiggling a little on the way.
 * Full literal utilities — never template-build these, Tailwind only emits
 * classes it sees in source.
 */
const TRAIL_SQUARES = [
  // Row 1 — top edge of the block
  { position: 'left-[0%]', top: 'top-[12%]', opacity: 'opacity-90' },
  { position: 'left-[4%]', top: 'top-[13%]', opacity: 'opacity-85' },
  { position: 'left-[8%]', top: 'top-[15%]', opacity: 'opacity-80' },
  { position: 'left-[13%]', top: 'top-[11%]', opacity: 'opacity-85' },
  { position: 'left-[19%]', top: 'top-[14%]', opacity: 'opacity-70' },
  { position: 'left-[26%]', top: 'top-[16%]', opacity: 'opacity-65' },
  { position: 'left-[34%]', top: 'top-[10%]', opacity: 'opacity-55' },
  { position: 'left-[43%]', top: 'top-[13%]', opacity: 'opacity-50' },
  { position: 'left-[53%]', top: 'top-[15%]', opacity: 'opacity-40' },
  { position: 'left-[64%]', top: 'top-[12%]', opacity: 'opacity-30' },
  { position: 'left-[76%]', top: 'top-[11%]', opacity: 'opacity-25' },
  { position: 'left-[89%]', top: 'top-[14%]', opacity: 'opacity-15' },
  // Row 2
  { position: 'left-[2%]', top: 'top-[24%]', opacity: 'opacity-85' },
  { position: 'left-[6%]', top: 'top-[22%]', opacity: 'opacity-90' },
  { position: 'left-[11%]', top: 'top-[27%]', opacity: 'opacity-80' },
  { position: 'left-[16%]', top: 'top-[23%]', opacity: 'opacity-75' },
  { position: 'left-[22%]', top: 'top-[26%]', opacity: 'opacity-70' },
  { position: 'left-[29%]', top: 'top-[21%]', opacity: 'opacity-60' },
  { position: 'left-[37%]', top: 'top-[25%]', opacity: 'opacity-55' },
  { position: 'left-[46%]', top: 'top-[28%]', opacity: 'opacity-45' },
  { position: 'left-[56%]', top: 'top-[22%]', opacity: 'opacity-40' },
  { position: 'left-[67%]', top: 'top-[26%]', opacity: 'opacity-35' },
  { position: 'left-[79%]', top: 'top-[23%]', opacity: 'opacity-25' },
  { position: 'left-[92%]', top: 'top-[27%]', opacity: 'opacity-15' },
  // Row 3
  { position: 'left-[1%]', top: 'top-[36%]', opacity: 'opacity-90' },
  { position: 'left-[5%]', top: 'top-[34%]', opacity: 'opacity-80' },
  { position: 'left-[10%]', top: 'top-[38%]', opacity: 'opacity-85' },
  { position: 'left-[15%]', top: 'top-[33%]', opacity: 'opacity-75' },
  { position: 'left-[21%]', top: 'top-[37%]', opacity: 'opacity-65' },
  { position: 'left-[28%]', top: 'top-[40%]', opacity: 'opacity-60' },
  { position: 'left-[36%]', top: 'top-[35%]', opacity: 'opacity-50' },
  { position: 'left-[45%]', top: 'top-[39%]', opacity: 'opacity-45' },
  { position: 'left-[55%]', top: 'top-[34%]', opacity: 'opacity-35' },
  { position: 'left-[66%]', top: 'top-[38%]', opacity: 'opacity-30' },
  { position: 'left-[78%]', top: 'top-[36%]', opacity: 'opacity-20' },
  { position: 'left-[91%]', top: 'top-[33%]', opacity: 'opacity-15' },
  // Row 4
  { position: 'left-[3%]', top: 'top-[47%]', opacity: 'opacity-85' },
  { position: 'left-[7%]', top: 'top-[45%]', opacity: 'opacity-80' },
  { position: 'left-[12%]', top: 'top-[50%]', opacity: 'opacity-75' },
  { position: 'left-[18%]', top: 'top-[46%]', opacity: 'opacity-80' },
  { position: 'left-[24%]', top: 'top-[49%]', opacity: 'opacity-70' },
  { position: 'left-[31%]', top: 'top-[52%]', opacity: 'opacity-60' },
  { position: 'left-[39%]', top: 'top-[45%]', opacity: 'opacity-55' },
  { position: 'left-[48%]', top: 'top-[48%]', opacity: 'opacity-45' },
  { position: 'left-[58%]', top: 'top-[51%]', opacity: 'opacity-40' },
  { position: 'left-[69%]', top: 'top-[46%]', opacity: 'opacity-30' },
  { position: 'left-[81%]', top: 'top-[50%]', opacity: 'opacity-20' },
  { position: 'left-[94%]', top: 'top-[48%]', opacity: 'opacity-15' },
  // Row 5
  { position: 'left-[2%]', top: 'top-[59%]', opacity: 'opacity-90' },
  { position: 'left-[7%]', top: 'top-[57%]', opacity: 'opacity-85' },
  { position: 'left-[13%]', top: 'top-[62%]', opacity: 'opacity-75' },
  { position: 'left-[19%]', top: 'top-[58%]', opacity: 'opacity-70' },
  { position: 'left-[26%]', top: 'top-[61%]', opacity: 'opacity-65' },
  { position: 'left-[33%]', top: 'top-[64%]', opacity: 'opacity-55' },
  { position: 'left-[41%]', top: 'top-[57%]', opacity: 'opacity-50' },
  { position: 'left-[50%]', top: 'top-[60%]', opacity: 'opacity-45' },
  { position: 'left-[60%]', top: 'top-[63%]', opacity: 'opacity-35' },
  { position: 'left-[71%]', top: 'top-[58%]', opacity: 'opacity-25' },
  { position: 'left-[83%]', top: 'top-[62%]', opacity: 'opacity-20' },
  { position: 'left-[95%]', top: 'top-[60%]', opacity: 'opacity-15' },
  // Row 6 — bottom edge of the block
  { position: 'left-[0%]', top: 'top-[72%]', opacity: 'opacity-85' },
  { position: 'left-[4%]', top: 'top-[70%]', opacity: 'opacity-80' },
  { position: 'left-[9%]', top: 'top-[75%]', opacity: 'opacity-75' },
  { position: 'left-[14%]', top: 'top-[71%]', opacity: 'opacity-70' },
  { position: 'left-[20%]', top: 'top-[74%]', opacity: 'opacity-65' },
  { position: 'left-[27%]', top: 'top-[78%]', opacity: 'opacity-60' },
  { position: 'left-[35%]', top: 'top-[69%]', opacity: 'opacity-50' },
  { position: 'left-[44%]', top: 'top-[73%]', opacity: 'opacity-40' },
  { position: 'left-[54%]', top: 'top-[77%]', opacity: 'opacity-35' },
  { position: 'left-[65%]', top: 'top-[70%]', opacity: 'opacity-30' },
  { position: 'left-[77%]', top: 'top-[76%]', opacity: 'opacity-20' },
  { position: 'left-[90%]', top: 'top-[79%]', opacity: 'opacity-15' },
] as const;

/**
 * Decorative scatter of squares that spills out from behind a zine
 * heading's color block, dissolving in opacity across the leftover row
 * width while holding its full height. Stretches to the flex row's height
 * so it always matches the heading it trails. Squares are `bg-current`, so
 * callers pick the tint with a text color (e.g. the heading image's
 * background color). Purely presentational — hidden from assistive tech.
 */
export const ZineSquareTrail = ({
  className,
  ...props
}: ZineSquareTrailProps): React.ReactElement => (
  <div
    data-slot="zine-square-trail"
    aria-hidden="true"
    className={cn('relative top-3 flex-1 self-stretch overflow-hidden', className)}
    {...props}
  >
    {TRAIL_SQUARES.map(({ position, top, opacity }) => (
      <span
        key={`${position} ${top}`}
        className={cn('absolute size-2 bg-current', position, top, opacity)}
      />
    ))}
  </div>
);
