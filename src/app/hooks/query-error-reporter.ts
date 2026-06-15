/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { reportClientError } from '@/utils/report-client-error';

import { ResponseValidationError } from './fetch-and-parse';

/**
 * Global TanStack Query `QueryCache` error handler that reports ONLY
 * response-validation failures (API contract drift) to `/api/client-errors`.
 *
 * Transient and expected query failures — aborts, offline/network errors,
 * non-OK HTTP responses — are intentionally ignored: they are not actionable
 * bugs and would drown out the drift signal (and the endpoint is rate-limited).
 * Only a {@link ResponseValidationError}, thrown when a 2xx body diverges from
 * its schema, is forwarded.
 *
 * @param error - The error thrown by a query's `queryFn`.
 */
export const reportResponseValidationError = (error: unknown): void => {
  if (error instanceof ResponseValidationError) {
    reportClientError(error, 'response-validation');
  }
};
