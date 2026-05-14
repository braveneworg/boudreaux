/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const disableMock = vi.fn();
const enableMock = vi.fn();
const revalidateMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }));

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('@/lib/services/chat-admin-service', () => ({
  ChatAdminService: {
    disableChatUser: disableMock,
    enableChatUser: enableMock,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}));

const VALID_ID = '5f9d5b7a3b9d4f5a3b9d4f5a';

const { disableChatUserAction, enableChatUserAction } = await import('./disable-chat-user-action');

describe('disableChatUserAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    disableMock.mockReset();
    enableMock.mockReset();
    revalidateMock.mockReset();
  });

  it('returns unauthorized when requireRole throws', async () => {
    requireRoleMock.mockRejectedValue(Error('Unauthorized'));
    const result = await disableChatUserAction({ userId: VALID_ID });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(disableMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed userId as invalid', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    const result = await disableChatUserAction({ userId: 'not-an-id' });
    expect(result.success).toBe(false);
    const error = !result.success ? result.error : null;
    expect(error).toBe('invalid');
  });

  it('disables with admin id + reason captured', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    disableMock.mockResolvedValue({});

    const result = await disableChatUserAction({ userId: VALID_ID, reason: 'spam' });

    expect(result).toEqual({ success: true });
    expect(disableMock).toHaveBeenCalledWith({
      userId: VALID_ID,
      adminId: 'admin-1',
      reason: 'spam',
    });
    expect(revalidateMock).toHaveBeenCalledWith('/admin/chat');
  });
});

describe('enableChatUserAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    disableMock.mockReset();
    enableMock.mockReset();
    revalidateMock.mockReset();
  });

  it('returns unauthorized when requireRole throws', async () => {
    requireRoleMock.mockRejectedValue(Error('Unauthorized'));
    const result = await enableChatUserAction({ userId: VALID_ID });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
  });

  it('re-enables with the validated userId', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    enableMock.mockResolvedValue({});

    const result = await enableChatUserAction({ userId: VALID_ID });

    expect(result).toEqual({ success: true });
    expect(enableMock).toHaveBeenCalledWith(VALID_ID);
  });
});
