/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { SignupSettingsService } from '@/lib/services/signup-settings-service';

import { setSignupsPausedAction } from './set-signups-paused-action';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/action-gate');

vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: {
    setSignupsPaused: vi.fn(),
  },
}));

const mockGateAction = vi.mocked(gateAction);
const mockSetSignupsPaused = vi.mocked(SignupSettingsService.setSignupsPaused);

beforeEach(() => vi.clearAllMocks());

describe('setSignupsPausedAction', () => {
  it('returns unauthorized for a gate refusal without changing the setting', async () => {
    mockGateAction.mockResolvedValue({ success: false, error: 'Unauthorized', code: 'FORBIDDEN' });

    expect(await setSignupsPausedAction({ paused: true })).toEqual({
      success: false,
      error: 'unauthorized',
    });

    expect(mockSetSignupsPaused).not.toHaveBeenCalled();
  });

  it('pauses signups for an admin', async () => {
    mockGateAction.mockResolvedValue({ success: true, session: {} as never });

    const result = await setSignupsPausedAction({ paused: true });

    expect(mockSetSignupsPaused).toHaveBeenCalledWith(true);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(result).toEqual({ success: true });
  });

  it('resumes signups for an admin', async () => {
    mockGateAction.mockResolvedValue({ success: true, session: {} as never });

    const result = await setSignupsPausedAction({ paused: false });

    expect(mockSetSignupsPaused).toHaveBeenCalledWith(false);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(result).toEqual({ success: true });
  });

  it('returns invalid for non-boolean paused input', async () => {
    mockGateAction.mockResolvedValue({ success: true, session: {} as never });

    // Cast to bypass TypeScript — tests the runtime Zod guard
    const result = await setSignupsPausedAction({ paused: 'yes' as unknown as boolean });

    expect(result).toEqual({ success: false, error: 'invalid' });
    expect(mockSetSignupsPaused).not.toHaveBeenCalled();
  });
});
