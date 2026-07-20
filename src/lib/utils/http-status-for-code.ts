/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { DataErrorCode } from '@/lib/types/domain/errors';

/**
 * The single mapping from a vendor-neutral {@link DataErrorCode} to its HTTP
 * status.
 *
 * Route handlers must read the status from here — never by comparing the
 * user-facing `error` copy, which is free to change per call site.
 *
 * Written as an exhaustive `switch` rather than a lookup object on purpose:
 * the `never` assignment in the default arm makes adding a `DataErrorCode`
 * without deciding its status a **compile error**, and it avoids the dynamic
 * property access that a keyed object would require.
 */
export const httpStatusForCode = (code: DataErrorCode): number => {
  switch (code) {
    case 'DUPLICATE':
      return 409;
    case 'INVALID_INPUT':
      return 400;
    case 'VALIDATION':
      return 400;
    case 'LIMIT_EXCEEDED':
      return 429;
    case 'NOT_FOUND':
      return 404;
    case 'UNAVAILABLE':
      return 503;
    case 'TIMEOUT':
      return 504;
    case 'UNKNOWN':
      return 500;
    default: {
      // Unreachable while every DataErrorCode has a case above; if a new code
      // is added this assignment stops compiling.
      const unhandled: never = code;
      return unhandled;
    }
  }
};
