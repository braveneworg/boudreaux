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
 * the code to a user-facing message — they never see a Prisma type. Services
 * also raise `DataError`s of their own for business-rule failures
 * (`INVALID_INPUT`, `LIMIT_EXCEEDED`, ownership `NOT_FOUND`), sharing the same
 * vendor-neutral taxonomy.
 *
 * This module imports nothing from Prisma so every layer above the repository
 * can depend on it.
 */
export type DataErrorCode =
  | 'DUPLICATE'
  | 'INVALID_INPUT'
  | 'LIMIT_EXCEEDED'
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

/**
 * A write refused because an admin's decisions do not cover the credits
 * awaiting confirmation (ADR-0015). Raised inside the write's transaction, so
 * nothing it would have written is kept. Its message names the artists that
 * need a decision and is shown as written, unlike a database's own
 * `VALIDATION` message.
 */
export class CreditDecisionError extends DataError {
  constructor(message: string) {
    super('VALIDATION', message);
    this.name = 'CreditDecisionError';
  }
}
