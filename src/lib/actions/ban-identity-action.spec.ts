/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const requireRoleMock = vi.fn();
const banMock = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: requireRoleMock }));

vi.mock('@/lib/services/chat-admin-service', () => ({
  ChatAdminService: { banIdentity: banMock },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { chat: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}));

const { banIdentityAction } = await import('./ban-identity-action');

describe('banIdentityAction', () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    banMock.mockReset();
  });

  it('returns unauthorized when requireRole throws', async () => {
    requireRoleMock.mockRejectedValue(Error('Unauthorized'));
    const result = await banIdentityAction({ email: 'a@b.c' });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
  });

  it('rejects an invalid email', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    const result = await banIdentityAction({ email: 'not-an-email' });
    expect(result.success).toBe(false);
    const error = !result.success ? result.error : null;
    expect(error).toBe('invalid');
  });

  it('persists the ban with the admin id captured', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    banMock.mockResolvedValue({ id: 'ban-1' });

    const result = await banIdentityAction({
      email: 'Bad@Example.com',
      fingerprintHash: 'fp',
      reason: 'repeat abuse',
    });

    expect(result).toEqual({ success: true, banId: 'ban-1' });
    expect(banMock).toHaveBeenCalledWith({
      userId: null,
      email: 'bad@example.com',
      fingerprintHash: 'fp',
      adminId: 'admin-1',
      reason: 'repeat abuse',
    });
  });

  it('groups a top-level (pathless) issue under the _form key', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    // A non-object input fails the top-level object check, producing an
    // issue with an empty path → the `|| '_form'` fallback.
    const result = await banIdentityAction(
      null as unknown as Parameters<typeof banIdentityAction>[0]
    );
    expect(result.success).toBe(false);
    const fieldErrors = !result.success ? result.fieldErrors : undefined;
    expect(fieldErrors).toHaveProperty('_form');
  });

  it('returns unauthorized when the session lacks a user id', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: '' } });
    const result = await banIdentityAction({ email: 'a@b.com' });
    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(banMock).not.toHaveBeenCalled();
  });

  it('defaults a missing fingerprint hash to null', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
    banMock.mockResolvedValue({ id: 'ban-2' });

    const result = await banIdentityAction({ email: 'a@b.com' });

    expect(result).toEqual({ success: true, banId: 'ban-2' });
    expect(banMock).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprintHash: null, userId: null })
    );
  });
});
