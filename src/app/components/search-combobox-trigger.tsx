/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ComponentProps, ReactElement } from 'react';

import { Search } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The punk-zine search box for a search field that is not a button — an inline
 * cmdk input wrapper, say: hard 2px black border, paper fill, a 2px ink offset,
 * and a ring in the surrounding panel's accent while the field inside it has
 * focus. The magnifier inside is drawn at full, bold ink to match
 * `SearchComboboxTrigger`.
 */
export const ZINE_SEARCH_FIELD_CLASS =
  'border-2 border-black bg-zinc-50 shadow-zine-ink transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-(--card-accent) [&_svg]:opacity-100 [&_svg]:stroke-[2.5px]';

export interface SearchComboboxTriggerProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** The active query, or the placeholder when there is none. */
  label: string;
}

/**
 * The trigger every public search combobox shares: a button styled as the
 * search field it stands in for, wearing the punk-zine box — hard 2px black
 * border, square corners, paper fill, and a 2px ink offset — with its label in
 * full ink. Focus and open ring in `--card-accent`, the accent of the
 * `ZinePanel` it sits in, so each page's search takes that page's colour.
 * Spreads its props (and `ref`) so `PopoverTrigger asChild` can drive it.
 */
export const SearchComboboxTrigger = ({
  label,
  className,
  ...props
}: SearchComboboxTriggerProps): ReactElement => (
  <button
    type="button"
    className={cn(
      'shadow-zine-ink flex w-full items-center gap-2 border-2 border-black bg-zinc-50 px-3 py-2 text-sm text-zinc-950 transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-(--card-accent) focus-visible:outline-none data-[state=open]:ring-[3px] data-[state=open]:ring-(--card-accent)',
      className
    )}
    {...props}
  >
    {/* Heavier stroke than lucide's default 2 so the glyph holds its own
        against the 2px zine border around it. */}
    <Search aria-hidden strokeWidth={2.5} className="size-4 shrink-0 text-black" />
    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
  </button>
);
