/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { confirmTurnstile } from './confirm-turnstile-action';

vi.mock('server-only', () => ({}));

const mockPassTurnstileChallenge = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => '127.0.0.1') })),
}));
vi.mock('@/lib/utils/extract-client-ip', () => ({
  extractClientIpFromHeaders: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/auth/pass-turnstile-challenge', () => ({
  passTurnstileChallenge: mockPassTurnstileChallenge,
}));

describe('confirmTurnstile', () => {
  beforeEach(() => {
    mockPassTurnstileChallenge.mockReset();
  });

  it('passes the challenge with the token and client IP', async () => {
    mockPassTurnstileChallenge.mockResolvedValueOnce({ success: true });

    const result = await confirmTurnstile({ turnstileToken: 'token' });

    expect(result).toEqual({ success: true });
    expect(mockPassTurnstileChallenge).toHaveBeenCalledWith({
      turnstileToken: 'token',
      ip: '127.0.0.1',
    });
  });

  it('relays a failed verification', async () => {
    mockPassTurnstileChallenge.mockResolvedValueOnce({ success: false, error: 'bad token' });

    const result = await confirmTurnstile({ turnstileToken: 'token' });

    expect(result).toEqual({ success: false, error: 'bad token' });
  });

  it('rejects an empty token before touching the verifier', async () => {
    const result = await confirmTurnstile({ turnstileToken: '' });

    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(mockPassTurnstileChallenge).not.toHaveBeenCalled();
  });

  it('rejects an oversized token before touching the verifier', async () => {
    const result = await confirmTurnstile({ turnstileToken: 'x'.repeat(5_000) });

    expect(result).toMatchObject({ success: false });
    expect(mockPassTurnstileChallenge).not.toHaveBeenCalled();
  });

  it('turns an unexpected throw into a failed result', async () => {
    mockPassTurnstileChallenge.mockRejectedValueOnce(new Error('boom'));

    const result = await confirmTurnstile({ turnstileToken: 'token' });

    expect(result).toEqual({
      success: false,
      error: 'Verification failed. Please try again.',
    });
  });
});
