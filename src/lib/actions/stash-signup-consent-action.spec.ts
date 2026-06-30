/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { stashSignupConsent } from './stash-signup-consent-action';

vi.mock('server-only', () => ({}));

const mockVerifyTurnstile = vi.hoisted(() => vi.fn());
const mockSetSignupConsentCookie = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn(() => '127.0.0.1') })),
}));
vi.mock('@/lib/utils/verify-turnstile', () => ({ verifyTurnstile: mockVerifyTurnstile }));
vi.mock('@/lib/utils/extract-client-ip', () => ({
  extractClientIpFromHeaders: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/auth/signup-consent', () => ({
  setSignupConsentCookie: mockSetSignupConsentCookie,
}));

describe('stashSignupConsent', () => {
  it('verifies Turnstile and stashes the opt-ins on success', async () => {
    mockVerifyTurnstile.mockResolvedValue({ success: true });

    const result = await stashSignupConsent({
      turnstileToken: 'token',
      allowSmsNotifications: true,
      allowEmailNotifications: false,
    });

    expect(result).toEqual({ success: true });
    expect(mockVerifyTurnstile).toHaveBeenCalledWith('token', '127.0.0.1');
    expect(mockSetSignupConsentCookie).toHaveBeenCalledWith({
      allowSmsNotifications: true,
      allowEmailNotifications: false,
    });
  });

  it('does not set the cookie when Turnstile fails', async () => {
    mockVerifyTurnstile.mockResolvedValue({ success: false, error: 'bad token' });

    const result = await stashSignupConsent({
      turnstileToken: 'token',
      allowSmsNotifications: true,
      allowEmailNotifications: true,
    });

    expect(result).toEqual({ success: false, error: 'bad token' });
    expect(mockSetSignupConsentCookie).not.toHaveBeenCalled();
  });
});
