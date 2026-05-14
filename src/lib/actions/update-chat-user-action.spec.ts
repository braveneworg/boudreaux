/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { ChatAdminService } from '@/lib/services/chat-admin-service';
import { requireRole } from '@/lib/utils/auth/require-role';

import { updateChatUserAction } from './update-chat-user-action';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));

vi.mock('@/lib/services/chat-admin-service', () => ({
  ChatAdminService: {
    setDisabled: vi.fn(),
    clearFlag: vi.fn(),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('updateChatUserAction', () => {
  it('returns unauthorized when requireRole throws', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    const result = await updateChatUserAction({
      userId: 'abcdef1234567890abcdef12',
      disabled: true,
    });

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(ChatAdminService.setDisabled).not.toHaveBeenCalled();
  });

  it('rejects an empty patch as invalid', async () => {
    vi.mocked(requireRole).mockResolvedValue({} as never);

    const result = await updateChatUserAction({ userId: 'abcdef1234567890abcdef12' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('invalid');
  });

  it('rejects a malformed userId before reaching the service', async () => {
    vi.mocked(requireRole).mockResolvedValue({} as never);

    const result = await updateChatUserAction({ userId: 'not-an-id', disabled: true });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('invalid');
    expect(result.fieldErrors?.userId).toBeDefined();
    expect(ChatAdminService.setDisabled).not.toHaveBeenCalled();
  });

  it('applies disabled=true and revalidates the admin path', async () => {
    vi.mocked(requireRole).mockResolvedValue({} as never);

    const result = await updateChatUserAction({
      userId: 'abcdef1234567890abcdef12',
      disabled: true,
    });

    expect(ChatAdminService.setDisabled).toHaveBeenCalledWith('abcdef1234567890abcdef12', true);
    expect(ChatAdminService.clearFlag).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/admin/chat');
    expect(result).toEqual({ success: true });
  });

  it('applies disabled=false to re-enable a user', async () => {
    vi.mocked(requireRole).mockResolvedValue({} as never);

    await updateChatUserAction({ userId: 'abcdef1234567890abcdef12', disabled: false });

    expect(ChatAdminService.setDisabled).toHaveBeenCalledWith('abcdef1234567890abcdef12', false);
  });

  it('clears the abuse flag when clearFlag is true', async () => {
    vi.mocked(requireRole).mockResolvedValue({} as never);

    await updateChatUserAction({ userId: 'abcdef1234567890abcdef12', clearFlag: true });

    expect(ChatAdminService.clearFlag).toHaveBeenCalledWith('abcdef1234567890abcdef12');
  });

  it('can do both operations in one call', async () => {
    vi.mocked(requireRole).mockResolvedValue({} as never);

    await updateChatUserAction({
      userId: 'abcdef1234567890abcdef12',
      disabled: true,
      clearFlag: true,
    });

    expect(ChatAdminService.setDisabled).toHaveBeenCalledWith('abcdef1234567890abcdef12', true);
    expect(ChatAdminService.clearFlag).toHaveBeenCalledWith('abcdef1234567890abcdef12');
  });
});
