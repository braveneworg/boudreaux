/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { headers } from 'next/headers';

import { mayUseCommunity } from '@/lib/community/community-access';
import { SubmissionRuleError } from '@/lib/services/submission-service';
import { DataError } from '@/lib/types/domain/errors';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import type { SubmissionActionResult } from '@/lib/types/domain/submission';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { loggers } from '@/lib/utils/logger';
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';
import { fieldErrorsFromZodIssues } from '@/lib/utils/zod-field-errors';

/**
 * Shared plumbing for the submission Server Actions. It lives outside the
 * `'use server'` modules because those may only export async functions.
 */

const logger = loggers.media;

/** The paths a submission write may have changed. */
export const COMMUNITY_MINE_PATH = '/community/mine';
export const COMMUNITY_QUEUE_PATH = '/admin/community';
export const COMMUNITY_MANAGERS_PATH = '/admin/community/managers';
export const submissionPath = (id: string): string => `/community/${id}`;

type ZodIssues = Parameters<typeof fieldErrorsFromZodIssues>[0];

/**
 * Codes whose service-authored message is written for the user and may be
 * shown as is: every rule the submission and manager services raise.
 */
const USER_FACING_CODES: ReadonlySet<DataErrorCode> = new Set([
  'NOT_FOUND',
  'INVALID_INPUT',
  'LIMIT_EXCEEDED',
  'VALIDATION',
  'DUPLICATE',
]);

/** Map a failed Zod parse into the field-errors failure shape. */
export const invalidInputFailure = (issues: ZodIssues): SubmissionActionResult<never> => ({
  success: false,
  error: 'Check the highlighted fields and try again.',
  code: 'INVALID_INPUT',
  fieldErrors: fieldErrorsFromZodIssues(issues, { formKey: '_form' }),
});

/**
 * Map a thrown error to the action failure shape. A rule the service raised
 * keeps its code and its message, and lands on its field when it names one.
 * A `DataError` that carries a `cause` came from the repository with a raw
 * database message, so it collapses to `fallback` like anything unexpected
 * and internals never reach the client.
 */
export const failureFromError = (
  error: unknown,
  fallback: string
): SubmissionActionResult<never> => {
  if (
    error instanceof DataError &&
    USER_FACING_CODES.has(error.code) &&
    error.cause === undefined
  ) {
    const field = error instanceof SubmissionRuleError ? error.field : undefined;

    return {
      success: false,
      error: error.message,
      code: error.code,
      ...(field !== undefined && { fieldErrors: { [field]: [error.message] } }),
    };
  }

  logger.error(fallback, { error: error instanceof Error ? error.message : String(error) });

  return {
    success: false,
    error: fallback,
    code: error instanceof DataError ? error.code : 'UNKNOWN',
  };
};

/**
 * The refusal for a role the community feature is not open to yet, or `null`
 * when it is. The same `FORBIDDEN` the action gate answers, so a client cannot
 * tell the feature exists.
 */
export const communityClosedRefusal = (
  role: string | null | undefined
): SubmissionActionResult<never> | null =>
  mayUseCommunity(role) ? null : { success: false, error: 'Unauthorized', code: 'FORBIDDEN' };

/**
 * Verify the form's Turnstile token against the caller's IP. Returns the
 * failure to answer with, placed on the verification field, or `null` when
 * the token passed.
 */
export const turnstileRefusal = async (
  token: string
): Promise<SubmissionActionResult<never> | null> => {
  const ip = extractClientIpFromHeaders(await headers());
  const result = await verifyTurnstile(token, ip);
  if (result.success) {
    return null;
  }

  const message = result.error ?? 'Verification failed. Please refresh and try again.';

  return {
    success: false,
    error: message,
    code: 'INVALID_INPUT',
    fieldErrors: { turnstileToken: [message] },
  };
};
