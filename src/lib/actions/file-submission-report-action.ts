/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';
// action-gate: public: anyone wronged by a public submission may report it, with or without an account

import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/auth';
import {
  SUBMISSION_REPORT_ATTEMPT_LIMIT,
  submissionReportAttemptLimiter,
} from '@/lib/config/rate-limit-tiers';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
import type { SubmissionActionResult } from '@/lib/types/domain/submission';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';
import { fileSubmissionReportInputSchema } from '@/lib/validation/submission-report-schema';

import {
  failureFromError,
  invalidInputFailure,
  turnstileRefusal,
} from './submission-action-helpers';

const REPORT_FAILED = 'We could not send your report. Please try again.';
const TOO_MANY_ATTEMPTS = 'That is a lot of reports at once. Wait a minute and try again.';

/** What a banned account is answered, as the action gate answers one. */
const BANNED: SubmissionActionResult<never> = {
  success: false,
  error: 'Account suspended',
  code: 'BANNED',
};

/** Who is calling: refused, or let through with their account when they have one. */
type Caller =
  { refusal: SubmissionActionResult<never> } | { refusal: null; userId: string | undefined };

/**
 * The caller of an action that takes no session. A signed-out visitor is a
 * caller like any other; only a banned account is refused.
 */
const identifyCaller = async (): Promise<Caller> => {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;

  return user?.banned === true ? { refusal: BANNED } : { refusal: null, userId: user?.id };
};

/**
 * Who the rate limiter counts this report against: the signed-in account,
 * else the visitor fingerprint hash (user agent, language and the address's
 * network prefix). It is handed to the limiter and never stored (ADR-0028).
 */
const reporterKeyFor = async (userId: string | undefined): Promise<string> => {
  if (userId !== undefined) {
    return `user:${userId}`;
  }

  const requestHeaders = await headers();

  return `guest:${computeFingerprintHash({
    userAgent: requestHeaders.get('user-agent'),
    acceptLanguage: requestHeaders.get('accept-language'),
    ip: extractClientIpFromHeaders(requestHeaders),
  })}`;
};

/**
 * The refusal for an address that is trying too often, or `null`. It counts
 * every attempt, a malformed one included, before anything is verified.
 * Skipped under E2E, as the route limiter is, so a Playwright run from one
 * address is never refused.
 */
const attemptRefusal = async (): Promise<SubmissionActionResult<never> | null> => {
  if (process.env.E2E_MODE === 'true') {
    return null;
  }

  try {
    await submissionReportAttemptLimiter.check(
      SUBMISSION_REPORT_ATTEMPT_LIMIT,
      extractClientIpFromHeaders(await headers())
    );

    return null;
  } catch {
    return { success: false, error: TOO_MANY_ATTEMPTS, code: 'LIMIT_EXCEEDED' };
  }
};

/**
 * File a submission report (ADR-0025, ADR-0028). The one submission action
 * that takes no session: the person wronged may not be a user of the site.
 * What guards it instead, in order: the caller not being banned, a limit on
 * how often one address may try, the wire schema, a Turnstile token, then
 * the service's limits on what one reporter may file.
 *
 * The answer is the same whether or not a report was stored: one filed
 * against anything that is not a public submission is dropped, and the caller
 * is not told.
 */
export const fileSubmissionReportAction = async (
  input: unknown
): Promise<SubmissionActionResult<{ sent: true }>> => {
  const caller = await identifyCaller();
  if (caller.refusal) return caller.refusal;

  const tooMany = await attemptRefusal();
  if (tooMany) return tooMany;

  const parsed = fileSubmissionReportInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  const { turnstileToken, ...report } = parsed.data;
  const unverified = await turnstileRefusal(turnstileToken);
  if (unverified) return unverified;

  try {
    await SubmissionReportService.file(report, await reporterKeyFor(caller.userId));

    return { success: true, data: { sent: true } };
  } catch (error) {
    return failureFromError(error, REPORT_FAILED);
  }
};
