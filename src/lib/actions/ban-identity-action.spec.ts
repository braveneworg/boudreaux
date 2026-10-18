/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const gateActionMock = vi.fn();
const banMock = vi.fn();
const headersMock = vi.fn().mockResolvedValue(new Headers());

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));

vi.mock('@/lib/auth/action-gate', () => ({ gateAction: gateActionMock }));

vi.mock('@/lib/services/chat-admin-service', () => ({
  ChatAdminService: { banIdentity: banMock },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}));

const { banIdentityAction } = await import('./ban-identity-action');

describe('banIdentityAction', () => {
  beforeEach(() => {
    gateActionMock.mockReset();
    banMock.mockReset();
  });

  it('returns unauthorized for a gate refusal without banning', async () => {
    gateActionMock.mockResolvedValue({ success: false, error: 'Unauthorized', code: 'FORBIDDEN' });
    const result = await banIdentityAction({ email: 'a@b.c' });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(banMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    const result = await banIdentityAction({ email: 'not-an-email' });
    expect(result.success).toBe(false);
    const error = !result.success ? result.error : null;
    expect(error).toBe('invalid');
  });

  it('persists the ban with the admin id captured', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    banMock.mockResolvedValue({ id: 'ban-1' });

    const result = await banIdentityAction({
      email: 'Bad@Example.com',
      fingerprintHash: 'fp',
      reason: 'repeat abuse',
    });

    expect(result).toEqual({ success: true, banId: 'ban-1' });
    expect(banMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        email: 'bad@example.com',
        fingerprintHash: 'fp',
        adminId: 'admin-1',
        reason: 'repeat abuse',
      })
    );
  });

  it('groups a top-level (pathless) issue under the _form key', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    // A non-object input fails the top-level object check, producing an
    // issue with an empty path → the `|| '_form'` fallback.
    const result = await banIdentityAction(
      null as unknown as Parameters<typeof banIdentityAction>[0]
    );
    expect(result.success).toBe(false);
    const fieldErrors = !result.success ? result.fieldErrors : undefined;
    expect(fieldErrors).toHaveProperty('_form');
  });

  it('defaults a missing fingerprint hash to null', async () => {
    gateActionMock.mockResolvedValue({ success: true, session: { user: { id: 'admin-1' } } });
    banMock.mockResolvedValue({ id: 'ban-2' });

    const result = await banIdentityAction({ email: 'a@b.com' });

    expect(result).toEqual({ success: true, banId: 'ban-2' });
    expect(banMock).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprintHash: null, userId: null })
    );
  });
});
