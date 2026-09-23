/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/**
 * Punk-zine segmented toggle — the sort switch on the public listings.
 *
 * Not the `outline` variant: that draws a per-item hairline border and a soft
 * shadow, neither of which is the zine look. One hard black frame with an ink
 * offset wraps the items, and the divider rides on every item after the first.
 * The selected item fills with `--card-accent`, so it matches whichever
 * `zine-accent-*` the surrounding page panel sets.
 */
const ZineToggleGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroup>): React.ReactElement => (
  <ToggleGroup
    className={cn('shadow-zine-ink w-fit border-2 border-black bg-zinc-50', className)}
    {...props}
  />
);

/**
 * `flex-none` is load-bearing — `ToggleGroupItem` defaults to `flex-1`
 * (basis 0), which splits a `w-fit` group evenly between the items while
 * `whitespace-nowrap` refuses to wrap, so the longer label spilled past its
 * own box.
 */
const ZineToggleGroupItem = ({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupItem>): React.ReactElement => (
  <ToggleGroupItem
    className={cn(
      'h-9 flex-none px-4 text-xs font-semibold tracking-wider uppercase not-first:border-l-2 not-first:border-black hover:bg-zinc-200 data-[state=on]:bg-[var(--card-accent)] data-[state=on]:text-black',
      className
    )}
    {...props}
  />
);

export { ZineToggleGroup, ZineToggleGroupItem };
