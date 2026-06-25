/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { checkPublicFormGuards } from '@/lib/utils/public-form-guards';

const mockHeaders = vi.hoisted(() => vi.fn());
const mockVerifyTurnstile = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mockHeaders }));
vi.mock('@/lib/utils/verify-turnstile', () => ({ verifyTurnstile: mockVerifyTurnstile }));

const makeHeaders = (map: Record<string, string>) => {
  const entries = new Map(Object.entries(map));
  return { get: (name: string): string | null => entries.get(name) ?? null };
};

const makePayload = (captcha: string | null): FormData => {
  const fd = new FormData();
  if (captcha !== null) fd.set('cf-turnstile-response', captcha);
  return fd;
};

describe('checkPublicFormGuards', () => {
  const limiterOk = { check: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    mockHeaders.mockResolvedValue(makeHeaders({ 'x-forwarded-for': '192.168.1.1' }));
    mockVerifyTurnstile.mockResolvedValue({ success: true });
    limiterOk.check.mockClear();
  });

  it('returns null when rate limit, token, and Turnstile all pass', async () => {
    const result = await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(result).toBeNull();
  });

  it('checks the rate limit with the resolved IP and max requests', async () => {
    await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter: limiterOk,
      maxRequests: 5,
      rateLimitMessage: 'rate limited',
    });
    expect(limiterOk.check).toHaveBeenCalledWith(5, '192.168.1.1');
  });

  it('returns the provided rate-limit message when the limiter rejects', async () => {
    const limiter = { check: vi.fn().mockRejectedValue(new Error('limit')) };
    const result = await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter,
      maxRequests: 3,
      rateLimitMessage: 'Too many requests.',
    });
    expect(result?.errors?.general).toEqual(['Too many requests.']);
  });

  it('returns a CAPTCHA-required error when the token is missing', async () => {
    const result = await checkPublicFormGuards({
      payload: makePayload(null),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(result?.errors?.general).toEqual([
      'CAPTCHA verification required. Please complete the verification.',
    ]);
  });

  it('surfaces the Turnstile error message when verification fails', async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false, error: 'Bad token' });
    const result = await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(result?.errors?.general).toEqual(['Bad token']);
  });

  it('falls back to a default message when Turnstile fails without an error', async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const result = await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(result?.errors?.general).toEqual(['CAPTCHA verification failed. Please try again.']);
  });

  it('verifies Turnstile with the token and resolved IP', async () => {
    await checkPublicFormGuards({
      payload: makePayload('the-token'),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(mockVerifyTurnstile).toHaveBeenCalledWith('the-token', '192.168.1.1');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    mockHeaders.mockResolvedValueOnce(makeHeaders({ 'x-real-ip': '10.0.0.1' }));
    await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(limiterOk.check).toHaveBeenCalledWith(3, '10.0.0.1');
  });

  it('falls back to "anonymous" when no IP headers are present', async () => {
    mockHeaders.mockResolvedValueOnce(makeHeaders({}));
    await checkPublicFormGuards({
      payload: makePayload('tok'),
      limiter: limiterOk,
      maxRequests: 3,
      rateLimitMessage: 'rate limited',
    });
    expect(limiterOk.check).toHaveBeenCalledWith(3, 'anonymous');
  });
});
