/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { DataErrorCode } from '@/lib/types/domain/errors';

import { httpStatusForCode } from './http-status-for-code';

describe('httpStatusForCode', () => {
  it('maps a missing resource to 404', () => {
    expect(httpStatusForCode('NOT_FOUND')).toBe(404);
  });

  it('maps a datastore outage to 503', () => {
    expect(httpStatusForCode('UNAVAILABLE')).toBe(503);
  });

  it('maps a uniqueness conflict to 409', () => {
    expect(httpStatusForCode('DUPLICATE')).toBe(409);
  });

  it('maps rejected input to 400', () => {
    expect(httpStatusForCode('INVALID_INPUT')).toBe(400);
  });

  it('maps a schema validation failure to 400', () => {
    expect(httpStatusForCode('VALIDATION')).toBe(400);
  });

  it('maps an exceeded limit to 429', () => {
    expect(httpStatusForCode('LIMIT_EXCEEDED')).toBe(429);
  });

  it('maps a timeout to 504', () => {
    expect(httpStatusForCode('TIMEOUT')).toBe(504);
  });

  it('maps an unclassified failure to 500', () => {
    expect(httpStatusForCode('UNKNOWN')).toBe(500);
  });

  /**
   * Guards the property the seam exists for: every code resolves to a real
   * status. The lookup is exhaustive by construction, so a newly added
   * `DataErrorCode` is a compile error rather than a silent 500 — this asserts
   * the runtime half of that.
   */
  it('resolves every DataErrorCode to a 4xx or 5xx status', () => {
    const codes: DataErrorCode[] = [
      'DUPLICATE',
      'INVALID_INPUT',
      'LIMIT_EXCEEDED',
      'NOT_FOUND',
      'UNAVAILABLE',
      'VALIDATION',
      'TIMEOUT',
      'UNKNOWN',
    ];

    const statuses = codes.map(httpStatusForCode);

    expect(statuses.every((status) => status >= 400 && status < 600)).toBe(true);
  });

  it('does not collapse distinct failure classes onto one status', () => {
    const distinct = new Set(
      (['NOT_FOUND', 'UNAVAILABLE', 'DUPLICATE', 'LIMIT_EXCEEDED', 'TIMEOUT'] as const).map(
        httpStatusForCode
      )
    );

    expect(distinct.size).toBe(5);
  });
});
