/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Heading, type HeadingProps } from './heading';

/**
 * Cutout-font strip heading for zine pages. `h-auto` neutralizes Heading's
 * fixed level heights so the strip isn't clipped; the strip background reads
 * `--card-accent-soft` so it matches the ambient page accent automatically.
 */
export const ZineHeading = ({
  level,
  className,
  children,
  ...props
}: HeadingProps): React.ReactElement => (
  <Heading level={level} className={cn('mt-1 mb-4 h-auto', className)} {...props}>
    {/* Explicit `uppercase` deliberately beats the base `h1 { text-transform: capitalize }`. */}
    <span
      data-slot="zine-heading"
      className="font-fake-four-cutout shadow-zine-ink relative inline-block w-full -rotate-1 border-2 border-black bg-[var(--card-accent-soft)] px-3 py-1 text-3xl tracking-wide text-black uppercase sm:w-auto sm:text-4xl"
    >
      {children}
    </span>
  </Heading>
);
