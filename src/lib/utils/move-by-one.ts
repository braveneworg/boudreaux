/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A copy of `items` with the item at `index` moved one step in `direction`,
 * or `null` when it is already at that edge. The input is never mutated.
 * Shared by the ordered editors (display images, artist links).
 */
export const moveByOne = <T>(items: readonly T[], index: number, direction: -1 | 1): T[] | null => {
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
};
