/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { resetDailyAllowancesForTesting } from './daily-allowance';
import { resetRedisFallbackForTesting } from './redis-fallback';
import {
  allowGuestView,
  GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION,
} from './submission-view-allowance';

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

const limit = vi.fn();
const built: Array<{ prefix: string; limiter: unknown }> = [];
const slidingWindow = vi.hoisted(() =>
  vi.fn((tokens: number, window: string) => `${tokens} per ${window}`)
);

vi.mock('@upstash/ratelimit', () => {
  function Ctor(this: LimiterStub, options: { prefix: string; limiter: unknown }) {
    built.push({ prefix: options.prefix, limiter: options.limiter });
    this.limit = limit;
  }
  const fn = vi.fn(Ctor) as unknown as {
    (this: LimiterStub, options: { prefix: string; limiter: unknown }): void;
    slidingWindow: typeof slidingWindow;
  };
  fn.slidingWindow = slidingWindow;
  return { Ratelimit: fn };
});

const SUBMISSION_ID = 'c'.repeat(24);
const OTHER_SUBMISSION_ID = 'd'.repeat(24);
const ADDRESS = '203.0.113.7';

const allowed = (): { success: true; reset: number } => ({
  success: true,
  reset: Date.now() + 1000,
});
const denied = (): { success: false; reset: number } => ({
  success: false,
  reset: Date.now() + 60_000,
});

const view = { addressKey: ADDRESS, submissionId: SUBMISSION_ID };

beforeEach(() => {
  resetDailyAllowancesForTesting();
  resetRedisFallbackForTesting();
  limit.mockReset();
  built.length = 0;
  vi.stubEnv('E2E_MODE', '');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
});

describe('allowGuestView', () => {
  it('allows five guest views of one submission from one address in a day', () => {
    expect(GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION).toBe(5);
  });

  it('spends one of the address’s allowance for that submission', async () => {
    limit.mockResolvedValueOnce(allowed());

    await expect(allowGuestView(view)).resolves.toBe(true);
    expect(limit.mock.calls).toEqual([[`${ADDRESS}:${SUBMISSION_ID}`]]);
    expect(built).toEqual([
      {
        prefix: 'submission-view:guest-address',
        limiter: `${GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION} per 24 h`,
      },
    ]);
  });

  it('says no once the allowance is spent', async () => {
    limit.mockResolvedValueOnce(denied());

    await expect(allowGuestView(view)).resolves.toBe(false);
  });

  it('holds the limit in this process when the limiter is down', async () => {
    limit.mockRejectedValue(new Error('redis down'));

    const answers: boolean[] = [];
    for (let attempt = 0; attempt <= GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION; attempt += 1) {
      answers.push(await allowGuestView(view));
    }

    expect(answers.filter(Boolean)).toHaveLength(GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION);
    expect(answers.at(-1)).toBe(false);
  });

  it('counts each submission apart for one address when the limiter is down', async () => {
    limit.mockRejectedValue(new Error('redis down'));

    for (let attempt = 0; attempt < GUEST_VIEWS_PER_ADDRESS_PER_SUBMISSION; attempt += 1) {
      await allowGuestView(view);
    }

    await expect(
      allowGuestView({ addressKey: ADDRESS, submissionId: OTHER_SUBMISSION_ID })
    ).resolves.toBe(true);
  });

  it('never limits a Playwright run', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await expect(allowGuestView(view)).resolves.toBe(true);
    expect(limit).not.toHaveBeenCalled();
  });
});
