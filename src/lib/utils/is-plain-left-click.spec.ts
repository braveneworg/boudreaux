/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isPlainLeftClick } from './is-plain-left-click';

const click = (init: Partial<MouseEventInit> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...init,
});

describe('isPlainLeftClick', () => {
  it('is true for a left click with no modifier', () => {
    expect(isPlainLeftClick(click())).toBe(true);
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)(
    'is false with %s held: the browser opens the link elsewhere',
    (key) => {
      expect(isPlainLeftClick(click({ [key]: true }))).toBe(false);
    }
  );

  it('is false for a middle click', () => {
    expect(isPlainLeftClick(click({ button: 1 }))).toBe(false);
  });
});
