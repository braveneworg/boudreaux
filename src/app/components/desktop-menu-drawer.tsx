/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import Link from 'next/link';

import type { NavMenuGroup } from '@/hooks/use-nav-menu-groups';
import { cn } from '@/lib/utils';
import { isActiveHref } from '@/lib/utils/is-active-href';
import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
} from '@/ui/navigation-menu';

/**
 * Per-drawer paper-scrap accent + tilt. Literal map — Tailwind only emits
 * classes it can see as full literals in source (same rule as ZinePanel's
 * ACCENT_CLASS). Each drawer's accent matches its trigger's ramp color: Music
 * cyan, Label hot pink.
 */
const DRAWER_ACCENT_CLASS = new Map<string, string>([
  ['Music', 'zine-accent-cyan -rotate-[1.5deg]'],
  ['Label', 'zine-accent-hot-pink rotate-[1.5deg]'],
]);

/**
 * Per-group trigger color: Music ▾ wears cyan (its Releases ramp), Label ▾ wears
 * the hot pink of its own drawer accent. Literal map — Tailwind only emits
 * classes it can read whole (same rule as DRAWER_ACCENT_CLASS). `interactive`
 * colors the label on hover and while the drawer is open; `trail` colors it
 * while the current route sits inside the group. The label's color drives the
 * underline (`text-decoration-color` follows `currentColor`), so the two never
 * diverge — and each ramp value stays legible on the black masthead, overriding
 * shadcn's near-black `data-[state=open]:text-accent-foreground` trigger default.
 */
const TRIGGER_COLOR_CLASS = new Map<string, { interactive: string; trail: string }>([
  [
    'Music',
    {
      interactive:
        'hover:text-menu-item-cyan-400 focus:text-menu-item-cyan-400 data-[state=open]:text-menu-item-cyan-400',
      trail: 'text-menu-item-cyan-400',
    },
  ],
  [
    'Label',
    {
      interactive:
        'hover:text-menu-item-pink-400 focus:text-menu-item-pink-400 data-[state=open]:text-menu-item-pink-400',
      trail: 'text-menu-item-pink-400',
    },
  ],
]);

export interface DesktopMenuDrawerProps {
  group: NavMenuGroup;
  /** Current pathname, threaded from the parent so the drawer stays presentational. */
  pathname: string;
}

/**
 * One grouped nav entry: a cutout-type trigger plus its taped-on paper-scrap
 * drawer. Radix NavigationMenu supplies hover/click open, keyboard support and
 * `aria-expanded`; panels render inline (no portal), so the header's overflow
 * clipping lives on the backdrop layer, not on any of the drawer's ancestors.
 * Trigger wears the group color and underlines while a child route is active.
 */
export const DesktopMenuDrawer = ({
  group,
  pathname,
}: DesktopMenuDrawerProps): React.ReactElement => {
  const isTrailActive = group.items.some((item) => isActiveHref(item.href, pathname));
  const triggerColor = TRIGGER_COLOR_CLASS.get(group.label);

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger
        className={cn(
          'h-auto w-auto bg-transparent p-0 text-2xl font-normal text-zinc-50 underline-offset-8',
          'hover:bg-transparent hover:underline focus:bg-transparent',
          'data-[state=open]:bg-transparent data-[state=open]:underline data-[state=open]:hover:bg-transparent data-[state=open]:focus:bg-transparent',
          // Color tracks hover, keyboard focus, and open — a plain `focus:` white
          // override here would beat the hover color once a click or Tab focuses
          // the trigger (Radix keeps it focused), snapping the label back to
          // white. The underline follows the text via currentColor, so the two
          // always match.
          triggerColor?.interactive,
          isTrailActive && cn('underline', triggerColor?.trail)
        )}
      >
        {group.label}
      </NavigationMenuTrigger>
      <NavigationMenuContent
        className={cn(
          // `top-full mt-3` hangs the scrap from the masthead's bottom edge —
          // shadcn's own positioning is gated behind the `group/navigation-menu`
          // marker the Root omits, leaving base `top-0` to cover the trigger.
          'bg-menu-item-tan-100 shadow-zine-sm top-full mt-3 w-56 overflow-visible border-2 border-black p-0 pt-3 md:w-56',
          DRAWER_ACCENT_CLASS.get(group.label)
        )}
      >
        {/* Tape chip — same gesture as ZinePanel's. */}
        <span
          aria-hidden="true"
          className="bg-menu-item-yellow-200/85 absolute -top-3 left-1/2 z-20 h-6 w-24 -translate-x-1/2 -rotate-2 border border-black/25 shadow-[1px_1px_0_0_rgba(0,0,0,0.2)]"
        />
        <ul className="flex flex-col">
          {group.items.map((item) => {
            const isActive = isActiveHref(item.href, pathname);
            return (
              <li
                key={item.name}
                className="border-b-2 border-dashed border-black/15 last:border-b-0"
              >
                <NavigationMenuLink
                  asChild
                  className="font-fake-four-cutout hover:text-menu-item-tan-100 focus:text-menu-item-tan-100 block px-4 py-2 text-[22px] text-zinc-950 underline-offset-4 hover:bg-zinc-950 focus:bg-zinc-950 aria-[current=page]:underline"
                >
                  {/* Classes live on NavigationMenuLink so its cn() tailwind-merges
                      them over the shadcn defaults (Slot would only concatenate).
                      Drawer links are ink-on-paper by design (no per-item palette
                      colors inside the drawer); active child is underlined in ink. */}
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    unstable_dynamicOnHover
                  >
                    {item.name}
                  </Link>
                </NavigationMenuLink>
              </li>
            );
          })}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
};
