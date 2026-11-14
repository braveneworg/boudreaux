/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DataError, isDataErrorWithCode } from './errors';

/**
 * A data error as it arrives from another copy of this module: the same
 * name and code, and not an instance of the class this copy holds.
 */
const fromAnotherCopy = (code: string): Error =>
  Object.assign(new Error('Unique constraint failed'), { name: 'DataError', code });

describe('isDataErrorWithCode', () => {
  it('knows a data error with the code', () => {
    expect(isDataErrorWithCode(new DataError('DUPLICATE', 'taken'), 'DUPLICATE')).toBe(true);
  });

  it('knows one raised by another copy of the class, by its name and code', () => {
    const error = fromAnotherCopy('DUPLICATE');

    expect(error).not.toBeInstanceOf(DataError);
    expect(isDataErrorWithCode(error, 'DUPLICATE')).toBe(true);
  });

  it('is false for a data error with another code', () => {
    expect(isDataErrorWithCode(new DataError('UNAVAILABLE', 'down'), 'DUPLICATE')).toBe(false);
  });

  it('is false for another kind of error that happens to carry the code', () => {
    const error = Object.assign(new Error('not ours'), { code: 'DUPLICATE' });

    expect(isDataErrorWithCode(error, 'DUPLICATE')).toBe(false);
  });

  it('is false for an error named like one that carries no code', () => {
    const error = Object.assign(new Error('no code'), { name: 'DataError' });

    expect(isDataErrorWithCode(error, 'DUPLICATE')).toBe(false);
  });

  it.each([null, undefined, 'DUPLICATE', { name: 'DataError', code: 'DUPLICATE' }])(
    'is false for a thrown value that is not an error (%j)',
    (thrown) => {
      expect(isDataErrorWithCode(thrown, 'DUPLICATE')).toBe(false);
    }
  );
});
