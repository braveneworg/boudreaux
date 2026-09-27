/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formBoolean } from './form-boolean';

describe('formBoolean', () => {
  it.each([
    [true, true],
    [false, false],
    ['true', true],
    ['on', true],
    ['false', false],
    ['off', false],
  ])('parses %j as %j', (input, expected) => {
    expect(formBoolean().parse(input)).toBe(expected);
  });

  it.each(['', 'yes', 'no', 'TRUE', '1', '0', 1, 0, null, undefined, {}, []])(
    'rejects %j',
    (input) => {
      expect(formBoolean().safeParse(input).success).toBe(false);
    }
  );

  it('reports the given message when the value is not a boolean', () => {
    const result = formBoolean({ message: 'Pick one' }).safeParse('maybe');

    expect(result.error?.issues.map(({ message }) => message)).toEqual(['Pick one']);
  });
});
