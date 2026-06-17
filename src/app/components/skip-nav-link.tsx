/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The id of the <main> landmark this link sends focus to. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * Accessibility skip link. Visually hidden until it receives keyboard focus,
 * then it reveals at the top-left and jumps focus straight to the <main>
 * landmark, letting keyboard and screen-reader users bypass the header nav.
 *
 * Rendered as the first focusable element on the page, so it is the first Tab
 * stop on both the mobile and desktop layouts.
 */
export const SkipNavLink = () => (
  <a
    href={`#${MAIN_CONTENT_ID}`}
    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-200 focus:rounded-md focus:bg-zinc-50 focus:px-4 focus:py-2 focus:font-semibold focus:text-zinc-950 focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
  >
    Skip to main content
  </a>
);
