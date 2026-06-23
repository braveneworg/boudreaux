/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DataError, type DataErrorCode } from '@/lib/types/domain/errors';
import { loggers } from '@/lib/utils/logger';

/** Default user-facing message per data-error code. */
const DEFAULT_MESSAGE = new Map<DataErrorCode, string>([
  ['DUPLICATE', 'Resource already exists'],
  ['NOT_FOUND', 'Resource not found'],
  ['UNAVAILABLE', 'Database unavailable'],
  ['VALIDATION', 'Invalid request'],
  ['TIMEOUT', 'Request timed out'],
  ['UNKNOWN', 'Unexpected error'],
]);

/** Codes that signal an infrastructure/unexpected fault worth logging. */
const LOGGED_CODES: ReadonlySet<DataErrorCode> = new Set(['UNAVAILABLE', 'UNKNOWN']);

/**
 * "Non-specific" codes that, when not given their own override, fall back to the
 * caller's `UNKNOWN` override. Services historically funneled timeout/validation/
 * unexpected failures into one generic per-method message; this preserves that
 * while still letting `DUPLICATE`/`NOT_FOUND`/`UNAVAILABLE` keep their own copy.
 */
const GENERIC_CODES: ReadonlySet<DataErrorCode> = new Set(['TIMEOUT', 'VALIDATION', 'UNKNOWN']);

/**
 * Translate a thrown error into a `ServiceResponse` failure. Repositories throw
 * a {@link DataError} with a vendor-neutral code; this maps that code to a
 * user-facing message, letting callers override individual codes for
 * domain-specific wording (e.g. `DUPLICATE: 'Artist with this slug already
 * exists'`). Anything that is not a `DataError` is treated as `UNKNOWN`.
 *
 * Infrastructure faults (`UNAVAILABLE`, `UNKNOWN`) are logged; routine outcomes
 * like `NOT_FOUND` are not.
 */
export const failFromError = (
  error: unknown,
  overrides?: Partial<Record<DataErrorCode, string>>
): { success: false; error: string } => {
  const code: DataErrorCode = error instanceof DataError ? error.code : 'UNKNOWN';

  if (LOGGED_CODES.has(code)) {
    loggers.database.error(error instanceof DataError ? error.message : 'Unexpected error', error);
  }

  const overrideMap = new Map<string, string>(Object.entries(overrides ?? {}));
  const genericFallback = GENERIC_CODES.has(code) ? overrideMap.get('UNKNOWN') : undefined;
  return {
    success: false,
    error:
      overrideMap.get(code) ?? genericFallback ?? DEFAULT_MESSAGE.get(code) ?? 'Unexpected error',
  };
};
