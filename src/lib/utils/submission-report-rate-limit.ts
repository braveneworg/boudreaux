/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';

import { limitWithFallback } from './redis-fallback';
import { getRedisClient } from './upstash-redis';

/**
 * The limits on submission reports (ADR-0028). A report needs no account, so
 * these and Turnstile are all that stands between the control and a flood.
 * Each is a rolling 24 hours.
 *
 * The reporter's key lives here for that window and nowhere else: nothing
 * about who filed a report is stored with it.
 */

/** One reporter may report one submission this many times: once is the whole message. */
export const REPORTS_PER_REPORTER_PER_SUBMISSION = 1;

/** One reporter may file this many reports across all submissions. */
export const REPORTS_PER_REPORTER = 5;

/**
 * Approvers are told about one submission this many times. Past it a report
 * is still stored and shown to them; it only stops emailing and texting, so
 * reporters arriving from many addresses cannot make every approver's phone
 * buzz without end.
 */
export const REPORT_NOTICES_PER_SUBMISSION = 3;

const WINDOW = '24 h' as const;

/** The window in milliseconds, for the in-memory fallback limiter. */
export const SUBMISSION_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface Tier {
  /** Names the limiter in Redis, in the fallback cache and in its warning. */
  name: string;
  limit: number;
}

const PAIR: Tier = { name: 'submission-report:pair', limit: REPORTS_PER_REPORTER_PER_SUBMISSION };
const REPORTER: Tier = { name: 'submission-report:reporter', limit: REPORTS_PER_REPORTER };
const NOTICE: Tier = { name: 'submission-report:notice', limit: REPORT_NOTICES_PER_SUBMISSION };

const limiters = new Map<string, Ratelimit>();

/** The Upstash limiter for a tier, built on first use. Throws when Upstash is not configured. */
const limiterFor = ({ name, limit }: Tier): Ratelimit => {
  const cached = limiters.get(name);
  if (cached) {
    return cached;
  }

  const limiter = new Ratelimit({
    redis: getRedisClient(),
    limiter: Ratelimit.slidingWindow(limit, WINDOW),
    analytics: false,
    prefix: name,
  });
  limiters.set(name, limiter);

  return limiter;
};

/**
 * Spend one of a tier's allowance for `key` and say whether there was one to
 * spend. Fails open on an Upstash outage: the tier is then held by a
 * per-process window ({@link limitWithFallback}), so reporting is never
 * blocked by a dependency being down.
 */
const spend = async (tier: Tier, key: string): Promise<boolean> => {
  const { success } = await limitWithFallback({
    name: tier.name,
    getLimiter: () => limiterFor(tier),
    key,
    limit: tier.limit,
    windowMs: SUBMISSION_REPORT_WINDOW_MS,
  });

  return success;
};

/** Deterministic Playwright runs must not trip production-grade limits. */
const isE2E = (): boolean => process.env.E2E_MODE === 'true';

/** Which limit refused a report: this submission's, or the reporter's for the day. */
export type SubmissionReportLimit = 'submission' | 'reporter';

export interface SubmissionReportRateLimitResult {
  /** True when both limits allow the report. */
  success: boolean;
  /** The limit that refused it; `null` when {@link success} is true. */
  blockedBy: SubmissionReportLimit | null;
}

/**
 * Whether a reporter may file a report on a submission now. The
 * per-submission limit is asked first, so a repeat of the same report is
 * refused without spending the reporter's allowance for the day.
 *
 * @param params.reporterKey - The signed-in account, else the visitor
 *   fingerprint hash. Never stored outside the limiter.
 */
export const checkSubmissionReportRateLimit = async ({
  reporterKey,
  submissionId,
}: {
  reporterKey: string;
  submissionId: string;
}): Promise<SubmissionReportRateLimitResult> => {
  if (isE2E()) {
    return { success: true, blockedBy: null };
  }

  if (!(await spend(PAIR, `${reporterKey}:${submissionId}`))) {
    return { success: false, blockedBy: 'submission' };
  }

  if (!(await spend(REPORTER, reporterKey))) {
    return { success: false, blockedBy: 'reporter' };
  }

  return { success: true, blockedBy: null };
};

/**
 * Whether approvers may be told about one more report on a submission, and
 * if so, count it. Keyed by the submission alone: it is what bounds the
 * notices when the reports come from many reporters.
 */
export const allowSubmissionReportNotice = async (submissionId: string): Promise<boolean> =>
  isE2E() || spend(NOTICE, submissionId);

/** Drop the limiter singletons. Testing aid only. */
export const resetSubmissionReportRateLimitForTesting = (): void => {
  limiters.clear();
};
