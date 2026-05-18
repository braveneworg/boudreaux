/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import { AbuseReportRepository } from '@/lib/repositories/abuse-report-repository';
import {
  checkAbuseReportRateLimit,
  type AbuseReportRateLimitTier,
} from '@/lib/utils/abuse-report-rate-limit';

export type SubmitAbuseReportResult =
  | { ok: true }
  | { ok: false; code: 'rate_limited'; tier: AbuseReportRateLimitTier; retryAfterSeconds: number }
  | { ok: false; code: 'self_report' }
  | { ok: false; code: 'unknown_error' };

interface SubmitAbuseReportInput {
  /** Trusted server-side reporter id, sourced from `auth()`. */
  reporterId: string;
  /** Free-form username typed by the reporter. */
  reportedUsername: string;
  /** Server-side request fingerprint hash (see visitor-fingerprint.ts). */
  reporterFingerprint: string | null;
}

/**
 * Submit an abuse report against a username.
 *
 * Designed to be username-enumeration-safe: callers receive `{ ok: true }`
 * whether or not the reported username resolves to a real account, so a
 * malicious user cannot use the report endpoint as a "does this user
 * exist" oracle. Reports against non-existent usernames are silently
 * discarded (logged server-side for admin audit).
 *
 * Rate-limit decisions still surface (so the legitimate reporter sees
 * a friendly "you have already reported this user" message), but only
 * AFTER a real target is resolved so the rate-limit response itself
 * cannot be used as the enumeration oracle either.
 */
export class AbuseReportService {
  static async submit(input: SubmitAbuseReportInput): Promise<SubmitAbuseReportResult> {
    const username = input.reportedUsername.trim();
    if (!username) {
      return { ok: true };
    }

    const reportedUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, email: true },
    });

    if (!reportedUser) {
      // Log for admin audit but tell the caller everything's fine — no
      // enumeration oracle. Caller still sees the "thank you" confirmation.
      console.warn(
        `[AbuseReportService] report against unknown username "${username}" by reporter ${input.reporterId}`
      );
      return { ok: true };
    }

    if (reportedUser.id === input.reporterId) {
      return { ok: false, code: 'self_report' };
    }

    const limit = await checkAbuseReportRateLimit({
      reporterId: input.reporterId,
      reportedUserId: reportedUser.id,
    });
    if (!limit.success && limit.blockedBy) {
      return {
        ok: false,
        code: 'rate_limited',
        tier: limit.blockedBy,
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }

    try {
      await AbuseReportRepository.create({
        reportedUserId: reportedUser.id,
        reporterId: input.reporterId,
        reporterFingerprint: input.reporterFingerprint,
      });
    } catch (error) {
      console.error('[AbuseReportService] failed to persist abuse report', error);
      return { ok: false, code: 'unknown_error' };
    }

    return { ok: true };
  }
}
