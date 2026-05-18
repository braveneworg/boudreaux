/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const hideMock = vi.fn();
const unhideMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('@/lib/services/chat-admin-service', () => ({
  ChatAdminService: {
    hideMessage: hideMock,
    unhideMessage: unhideMock,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}));

const VALID_ID = '5f9d5b7a3b9d4f5a3b9d4f5a';

const { toggleMessageHiddenAction } = await import('./toggle-message-hidden-action');

describe('toggleMessageHiddenAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    hideMock.mockReset();
    unhideMock.mockReset();
  });

  it('returns unauthorized when requireRole throws', async () => {
    requireRoleMock.mockRejectedValue(Error('Unauthorized'));
    const result = await toggleMessageHiddenAction({ messageId: VALID_ID, hidden: true });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
  });

  it('rejects a malformed messageId', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    const result = await toggleMessageHiddenAction({ messageId: 'bad', hidden: true });
    expect(result.success).toBe(false);
    const error = !result.success ? result.error : null;
    expect(error).toBe('invalid');
  });

  it('hides with admin id when hidden=true', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    hideMock.mockResolvedValue({});

    await toggleMessageHiddenAction({ messageId: VALID_ID, hidden: true });

    expect(hideMock).toHaveBeenCalledWith({ messageId: VALID_ID, adminId: 'admin-1' });
    expect(unhideMock).not.toHaveBeenCalled();
  });

  it('unhides when hidden=false', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    unhideMock.mockResolvedValue({});

    await toggleMessageHiddenAction({ messageId: VALID_ID, hidden: false });

    expect(unhideMock).toHaveBeenCalledWith(VALID_ID);
    expect(hideMock).not.toHaveBeenCalled();
  });
});
