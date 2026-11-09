/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Prisma's code for a transaction that lost a write conflict and may be retried. */
const WRITE_CONFLICT_CODE = 'P2034';

/** The string `code` of an error-like value, if it has one. */
const codeOf = (value: unknown): string | undefined =>
  typeof value === 'object' &&
  value !== null &&
  'code' in value &&
  typeof (value as { code?: unknown }).code === 'string'
    ? (value as { code: string }).code
    : undefined;

/**
 * Whether a thrown value is a lost write conflict. The data-error extension
 * and `runQuery` wrap Prisma's error in a `DataError` (code `UNKNOWN`), so the
 * Prisma code is looked for along the `cause` chain.
 */
export const isWriteConflict = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    if (codeOf(current) === WRITE_CONFLICT_CODE) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/** How long a loser waits per attempt so far, before it runs again. */
const BACKOFF_MS = 25;

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Run a transaction again when it loses a write conflict. On MongoDB the
 * first transaction to write a document wins and every concurrent one that
 * writes it aborts at once, while the winner may still be running. A loser
 * that ran again at once would only lose to the same winner, so it waits a
 * little longer on each attempt. `attempts` is how many writers may race on
 * one document before the last is refused with the conflict.
 */
export const retryOnWriteConflict = async <T>(
  transaction: () => Promise<T>,
  attempts: number
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await transaction();
    } catch (error) {
      if (attempt >= attempts || !isWriteConflict(error)) {
        throw error;
      }
      await pause(BACKOFF_MS * attempt);
    }
  }
};
