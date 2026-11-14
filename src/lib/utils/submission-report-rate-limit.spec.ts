/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { resetRedisFallbackForTesting } from './redis-fallback';
import {
  allowSubmissionReportNotice,
  checkSubmissionReportRateLimit,
  REPORT_NOTICES_PER_SUBMISSION,
  REPORTS_PER_REPORTER,
  REPORTS_PER_REPORTER_PER_SUBMISSION,
  resetSubmissionReportRateLimitForTesting,
  SUBMISSION_REPORT_WINDOW_MS,
} from './submission-report-rate-limit';

vi.mock('server-only', () => ({}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { redis: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));

interface LimiterStub {
  limit: ReturnType<typeof vi.fn>;
}

const pairLimit = vi.fn();
const reporterLimit = vi.fn();
const noticeLimit = vi.fn();
const built: string[] = [];

const limitFor = (prefix: string): ReturnType<typeof vi.fn> => {
  if (prefix.endsWith(':pair')) {
    return pairLimit;
  }

  return prefix.endsWith(':reporter') ? reporterLimit : noticeLimit;
};

vi.mock('@upstash/ratelimit', () => {
  function Ctor(this: LimiterStub, { prefix }: { prefix: string }) {
    built.push(prefix);
    this.limit = limitFor(prefix);
  }
  const fn = vi.fn(Ctor) as unknown as {
    (this: LimiterStub, opts: { prefix: string }): void;
    slidingWindow: ReturnType<typeof vi.fn>;
  };
  fn.slidingWindow = vi.fn(() => 'sliding-window');
  return { Ratelimit: fn };
});

const REPORTER = 'user:r1';
const SUBMISSION = 'a'.repeat(24);

const allowed = (): { success: true; reset: number } => ({
  success: true,
  reset: Date.now() + 1000,
});
const denied = (): { success: false; reset: number } => ({
  success: false,
  reset: Date.now() + 60_000,
});

beforeEach(() => {
  resetSubmissionReportRateLimitForTesting();
  resetRedisFallbackForTesting();
  pairLimit.mockReset();
  reporterLimit.mockReset();
  noticeLimit.mockReset();
  built.length = 0;
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
  vi.stubEnv('E2E_MODE', '');
});

afterEach(() => {
  resetSubmissionReportRateLimitForTesting();
});

describe('the limits', () => {
  it('lets one reporter report one submission once a day', () => {
    expect(REPORTS_PER_REPORTER_PER_SUBMISSION).toBe(1);
  });

  it('lets one reporter file five reports a day', () => {
    expect(REPORTS_PER_REPORTER).toBe(5);
  });

  it('sends three notices about one submission a day', () => {
    expect(REPORT_NOTICES_PER_SUBMISSION).toBe(3);
  });

  it('counts a day as 24 hours', () => {
    expect(SUBMISSION_REPORT_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('checkSubmissionReportRateLimit', () => {
  it('allows a report both limits allow', async () => {
    pairLimit.mockResolvedValueOnce(allowed());
    reporterLimit.mockResolvedValueOnce(allowed());

    const result = await checkSubmissionReportRateLimit({
      reporterKey: REPORTER,
      submissionId: SUBMISSION,
    });

    expect(result).toEqual({ success: true, blockedBy: null });
  });

  it('keys the per-submission limit by the reporter and the submission', async () => {
    pairLimit.mockResolvedValueOnce(allowed());
    reporterLimit.mockResolvedValueOnce(allowed());

    await checkSubmissionReportRateLimit({ reporterKey: REPORTER, submissionId: SUBMISSION });

    expect(pairLimit.mock.calls).toEqual([[`${REPORTER}:${SUBMISSION}`]]);
  });

  it('keys the overall limit by the reporter alone', async () => {
    pairLimit.mockResolvedValueOnce(allowed());
    reporterLimit.mockResolvedValueOnce(allowed());

    await checkSubmissionReportRateLimit({ reporterKey: REPORTER, submissionId: SUBMISSION });

    expect(reporterLimit.mock.calls).toEqual([[REPORTER]]);
  });

  it('names the submission limit when the reporter already reported it', async () => {
    pairLimit.mockResolvedValueOnce(denied());

    const result = await checkSubmissionReportRateLimit({
      reporterKey: REPORTER,
      submissionId: SUBMISSION,
    });

    expect(result).toEqual({ success: false, blockedBy: 'submission' });
  });

  it('does not spend the overall limit on a report the submission limit refused', async () => {
    pairLimit.mockResolvedValueOnce(denied());

    await checkSubmissionReportRateLimit({ reporterKey: REPORTER, submissionId: SUBMISSION });

    expect(reporterLimit).not.toHaveBeenCalled();
  });

  it('names the reporter limit when they have filed too many today', async () => {
    pairLimit.mockResolvedValueOnce(allowed());
    reporterLimit.mockResolvedValueOnce(denied());

    const result = await checkSubmissionReportRateLimit({
      reporterKey: REPORTER,
      submissionId: SUBMISSION,
    });

    expect(result).toEqual({ success: false, blockedBy: 'reporter' });
  });

  it('builds each limiter once, however many reports are checked', async () => {
    pairLimit.mockResolvedValueOnce(allowed()).mockResolvedValueOnce(allowed());
    reporterLimit.mockResolvedValueOnce(allowed()).mockResolvedValueOnce(allowed());

    await checkSubmissionReportRateLimit({ reporterKey: REPORTER, submissionId: SUBMISSION });
    await checkSubmissionReportRateLimit({ reporterKey: 'user:r2', submissionId: SUBMISSION });

    expect(built).toEqual(['submission-report:pair', 'submission-report:reporter']);
  });

  it('allows every report under E2E without asking Redis', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const result = await checkSubmissionReportRateLimit({
      reporterKey: REPORTER,
      submissionId: SUBMISSION,
    });

    expect(result).toEqual({ success: true, blockedBy: null });
    expect(pairLimit).not.toHaveBeenCalled();
  });

  describe('when Upstash is unavailable', () => {
    it('still allows a first report', async () => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');

      const result = await checkSubmissionReportRateLimit({
        reporterKey: REPORTER,
        submissionId: SUBMISSION,
      });

      expect(result.success).toBe(true);
    });

    it('still refuses a second report on the same submission', async () => {
      pairLimit.mockRejectedValueOnce(new Error('down'));
      reporterLimit.mockRejectedValueOnce(new Error('down'));

      await checkSubmissionReportRateLimit({ reporterKey: REPORTER, submissionId: SUBMISSION });
      const second = await checkSubmissionReportRateLimit({
        reporterKey: REPORTER,
        submissionId: SUBMISSION,
      });

      expect(second.blockedBy).toBe('submission');
    });

    it('still refuses a sixth report across submissions', async () => {
      pairLimit.mockRejectedValueOnce(new Error('down'));
      reporterLimit.mockRejectedValueOnce(new Error('down'));

      for (let index = 0; index < REPORTS_PER_REPORTER; index += 1) {
        await checkSubmissionReportRateLimit({
          reporterKey: REPORTER,
          submissionId: `submission-${index}`,
        });
      }
      const sixth = await checkSubmissionReportRateLimit({
        reporterKey: REPORTER,
        submissionId: 'submission-last',
      });

      expect(sixth.blockedBy).toBe('reporter');
    });
  });
});

describe('allowSubmissionReportNotice', () => {
  it('allows a notice the submission has room for', async () => {
    noticeLimit.mockResolvedValueOnce(allowed());

    expect(await allowSubmissionReportNotice(SUBMISSION)).toBe(true);
  });

  it('keys the limit by the submission alone, whoever reported it', async () => {
    noticeLimit.mockResolvedValueOnce(allowed());

    await allowSubmissionReportNotice(SUBMISSION);

    expect(noticeLimit.mock.calls).toEqual([[SUBMISSION]]);
  });

  it('refuses a notice once the submission has had its three', async () => {
    noticeLimit.mockResolvedValueOnce(denied());

    expect(await allowSubmissionReportNotice(SUBMISSION)).toBe(false);
  });

  it('allows every notice under E2E without asking Redis', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    expect(await allowSubmissionReportNotice(SUBMISSION)).toBe(true);
    expect(noticeLimit).not.toHaveBeenCalled();
  });

  it('still stops at three when Upstash is unavailable', async () => {
    noticeLimit.mockRejectedValueOnce(new Error('down'));

    const answers: boolean[] = [];
    for (let index = 0; index <= REPORT_NOTICES_PER_SUBMISSION; index += 1) {
      answers.push(await allowSubmissionReportNotice(SUBMISSION));
    }

    expect(answers).toEqual([true, true, true, false]);
  });
});
