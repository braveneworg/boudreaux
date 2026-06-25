/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DataError } from '@/lib/types/domain/errors';
import { isTimeoutDataError } from '@/lib/utils/data-error-helpers';

describe('isTimeoutDataError', () => {
  it('is true for a DataError with the TIMEOUT code', () => {
    expect(isTimeoutDataError(new DataError('TIMEOUT', 'gone'))).toBe(true);
  });

  it('is true when the message mentions ETIMEOUT regardless of code', () => {
    expect(isTimeoutDataError(new DataError('UNKNOWN', 'socket ETIMEOUT'))).toBe(true);
  });

  it('is true when the message contains "timeout"', () => {
    expect(isTimeoutDataError(new DataError('UNKNOWN', 'connection timeout'))).toBe(true);
  });

  it('is true when the message contains "timed out"', () => {
    expect(isTimeoutDataError(new DataError('UNKNOWN', 'request timed out'))).toBe(true);
  });

  it('is false for a non-timeout DataError', () => {
    expect(isTimeoutDataError(new DataError('DUPLICATE', 'already exists'))).toBe(false);
  });

  it('is false for a plain Error even when the message mentions timeout', () => {
    expect(isTimeoutDataError(new Error('timeout'))).toBe(false);
  });

  it('is false for a non-error value', () => {
    expect(isTimeoutDataError('timeout')).toBe(false);
  });
});
