/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Vendor-neutral data-access error model.
 *
 * The repository layer is the only place that touches Prisma; it translates
 * Prisma's error taxonomy (`PrismaClientKnownRequestError` codes,
 * `PrismaClientInitializationError`, …) into a {@link DataError} carrying a
 * stable, Prisma-free {@link DataErrorCode}. Services catch `DataError` and map
 * the code to a user-facing message — they never see a Prisma type.
 *
 * This module imports nothing from Prisma so every layer above the repository
 * can depend on it.
 */
export type DataErrorCode =
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'VALIDATION'
  | 'TIMEOUT'
  | 'UNKNOWN';

/** A data-access failure with a stable, vendor-neutral {@link DataErrorCode}. */
export class DataError extends Error {
  constructor(
    public readonly code: DataErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'DataError';
  }
}
