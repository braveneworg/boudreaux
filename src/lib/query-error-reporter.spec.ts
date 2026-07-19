/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ResponseValidationError } from '@/utils/fetch-and-parse';

import { reportResponseValidationError } from './query-error-reporter';

const reportClientError = vi.hoisted(() => vi.fn());

vi.mock('@/utils/report-client-error', () => ({ reportClientError }));

describe('reportResponseValidationError', () => {
  it('reports a ResponseValidationError with the response-validation boundary', () => {
    const error = new ResponseValidationError('/api/thing', '✖ expected string at id');

    reportResponseValidationError(error);

    expect(reportClientError).toHaveBeenCalledWith(error, 'response-validation');
  });

  it('ignores a generic error (e.g. network failure)', () => {
    reportResponseValidationError(new Error('Failed to fetch'));

    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('ignores an aborted request error', () => {
    reportResponseValidationError(new DOMException('Aborted', 'AbortError'));

    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('ignores a non-error value', () => {
    reportResponseValidationError('not an error');

    expect(reportClientError).not.toHaveBeenCalled();
  });
});
