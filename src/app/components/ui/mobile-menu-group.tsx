/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import Link from 'next/link';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import type { NavMenuGroup } from '@/hooks/use-nav-menu-groups';
import { cn } from '@/lib/utils';
import { isActiveHref } from '@/lib/utils/is-active-href';

/**
 * Mobile mirror of the desktop drawer's trigger colors (Music cyan, Label hot
 * pink), minus the hover/focus entries — touch has no hover, so the color
 * shows only while the panel is open (`data-state`) or while the current route
 * sits inside the group (`trail`). Literal map — Tailwind only emits classes
 * it can read whole in source (same rule as the desktop TRIGGER_COLOR_CLASS).
 */
const TRIGGER_COLOR_CLASS = new Map<string, { open: string; trail: string }>([
  [
    'Music',
    {
      open: 'data-[state=open]:text-menu-item-cyan-400 data-[state=open]:underline',
      trail: 'text-menu-item-cyan-400',
    },
  ],
  [
    'Label',
    {
      open: 'data-[state=open]:text-menu-item-pink-400 data-[state=open]:underline',
      trail: 'text-menu-item-pink-400',
    },
  ],
]);

/**
 * 2px left "accent spine" for the expanded panel, in the trigger's exact ramp
 * color. Deliberately not `zine-accent-*` + `border-(--card-accent)`: the
 * accent utilities resolve cyan to the 300 shade (the trigger wears 400) and
 * `--card-accent` also drives global focus rings, so literals keep the spine
 * deterministic. Literal map for the same Tailwind extraction rule as above.
 */
const GROUP_SPINE_CLASS = new Map<string, string>([
  ['Music', 'border-menu-item-cyan-400'],
  ['Label', 'border-menu-item-pink-400'],
]);

export interface MobileMenuGroupProps {
  /** The grouped nav entry (label + drawer links) from `useNavMenuGroups`. */
  group: NavMenuGroup;
  /** Slot in the sheet's staggered reveal (delay = index * 0.1s). */
  index: number;
  /** Current pathname, threaded from the parent so the group stays presentational. */
  pathname: string;
  /** Invoked when a child link navigates (e.g. to close the sheet). */
  onNavigate: () => void;
}

/**
 * One grouped mobile nav entry: a cutout-type disclosure trigger with a
 * rotating chevron, plus its dark accordion panel. Children indent behind a
 * 2px spine in the group color and keep their shared per-item accent classes.
 * Must render inside the sheet's `Accordion.Root` (single/collapsible), which
 * enforces one-open-at-a-time; Radix supplies `aria-expanded` and keyboard
 * support on the trigger.
 */
export const MobileMenuGroup = ({
  group,
  index,
  pathname,
  onNavigate,
}: MobileMenuGroupProps): React.ReactElement => {
  const isTrailActive = group.items.some((item) => isActiveHref(item.href, pathname));
  const colors = TRIGGER_COLOR_CLASS.get(group.label);

  return (
    <AccordionPrimitive.Item asChild value={group.label}>
      <li
        className="menu-item-stagger font-fake-four-cutout"
        style={{ animationDelay: `${index * 0.1}s` }}
      >
        <AccordionPrimitive.Trigger
          className={cn(
            'mt-4 flex w-full items-center justify-between text-left text-xl tracking-wider text-zinc-50',
            'underline-offset-8 text-shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
            '[&[data-state=open]>svg]:rotate-180',
            colors?.open,
            isTrailActive && cn('underline', colors?.trail)
          )}
        >
          {group.label}
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 transition-transform duration-200"
          />
        </AccordionPrimitive.Trigger>
        <AccordionPrimitive.Content className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden bg-zinc-950">
          <ul className={cn('mt-2 mb-1 ml-1 border-l-2 pl-4', GROUP_SPINE_CLASS.get(group.label))}>
            {group.items.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  aria-current={isActiveHref(item.href, pathname) ? 'page' : undefined}
                  className={cn(
                    'mt-3 block text-lg tracking-wider text-zinc-50 no-underline underline-offset-8 text-shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white aria-[current=page]:underline',
                    item.color
                  )}
                  onClick={onNavigate}
                  unstable_dynamicOnHover
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </AccordionPrimitive.Content>
      </li>
    </AccordionPrimitive.Item>
  );
};
