/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SignupSettingsService } from '@/lib/services/signup-settings-service';

import { userCreateBeforeHook } from './user-create-before-hook';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: { areSignupsPaused: vi.fn() },
}));
vi.mock('@/lib/auth/backfill-username-hook', () => ({
  backfillUsername: vi.fn((user) => ({ data: { ...user, username: 'placeholder1234' } })),
}));
const mockReadConsent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/signup-consent', () => ({
  readAndClearSignupConsent: mockReadConsent,
}));
const mockPaused = vi.mocked(SignupSettingsService.areSignupsPaused);

describe('userCreateBeforeHook', () => {
  beforeEach(() => {
    // Default: no stashed consent (the common magic-link/`/signin` auto-create).
    mockReadConsent.mockResolvedValue(null);
  });

  it('returns false (aborts) when signups are paused', async () => {
    mockPaused.mockResolvedValue(true);
    expect(await userCreateBeforeHook({ email: 'a@b.com' })).toBe(false);
  });

  it('backfills a username when not paused', async () => {
    mockPaused.mockResolvedValue(false);
    const result = await userCreateBeforeHook({ email: 'a@b.com' });
    expect(result).toEqual({ data: { email: 'a@b.com', username: 'placeholder1234' } });
  });

  it('applies stashed consent (terms + opt-ins) for a social OAuth signup', async () => {
    mockPaused.mockResolvedValue(false);
    const termsAcceptedAt = new Date('2026-06-30T00:00:00.000Z');
    mockReadConsent.mockResolvedValue({
      termsAcceptedAt,
      allowSmsNotifications: true,
      allowEmailNotifications: false,
    });

    const result = await userCreateBeforeHook({ email: 'a@b.com' });

    expect(result).toEqual({
      data: {
        email: 'a@b.com',
        username: 'placeholder1234',
        termsAndConditions: true,
        termsAcceptedAt,
        allowSmsNotifications: true,
        allowEmailNotifications: false,
      },
    });
  });

  it('does not apply consent fields when no consent cookie is present', async () => {
    mockPaused.mockResolvedValue(false);
    mockReadConsent.mockResolvedValue(null);

    const result = (await userCreateBeforeHook({ email: 'a@b.com' })) as { data: object };

    expect(result.data).not.toHaveProperty('termsAndConditions');
    expect(result.data).not.toHaveProperty('allowSmsNotifications');
  });
});
