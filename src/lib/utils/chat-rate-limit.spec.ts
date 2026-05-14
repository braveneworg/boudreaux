/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Ratelimit } from '@upstash/ratelimit';

import {
  CHAT_FLAG_THRESHOLD,
  CHAT_RATE_LIMIT_PER_MINUTE,
  checkChatRateLimit,
  resetChatRateLimitForTesting,
} from './chat-rate-limit';

vi.mock('server-only', () => ({}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(),
}));

const limitMock = vi.fn();

vi.mock('@upstash/ratelimit', () => {
  function RatelimitCtorFn(this: { limit: typeof limitMock }) {
    this.limit = limitMock;
  }
  const Ctor = vi.fn(RatelimitCtorFn) as unknown as {
    (this: { limit: typeof limitMock }): void;
    slidingWindow: ReturnType<typeof vi.fn>;
  };
  Ctor.slidingWindow = vi.fn(() => 'sliding-window-marker');
  return { Ratelimit: Ctor };
});

const RatelimitCtor = vi.mocked(Ratelimit);

describe('chat-rate-limit constants', () => {
  it('exposes the hard ceiling of 10 sends per minute', () => {
    expect(CHAT_RATE_LIMIT_PER_MINUTE).toBe(10);
  });

  it('flags abuse at 8 sends before hitting the ceiling', () => {
    expect(CHAT_FLAG_THRESHOLD).toBe(8);
    expect(CHAT_FLAG_THRESHOLD).toBeLessThan(CHAT_RATE_LIMIT_PER_MINUTE);
  });
});

describe('checkChatRateLimit', () => {
  beforeEach(() => {
    resetChatRateLimitForTesting();
    RatelimitCtor.mockClear();
    limitMock.mockReset();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
    vi.stubEnv('E2E_MODE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetChatRateLimitForTesting();
  });

  it('passes the composite key to the limiter', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 60_000 });

    await checkChatRateLimit('user-1', 'fp-abc', '203.0.113.5');

    expect(limitMock).toHaveBeenCalledWith('user-1:fp-abc:203.0.113.5');
  });

  it('returns success=true with remaining + retryAfterSeconds when under the limit', async () => {
    const reset = Date.now() + 30_000;
    limitMock.mockResolvedValue({ success: true, remaining: 5, reset });

    const result = await checkChatRateLimit('user-1', 'fp-abc', '203.0.113.5');

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(29);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(31);
  });

  it('returns success=false when the limiter rejects', async () => {
    const reset = Date.now() + 12_000;
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset });

    const result = await checkChatRateLimit('user-1', 'fp-abc', '203.0.113.5');

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(11);
  });

  it('clamps retryAfterSeconds to zero when reset is in the past', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() - 5_000 });

    const result = await checkChatRateLimit('user-1', 'fp-abc', '203.0.113.5');

    expect(result.retryAfterSeconds).toBe(0);
  });

  it('short-circuits in E2E_MODE without calling the limiter', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const result = await checkChatRateLimit('user-1', 'fp-abc', '203.0.113.5');

    expect(limitMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(CHAT_RATE_LIMIT_PER_MINUTE);
  });

  it('reuses the Ratelimit singleton across calls', async () => {
    limitMock.mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 60_000 });

    await checkChatRateLimit('user-1', 'fp-1', '1.1.1.1');
    await checkChatRateLimit('user-1', 'fp-2', '2.2.2.2');

    expect(RatelimitCtor).toHaveBeenCalledTimes(1);
  });
});
