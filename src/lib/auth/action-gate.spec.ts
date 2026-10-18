/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { auth } from '@/auth';
import type { ServerSession } from '@/lib/auth/get-server-session';

import { gateAction, refusalFor } from './action-gate';

vi.mock('server-only', () => ({}));
vi.mock('@/auth');

const sessionFor = (user: Partial<ServerSession['user']>): ServerSession =>
  ({ user }) as ServerSession;

const admin = sessionFor({ id: 'admin-1', role: 'admin', banned: false });
const member = sessionFor({ id: 'user-1', role: 'user', banned: false });

describe('gateAction', () => {
  it('refuses a request with no session as UNAUTHENTICATED', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null);

    await expect(gateAction('signed-in')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuses a session whose user has no id as UNAUTHENTICATED', async () => {
    vi.mocked(auth).mockResolvedValueOnce(sessionFor({ id: '', role: 'admin' }));

    await expect(gateAction('admin')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuses a banned user as BANNED with the suspension copy', async () => {
    vi.mocked(auth).mockResolvedValueOnce(sessionFor({ id: 'user-1', role: 'user', banned: true }));

    await expect(gateAction('signed-in')).resolves.toEqual({
      success: false,
      error: 'Account suspended',
      code: 'BANNED',
    });
  });

  it('refuses a banned admin as BANNED, not FORBIDDEN', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      sessionFor({ id: 'admin-1', role: 'admin', banned: true })
    );

    await expect(gateAction('admin')).resolves.toEqual({
      success: false,
      error: 'Account suspended',
      code: 'BANNED',
    });
  });

  it('refuses a user without the admin role as FORBIDDEN', async () => {
    vi.mocked(auth).mockResolvedValueOnce(member);

    await expect(gateAction('admin')).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'FORBIDDEN',
    });
  });

  it('passes an admin and returns the session', async () => {
    vi.mocked(auth).mockResolvedValueOnce(admin);

    await expect(gateAction('admin')).resolves.toEqual({ success: true, session: admin });
  });

  it('passes a signed-in user with the user role', async () => {
    vi.mocked(auth).mockResolvedValueOnce(member);

    await expect(gateAction('signed-in')).resolves.toEqual({ success: true, session: member });
  });

  it('rejects with the error auth() rejects with', async () => {
    const outage = new Error('Database unavailable');
    vi.mocked(auth).mockRejectedValueOnce(outage);

    await expect(gateAction('signed-in')).rejects.toBe(outage);
  });
});

describe('refusalFor', () => {
  it('refuses a role of null for admin access as FORBIDDEN', () => {
    expect(refusalFor(sessionFor({ id: 'user-1', role: null }), 'admin')).toBe('FORBIDDEN');
  });

  it.each([false, null])('passes an admin whose banned flag is %s', (banned) => {
    expect(refusalFor(sessionFor({ id: 'admin-1', role: 'admin', banned }), 'admin')).toBeNull();
  });
});
