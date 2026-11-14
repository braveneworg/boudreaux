/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { resetDailyAllowancesForTesting } from './daily-allowance';
import { resetRedisFallbackForTesting } from './redis-fallback';
import {
  allowApproverNotice,
  allowAttachmentUpload,
  APPROVER_NOTICES_PER_OWNER,
  ATTACHMENT_UPLOADS_PER_OWNER,
} from './submission-allowances';

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

const OWNER = 'a'.repeat(24);

const allowed = (): { success: true; reset: number } => ({
  success: true,
  reset: Date.now() + 1000,
});
const denied = (): { success: false; reset: number } => ({
  success: false,
  reset: Date.now() + 60_000,
});

beforeEach(() => {
  resetDailyAllowancesForTesting();
  resetRedisFallbackForTesting();
  limit.mockReset();
  built.length = 0;
  vi.stubEnv('E2E_MODE', '');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
});

describe.each([
  [
    'allowApproverNotice',
    allowApproverNotice,
    'submission:approver-notice',
    APPROVER_NOTICES_PER_OWNER,
  ],
  [
    'allowAttachmentUpload',
    allowAttachmentUpload,
    'submission:attachment-upload',
    ATTACHMENT_UPLOADS_PER_OWNER,
  ],
] as const)('%s', (_name, allow, prefix, perDay) => {
  it('spends one of the owner’s allowance for the day', async () => {
    limit.mockResolvedValueOnce(allowed());

    await expect(allow(OWNER)).resolves.toBe(true);
    expect(limit.mock.calls).toEqual([[OWNER]]);
    expect(built).toEqual([{ prefix, limiter: `${perDay} per 24 h` }]);
  });

  it('says no once the allowance is spent', async () => {
    limit.mockResolvedValueOnce(denied());

    await expect(allow(OWNER)).resolves.toBe(false);
  });

  it('holds the limit in this process when the limiter is down', async () => {
    limit.mockRejectedValue(new Error('redis down'));

    const answers: boolean[] = [];
    for (let attempt = 0; attempt <= perDay; attempt += 1) {
      answers.push(await allow(OWNER));
    }

    expect(answers.filter(Boolean)).toHaveLength(perDay);
    expect(answers.at(-1)).toBe(false);
  });

  it('never limits a Playwright run', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await expect(allow(OWNER)).resolves.toBe(true);
    expect(limit).not.toHaveBeenCalled();
  });
});

describe('the two allowances', () => {
  it('are counted apart: a spent one leaves the other', async () => {
    limit.mockResolvedValueOnce(denied()).mockResolvedValueOnce(allowed());

    await expect(allowApproverNotice(OWNER)).resolves.toBe(false);
    await expect(allowAttachmentUpload(OWNER)).resolves.toBe(true);
    expect(built.map(({ prefix }) => prefix)).toEqual([
      'submission:approver-notice',
      'submission:attachment-upload',
    ]);
  });
});
