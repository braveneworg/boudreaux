/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  SIGNUP_CONSENT_COOKIE,
  readAndClearSignupConsent,
  setSignupConsentCookie,
} from './signup-consent';

vi.mock('server-only', () => ({}));

const mockSet = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: mockSet, get: mockGet, delete: mockDelete })),
}));

describe('signup-consent cookie', () => {
  describe('setSignupConsentCookie', () => {
    it('writes an httpOnly, lax cookie under the consent name', async () => {
      await setSignupConsentCookie({ allowSmsNotifications: true, allowEmailNotifications: false });

      const [name, , options] = mockSet.mock.calls[0];
      expect(name).toBe(SIGNUP_CONSENT_COOKIE);
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    });

    it('stores the chosen opt-ins in the cookie value', async () => {
      await setSignupConsentCookie({ allowSmsNotifications: true, allowEmailNotifications: false });

      const value = JSON.parse(mockSet.mock.calls[0][1]);
      expect(value).toMatchObject({ sms: true, email: false });
    });
  });

  describe('readAndClearSignupConsent', () => {
    it('returns null when the cookie is absent', async () => {
      mockGet.mockReturnValue(undefined);

      expect(await readAndClearSignupConsent()).toBeNull();
    });

    it('parses the opt-ins and a terms-accepted date when present', async () => {
      mockGet.mockReturnValue({
        value: JSON.stringify({ t: '2026-06-30T00:00:00.000Z', sms: true, email: true }),
      });

      const consent = await readAndClearSignupConsent();

      expect(consent).toEqual({
        termsAcceptedAt: new Date('2026-06-30T00:00:00.000Z'),
        allowSmsNotifications: true,
        allowEmailNotifications: true,
      });
    });

    it('clears the cookie after reading it (single-use)', async () => {
      mockGet.mockReturnValue({
        value: JSON.stringify({ t: '2026-06-30T00:00:00.000Z', sms: false, email: false }),
      });

      await readAndClearSignupConsent();

      expect(mockDelete).toHaveBeenCalledWith(SIGNUP_CONSENT_COOKIE);
    });

    it('returns null for a malformed cookie value', async () => {
      mockGet.mockReturnValue({ value: 'not-json' });

      expect(await readAndClearSignupConsent()).toBeNull();
    });
  });
});
