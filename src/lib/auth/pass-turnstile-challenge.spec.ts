/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { passTurnstileChallenge } from './pass-turnstile-challenge';

vi.mock('server-only', () => ({}));

const mockVerifyTurnstile = vi.hoisted(() => vi.fn());
const mockSetTurnstileGateCookie = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/verify-turnstile', () => ({ verifyTurnstile: mockVerifyTurnstile }));
vi.mock('@/lib/auth/turnstile-gate', () => ({
  setTurnstileGateCookie: mockSetTurnstileGateCookie,
}));

describe('passTurnstileChallenge', () => {
  beforeEach(() => {
    mockVerifyTurnstile.mockReset();
    mockSetTurnstileGateCookie.mockReset();
  });

  it('verifies the token with the client IP and issues the gate cookie', async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: true });

    const result = await passTurnstileChallenge({ turnstileToken: 'token', ip: '203.0.113.9' });

    expect(result).toEqual({ success: true });
    expect(mockVerifyTurnstile).toHaveBeenCalledWith('token', '203.0.113.9');
    expect(mockSetTurnstileGateCookie).toHaveBeenCalledTimes(1);
  });

  it('returns the verifier error and issues no cookie when the token fails', async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false, error: 'bad token' });

    const result = await passTurnstileChallenge({ turnstileToken: 'token', ip: '203.0.113.9' });

    expect(result).toEqual({ success: false, error: 'bad token' });
    expect(mockSetTurnstileGateCookie).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the verifier gives none', async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });

    const result = await passTurnstileChallenge({ turnstileToken: 'token', ip: '203.0.113.9' });

    expect(result).toEqual({
      success: false,
      error: 'CAPTCHA verification failed. Please try again.',
    });
  });
});
