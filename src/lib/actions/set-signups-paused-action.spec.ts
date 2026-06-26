/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { SignupSettingsService } from '@/lib/services/signup-settings-service';
import { requireRole } from '@/lib/utils/auth/require-role';

import { setSignupsPausedAction } from './set-signups-paused-action';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));

vi.mock('@/lib/services/signup-settings-service', () => ({
  SignupSettingsService: {
    setSignupsPaused: vi.fn(),
  },
}));

const mockRequireRole = vi.mocked(requireRole);
const mockSetSignupsPaused = vi.mocked(SignupSettingsService.setSignupsPaused);

beforeEach(() => vi.clearAllMocks());

describe('setSignupsPausedAction', () => {
  it('rejects non-admins', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'));

    expect(await setSignupsPausedAction({ paused: true })).toEqual({
      success: false,
      error: 'unauthorized',
    });

    expect(mockSetSignupsPaused).not.toHaveBeenCalled();
  });

  it('pauses signups for an admin', async () => {
    mockRequireRole.mockResolvedValue({} as never);

    const result = await setSignupsPausedAction({ paused: true });

    expect(mockSetSignupsPaused).toHaveBeenCalledWith(true);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(result).toEqual({ success: true });
  });

  it('resumes signups for an admin', async () => {
    mockRequireRole.mockResolvedValue({} as never);

    const result = await setSignupsPausedAction({ paused: false });

    expect(mockSetSignupsPaused).toHaveBeenCalledWith(false);
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(result).toEqual({ success: true });
  });

  it('returns invalid for non-boolean paused input', async () => {
    mockRequireRole.mockResolvedValue({} as never);

    // Cast to bypass TypeScript — tests the runtime Zod guard
    const result = await setSignupsPausedAction({ paused: 'yes' as unknown as boolean });

    expect(result).toEqual({ success: false, error: 'invalid' });
    expect(mockSetSignupsPaused).not.toHaveBeenCalled();
  });
});
