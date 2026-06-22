/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { DataError, type DataErrorCode } from '@/lib/types/domain/errors';

/**
 * Maps a Prisma known-request error code to a vendor-neutral
 * {@link DataErrorCode}. Codes not listed here fall through to `UNKNOWN`. A Map
 * (not an index-signature object) keeps lookups free of dynamic-key access.
 */
const KNOWN_REQUEST_CODE = new Map<string, DataErrorCode>([
  ['P2002', 'DUPLICATE'], // unique constraint violation
  ['P2025', 'NOT_FOUND'], // record required but not found
  ['P2023', 'VALIDATION'], // malformed identifier / inconsistent column data
]);

/** Reads the string `code` field off an error-like value, if present. */
const errorCode = (error: unknown): string | undefined =>
  error instanceof Error &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined;

/** Narrowly detects a connection-timeout error without depending on Prisma. */
const isTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  ('code' in error && (error as { code?: unknown }).code === 'ETIMEOUT'
    ? true
    : error.message.includes('ETIMEOUT'));

/**
 * Translate any thrown value from a Prisma call into a {@link DataError} with a
 * stable, Prisma-free code. This is the single place in the codebase that
 * inspects Prisma's error taxonomy, so the layers above the repository never
 * need to import Prisma to interpret failures.
 */
export const toDataError = (error: unknown): DataError => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return new DataError(KNOWN_REQUEST_CODE.get(error.code) ?? 'UNKNOWN', error.message, error);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new DataError('UNAVAILABLE', error.message, error);
  }

  // Duck-typed fallback: under Turbopack, Prisma can be bundled into separate
  // module contexts, so `instanceof PrismaClientKnownRequestError` may be false
  // for a genuine Prisma error. Map a recognized string `code` directly.
  const code = errorCode(error);
  const mapped = code !== undefined ? KNOWN_REQUEST_CODE.get(code) : undefined;
  if (mapped) {
    return new DataError(mapped, error instanceof Error ? error.message : 'Database error', error);
  }

  if (isTimeout(error)) {
    return new DataError('TIMEOUT', 'Database timed out', error);
  }

  const message = error instanceof Error ? error.message : 'Unexpected database error';
  return new DataError('UNKNOWN', message, error);
};

/**
 * Runs a repository query, translating any Prisma failure into a
 * {@link DataError} before it escapes the repository layer. Repositories wrap
 * every Prisma call in this so callers only ever catch domain errors.
 */
export const runQuery = async <T>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    throw toDataError(error);
  }
};
