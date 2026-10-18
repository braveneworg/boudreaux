/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const gateActionMock = vi.fn();
const disableMock = vi.fn();
const enableMock = vi.fn();
const revalidateMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: revalidateMock }));

vi.mock('@/lib/auth/action-gate', () => ({ gateAction: gateActionMock }));

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
    gateActionMock.mockReset();
    disableMock.mockReset();
    enableMock.mockReset();
    revalidateMock.mockReset();
  });

  it('returns unauthorized for a gate refusal without disabling', async () => {
    gateActionMock.mockResolvedValue({ success: false, error: 'Unauthorized', code: 'FORBIDDEN' });
    const result = await disableChatUserAction({ userId: VALID_ID });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(disableMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed userId as invalid', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await disableChatUserAction({ userId: 'not-an-id' });
    expect(result.success).toBe(false);
    const error = !result.success ? result.error : null;
    expect(error).toBe('invalid');
  });

  it('disables with admin id + reason captured', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
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

  it('groups a top-level (pathless) issue under the _form key', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await disableChatUserAction(
      null as unknown as Parameters<typeof disableChatUserAction>[0]
    );
    expect(result.success).toBe(false);
    const fieldErrors = !result.success ? result.fieldErrors : undefined;
    expect(fieldErrors).toHaveProperty('_form');
  });
});

describe('enableChatUserAction', () => {
  beforeEach(() => {
    gateActionMock.mockReset();
    disableMock.mockReset();
    enableMock.mockReset();
    revalidateMock.mockReset();
  });

  it('returns unauthorized for a gate refusal without enabling', async () => {
    gateActionMock.mockResolvedValue({ success: false, error: 'Unauthorized', code: 'FORBIDDEN' });
    const result = await enableChatUserAction({ userId: VALID_ID });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('re-enables with the validated userId', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    enableMock.mockResolvedValue({});

    const result = await enableChatUserAction({ userId: VALID_ID });

    expect(result).toEqual({ success: true });
    expect(enableMock).toHaveBeenCalledWith(VALID_ID);
  });

  it('rejects a malformed userId with a field-scoped error', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await enableChatUserAction({ userId: 'not-an-id' });
    expect(result.success).toBe(false);
    const fieldErrors = !result.success ? result.fieldErrors : undefined;
    expect(fieldErrors).toHaveProperty('userId');
    expect(enableMock).not.toHaveBeenCalled();
  });

  it('groups a top-level (pathless) issue under the _form key', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await enableChatUserAction(
      null as unknown as Parameters<typeof enableChatUserAction>[0]
    );
    expect(result.success).toBe(false);
    const fieldErrors = !result.success ? result.fieldErrors : undefined;
    expect(fieldErrors).toHaveProperty('_form');
  });
});
