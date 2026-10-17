/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The mouse-event fields that tell a plain click from a modified one. */
interface ClickFields {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * A plain left click, with no modifier: the one a link that opens the
 * listening modal may intercept. Any other click is the browser's (a new tab
 * or window, a download).
 */
export const isPlainLeftClick = ({
  button,
  metaKey,
  ctrlKey,
  shiftKey,
  altKey,
}: ClickFields): boolean => button === 0 && !metaKey && !ctrlKey && !shiftKey && !altKey;
