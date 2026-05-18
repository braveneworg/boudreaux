/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { headers } from 'next/headers';

import { auth } from '@/auth';
import { dispatchAbuseReportNotifications } from '@/lib/services/abuse-report-notifications';
import { AbuseReportService } from '@/lib/services/abuse-report-service';
import { extractClientIpFromHeaders } from '@/lib/utils/extract-client-ip';
import { loggers } from '@/lib/utils/logger';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';
import {
  submitAbuseReportSchema,
  type SubmitAbuseReportInput,
} from '@/lib/validation/abuse-report-schema';

const logger = loggers.chat;

export type SubmitAbuseReportActionResult =
  | { success: true }
  | {
      success: false;
      error: 'unauthorized' | 'invalid' | 'rate_limited' | 'self_report' | 'unknown_error';
      retryAfterSeconds?: number;
      fieldErrors?: Record<string, string[]>;
    };

/**
 * Submit an anonymous abuse report against a username.
 *
 * Anonymity guarantee: `reporterId` is sourced exclusively from the
 * server-side auth session, never from client input, and is never
 * returned in this action's response. The reporter's request
 * fingerprint hash is recorded server-side for audit/rate-limit
 * purposes only.
 */
export const submitAbuseReportAction = async (
  input: SubmitAbuseReportInput
): Promise<SubmitAbuseReportActionResult> => {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'unauthorized' };
  }

  const parsed = submitAbuseReportSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { success: false, error: 'invalid', fieldErrors };
  }

  const headerList = await headers();
  const reporterFingerprint = computeFingerprintHash({
    userAgent: headerList.get('user-agent'),
    acceptLanguage: headerList.get('accept-language'),
    ip: extractClientIpFromHeaders(headerList),
  });

  const result = await AbuseReportService.submit({
    reporterId: session.user.id,
    reportedUsername: parsed.data.reportedUsername,
    reporterFingerprint,
  });

  if (!result.ok) {
    if (result.code === 'rate_limited') {
      logger.warn('Abuse report rate-limited', {
        module: 'CHAT',
        operation: 'submitAbuseReport',
        tier: result.tier,
      });
      return {
        success: false,
        error: 'rate_limited',
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    return { success: false, error: result.code };
  }

  // Fan out admin notifications asynchronously; we don't make the
  // reporter wait on email/SMS dispatch, but we DO await it inside the
  // action because Next.js Server Actions don't reliably finish
  // detached promises after returning. Email/SMS failures are logged
  // but never bubble up to the reporter.
  try {
    await dispatchAbuseReportNotifications({ reportedUsername: parsed.data.reportedUsername });
  } catch (error) {
    logger.error('Failed to dispatch abuse-report notifications', {
      module: 'CHAT',
      operation: 'dispatchAbuseReportNotifications',
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  return { success: true };
};
