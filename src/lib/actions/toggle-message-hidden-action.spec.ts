/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const gateActionMock = vi.fn();
const hideMock = vi.fn();
const unhideMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth/action-gate', () => ({ gateAction: gateActionMock }));

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
    gateActionMock.mockReset();
    hideMock.mockReset();
    unhideMock.mockReset();
  });

  it('returns unauthorized for a gate refusal without hiding', async () => {
    gateActionMock.mockResolvedValue({ success: false, error: 'Unauthorized', code: 'FORBIDDEN' });
    const result = await toggleMessageHiddenAction({ messageId: VALID_ID, hidden: true });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(hideMock).not.toHaveBeenCalled();
    expect(unhideMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed messageId', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await toggleMessageHiddenAction({ messageId: 'bad', hidden: true });
    expect(result.success).toBe(false);
    const error = !result.success ? result.error : null;
    expect(error).toBe('invalid');
  });

  it('hides with admin id when hidden=true', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    hideMock.mockResolvedValue({});

    await toggleMessageHiddenAction({ messageId: VALID_ID, hidden: true });

    expect(hideMock).toHaveBeenCalledWith({ messageId: VALID_ID, adminId: 'admin-1' });
    expect(unhideMock).not.toHaveBeenCalled();
  });

  it('unhides when hidden=false', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    unhideMock.mockResolvedValue({});

    await toggleMessageHiddenAction({ messageId: VALID_ID, hidden: false });

    expect(unhideMock).toHaveBeenCalledWith(VALID_ID);
    expect(hideMock).not.toHaveBeenCalled();
  });

  it('groups a top-level (pathless) issue under the _form key', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await toggleMessageHiddenAction(
      null as unknown as Parameters<typeof toggleMessageHiddenAction>[0]
    );
    expect(result.success).toBe(false);
    const fieldErrors = !result.success ? result.fieldErrors : undefined;
    expect(fieldErrors).toHaveProperty('_form');
  });
});
