/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DataError } from '@/lib/types/domain/errors';

/**
 * True when `error` is a {@link DataError} that represents a database timeout —
 * either the explicit `TIMEOUT` code or a timeout-shaped message that surfaced
 * under a different code. Mirrors the inline check several form actions use to
 * set `formState.hasTimeout`.
 */
export const isTimeoutDataError = (error: unknown): boolean =>
  error instanceof DataError &&
  (error.code === 'TIMEOUT' ||
    error.message.includes('ETIMEOUT') ||
    error.message.includes('timeout') ||
    error.message.includes('timed out'));
