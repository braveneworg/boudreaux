/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { MouseEvent } from 'react';

import { ArrowDown } from 'lucide-react';

import { ALL_SUBMISSIONS_ID } from '@/lib/community/community-paths';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * "View all user submitted content": the link under the community page's
 * rows that moves to its full list. It is a real fragment link, so it works
 * before the page hydrates. Once hydrated it scrolls there smoothly, or
 * jumps for a visitor who prefers reduced motion, and hands keyboard focus
 * to the list's heading so the next Tab continues from the list.
 */
export const ViewAllLink = () => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    const target = document.getElementById(ALL_SUBMISSIONS_ID);
    if (!target) {
      // Nothing to scroll to: leave the fragment link to the browser.
      return;
    }

    event.preventDefault();
    const prefersReducedMotion = globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  };

  return (
    <a
      href={`#${ALL_SUBMISSIONS_ID}`}
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-950 underline underline-offset-4 hover:no-underline"
    >
      <ArrowDown className="size-4" aria-hidden="true" />
      <span>View all user submitted content</span>
    </a>
  );
};
