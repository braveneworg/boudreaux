/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { auth } from '@/auth';
import { DataError } from '@/lib/types/domain/errors';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import type { PlaylistActionResult } from '@/lib/types/domain/playlist';
import { loggers } from '@/lib/utils/logger';
import { fieldErrorsFromZodIssues } from '@/lib/utils/zod-field-errors';

/**
 * Shared plumbing for the playlist Server Actions (auth gate + failure-shape
 * mapping). Lives outside the `'use server'` modules because those may only
 * export async functions — sync helpers and constants must be imported from a
 * plain server-only module.
 */

const logger = loggers.media;

const UNAUTHORIZED_MESSAGE = 'Unauthorized';
const INVALID_INPUT_MESSAGE = 'Invalid input';
const DUPLICATE_TITLE_MESSAGE = 'A playlist with this title already exists';

/** The path every successful playlist mutation revalidates. */
export const PLAYLISTS_PATH = '/playlists';

/** Zod issues as accepted by {@link fieldErrorsFromZodIssues}. */
type ZodIssues = Parameters<typeof fieldErrorsFromZodIssues>[0];

/**
 * DataError codes whose service-authored messages are user-facing and safe to
 * surface verbatim ('Playlist not found', item-limit text, cover-image rules).
 */
const USER_FACING_CODES: ReadonlySet<DataErrorCode> = new Set([
  'NOT_FOUND',
  'INVALID_INPUT',
  'LIMIT_EXCEEDED',
]);

/**
 * Resolve the signed-in session user's id, or null when there is no session,
 * the session has no user id, or the account is banned (defense-in-depth on
 * top of the better-auth ban enforcement).
 */
export const getAuthorizedUserId = async (): Promise<string | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || user.banned) return null;
  return user.id;
};

export const unauthorizedFailure = (): PlaylistActionResult<never> => ({
  success: false,
  error: UNAUTHORIZED_MESSAGE,
});

/** Map a failed Zod parse into the field-errors failure shape. */
export const invalidInputFailure = (issues: ZodIssues): PlaylistActionResult<never> => ({
  success: false,
  error: INVALID_INPUT_MESSAGE,
  fieldErrors: fieldErrorsFromZodIssues(issues, { formKey: '_form' }),
});

/**
 * Map a thrown error to the action failure shape: the unique-title violation
 * (`DataError` code `DUPLICATE` from `@@unique([ownerId, title])`) becomes the
 * friendly message plus a `title` field error; other user-facing `DataError`
 * codes pass their message through; everything else collapses to `fallback`
 * so internals never reach the client.
 */
export const failureFromError = (error: unknown, fallback: string): PlaylistActionResult<never> => {
  if (error instanceof DataError) {
    if (error.code === 'DUPLICATE') {
      return {
        success: false,
        error: DUPLICATE_TITLE_MESSAGE,
        fieldErrors: { title: [DUPLICATE_TITLE_MESSAGE] },
      };
    }
    if (USER_FACING_CODES.has(error.code)) {
      return { success: false, error: error.message };
    }
  }
  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });
  return { success: false, error: fallback };
};
