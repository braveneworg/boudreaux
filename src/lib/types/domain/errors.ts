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
 * Whether a thrown value is a {@link DataError} with this code, told by its
 * name and code and not by `instanceof`.
 *
 * A caught data error is not always an instance of the class the catching
 * module holds. On the dev server the Prisma client is kept on `globalThis`
 * and built once, by whichever route loaded first, so the errors its
 * extension raises come from that route's copy of this module. To a
 * repository compiled into another route they are a `DataError` in every
 * field and still fail `instanceof`
 * (`docs/lessons/prisma-mongo/a-data-error-is-told-by-its-name.md`). A catch
 * that decides something on a code, such as "a duplicate is not a failure",
 * asks here.
 */
export const isDataErrorWithCode = (error: unknown, code: DataErrorCode): boolean =>
  error instanceof Error && error.name === 'DataError' && 'code' in error && error.code === code;

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
