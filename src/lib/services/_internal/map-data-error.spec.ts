/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DataError } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';

import { failFromError } from './map-data-error';

describe('failFromError', () => {
  beforeEach(() => {
    vi.spyOn(loggers.database, 'error').mockImplementation(() => undefined);
  });

  it('returns a failure result', () => {
    expect(failFromError(new DataError('DUPLICATE', 'x')).success).toBe(false);
  });

  it('uses the default message for a known code', () => {
    const result = failFromError(new DataError('NOT_FOUND', 'x'));

    expect(result).toEqual({ success: false, error: 'Resource not found', code: 'NOT_FOUND' });
  });

  it('prefers a caller override for the matching code', () => {
    const result = failFromError(new DataError('DUPLICATE', 'x'), {
      DUPLICATE: 'Artist with this slug already exists',
    });

    expect(result).toEqual({
      success: false,
      error: 'Artist with this slug already exists',
      code: 'DUPLICATE',
    });
  });

  it('ignores overrides for non-matching codes', () => {
    const result = failFromError(new DataError('NOT_FOUND', 'x'), {
      DUPLICATE: 'should not be used',
    });

    expect(result.success === false && result.error).toBe('Resource not found');
  });

  it('maps a non-DataError throw to the UNKNOWN message', () => {
    const result = failFromError(new Error('boom'));

    expect(result).toEqual({ success: false, error: 'Unexpected error', code: 'UNKNOWN' });
  });

  it('applies an UNKNOWN override to a non-DataError throw', () => {
    const result = failFromError(new Error('boom'), { UNKNOWN: 'Failed to create artist' });

    expect(result.success === false && result.error).toBe('Failed to create artist');
  });

  it('falls back to the UNKNOWN override for a TIMEOUT failure', () => {
    const result = failFromError(new DataError('TIMEOUT', 'x'), {
      UNKNOWN: 'Failed to retrieve artist',
    });

    expect(result.success === false && result.error).toBe('Failed to retrieve artist');
  });

  it('falls back to the UNKNOWN override for a VALIDATION failure', () => {
    const result = failFromError(new DataError('VALIDATION', 'x'), {
      UNKNOWN: 'Failed to update artist',
    });

    expect(result.success === false && result.error).toBe('Failed to update artist');
  });

  it('prefers an explicit TIMEOUT override over the UNKNOWN override', () => {
    const result = failFromError(new DataError('TIMEOUT', 'x'), {
      TIMEOUT: 'Took too long',
      UNKNOWN: 'generic',
    });

    expect(result.success === false && result.error).toBe('Took too long');
  });

  it('uses the TIMEOUT default when neither TIMEOUT nor UNKNOWN is overridden', () => {
    expect(failFromError(new DataError('TIMEOUT', 'x'))).toEqual({
      success: false,
      error: 'Request timed out',
      code: 'TIMEOUT',
    });
  });

  it('uses the INVALID_INPUT default for a business-rule input failure', () => {
    expect(failFromError(new DataError('INVALID_INPUT', 'x'))).toEqual({
      success: false,
      error: 'Invalid input',
      code: 'INVALID_INPUT',
    });
  });

  it('uses the LIMIT_EXCEEDED default for a business-rule limit failure', () => {
    expect(failFromError(new DataError('LIMIT_EXCEEDED', 'x'))).toEqual({
      success: false,
      error: 'Limit exceeded',
      code: 'LIMIT_EXCEEDED',
    });
  });

  it('keeps the UNAVAILABLE default and does not fall back to the UNKNOWN override', () => {
    const result = failFromError(new DataError('UNAVAILABLE', 'x'), { UNKNOWN: 'generic' });

    expect(result.success === false && result.error).toBe('Database unavailable');
  });

  it('logs UNAVAILABLE failures', () => {
    failFromError(new DataError('UNAVAILABLE', 'db down'));

    expect(loggers.database.error).toHaveBeenCalled();
  });

  it('does not log a routine NOT_FOUND failure', () => {
    failFromError(new DataError('NOT_FOUND', 'missing'));

    expect(loggers.database.error).not.toHaveBeenCalled();
  });

  describe('code propagation', () => {
    it('carries the originating DataError code', () => {
      const result = failFromError(new DataError('NOT_FOUND', 'x'));

      expect(result.code).toBe('NOT_FOUND');
    });

    it('carries UNKNOWN for a throw that is not a DataError', () => {
      const result = failFromError(new Error('boom'));

      expect(result.code).toBe('UNKNOWN');
    });

    /**
     * The regression this whole seam exists to prevent: overriding the copy
     * must not change the code, or callers mapping code → HTTP status silently
     * lose the ability to distinguish an outage from a generic failure.
     */
    it('carries the real code even when the caller overrides the message', () => {
      const result = failFromError(new DataError('UNAVAILABLE', 'x'), {
        UNAVAILABLE: 'Database connection failed',
      });

      expect(result.code).toBe('UNAVAILABLE');
    });

    it('keeps the overridden message alongside the unchanged code', () => {
      const result = failFromError(new DataError('UNAVAILABLE', 'x'), {
        UNAVAILABLE: 'Database connection failed',
      });

      expect(result.error).toBe('Database connection failed');
    });

    it('carries the specific code when a generic fallback supplies the message', () => {
      const result = failFromError(new DataError('TIMEOUT', 'x'), { UNKNOWN: 'Failed to fetch' });

      expect(result.code).toBe('TIMEOUT');
    });
  });
});
