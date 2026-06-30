// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SignupSettingsService } from '@/lib/services/signup-settings-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: { areSignupsPaused: vi.fn() },
}));

const mockAreSignupsPaused = vi.mocked(SignupSettingsService.areSignupsPaused);

describe('GET /api/auth/signup-status', () => {
  it('returns the paused flag', async () => {
    mockAreSignupsPaused.mockResolvedValue(true);
    const res = await GET();
    expect(await res.json()).toEqual({ paused: true });
  });

  it('fails open with paused:false on error', async () => {
    mockAreSignupsPaused.mockRejectedValue(new Error('db down'));
    const res = await GET();
    expect(await res.json()).toEqual({ paused: false });
  });
});
