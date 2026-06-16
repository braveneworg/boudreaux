/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  ABUSE_REPORT_GLOBAL_LIMIT,
  ABUSE_REPORT_PAIR_LIMIT,
  checkAbuseReportRateLimit,
  resetAbuseReportRateLimitForTesting,
} from './abuse-report-rate-limit';

vi.mock('server-only', () => ({}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}));

interface LimiterStub {
  limit: ReturnType<typeof vi.fn>;
}

const pairLimit = vi.fn();
const globalLimit = vi.fn();
const buildOrder: string[] = [];

vi.mock('@upstash/ratelimit', () => {
  function Ctor(this: LimiterStub, _opts: { prefix: string }) {
    buildOrder.push(_opts.prefix);
    this.limit = _opts.prefix.includes('pair') ? pairLimit : globalLimit;
  }
  const fn = vi.fn(Ctor) as unknown as {
    (this: LimiterStub, opts: { prefix: string }): void;
    slidingWindow: ReturnType<typeof vi.fn>;
  };
  fn.slidingWindow = vi.fn(() => 'sliding-window');
  return { Ratelimit: fn };
});

describe('abuse-report-rate-limit constants', () => {
  it('caps pair tier at 3 per 24h', () => {
    expect(ABUSE_REPORT_PAIR_LIMIT).toBe(3);
  });

  it('caps global tier at 10 per 24h', () => {
    expect(ABUSE_REPORT_GLOBAL_LIMIT).toBe(10);
  });
});

describe('checkAbuseReportRateLimit', () => {
  beforeEach(() => {
    resetAbuseReportRateLimitForTesting();
    pairLimit.mockReset();
    globalLimit.mockReset();
    buildOrder.length = 0;
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('E2E_MODE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetAbuseReportRateLimitForTesting();
  });

  it('allows through when both tiers pass', async () => {
    pairLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    globalLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });

    const result = await checkAbuseReportRateLimit({
      reporterId: 'r1',
      reportedUserId: 't1',
    });

    expect(result.success).toBe(true);
    expect(result.blockedBy).toBeNull();
  });

  it('uses the composite key for the pair tier', async () => {
    pairLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    globalLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });

    await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't9' });
    expect(pairLimit).toHaveBeenCalledWith('r1:t9');
  });

  it('uses the reporter id alone for the global tier', async () => {
    pairLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    globalLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });

    await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't1' });
    expect(globalLimit).toHaveBeenCalledWith('r1');
  });

  it('returns blockedBy=pair when the pair tier denies', async () => {
    const reset = Date.now() + 60_000;
    pairLimit.mockResolvedValue({ success: false, reset });
    globalLimit.mockResolvedValue({ success: true, reset });

    const result = await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't1' });
    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('pair');
    expect(globalLimit).not.toHaveBeenCalled();
  });

  it('returns blockedBy=global when the pair tier passes but the global denies', async () => {
    const reset = Date.now() + 120_000;
    pairLimit.mockResolvedValue({ success: true, reset });
    globalLimit.mockResolvedValue({ success: false, reset });

    const result = await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't1' });
    expect(result.success).toBe(false);
    expect(result.blockedBy).toBe('global');
  });

  it('reuses cached limiter singletons across calls', async () => {
    pairLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    globalLimit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });

    await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't1' });
    await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't1' });

    // Each limiter constructed exactly once despite two checks — the
    // cached-singleton early return is exercised on the second call.
    expect(buildOrder).toEqual(['abuse-report:pair', 'abuse-report:global']);
  });

  it('short-circuits in E2E mode without calling Redis', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const result = await checkAbuseReportRateLimit({ reporterId: 'r1', reportedUserId: 't1' });
    expect(result.success).toBe(true);
    expect(pairLimit).not.toHaveBeenCalled();
    expect(globalLimit).not.toHaveBeenCalled();
  });
});
