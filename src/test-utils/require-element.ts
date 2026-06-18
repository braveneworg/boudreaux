/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Asserts that a queried DOM element exists and narrows away `null`.
 *
 * DOM queries like `querySelector` / `closest` return `Element | null`, which forces
 * callers into non-null assertions (`el!`) when passing the result to `fireEvent`.
 * This helper throws a descriptive error instead, keeping tests free of `!`.
 *
 * @param element - the possibly-null element returned by a DOM query
 * @param message - optional description used in the thrown error
 * @returns the same element, narrowed to non-null
 */
export const requireElement = <T extends Element>(
  element: T | null,
  message = 'expected element to exist in the DOM'
): T => {
  if (!element) {
    throw new Error(message);
  }

  return element;
};
