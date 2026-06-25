/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { auth, signOut } from './auth';

vi.mock('server-only', () => ({}));

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/get-server-session', () => ({
  getServerSession: getServerSessionMock,
}));

const signOutMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  auth: { api: { signOut: signOutMock } },
}));

const headersMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

describe('auth façade', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    signOutMock.mockReset();
    headersMock.mockResolvedValue(new Headers());
  });

  describe('auth()', () => {
    it('delegates to getServerSession', async () => {
      const session = { user: { id: 'u1', role: 'admin' } };
      getServerSessionMock.mockResolvedValue(session);

      await expect(auth()).resolves.toBe(session);
    });

    it('returns null when there is no session', async () => {
      getServerSessionMock.mockResolvedValue(null);

      await expect(auth()).resolves.toBeNull();
    });
  });

  describe('signOut()', () => {
    it('revokes the better-auth session with the request headers', async () => {
      const headers = new Headers({ cookie: 'x=1' });
      headersMock.mockResolvedValue(headers);
      signOutMock.mockResolvedValue(undefined);

      await signOut({ redirect: false });

      expect(signOutMock).toHaveBeenCalledWith({ headers });
    });
  });
});
