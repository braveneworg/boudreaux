/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { auth } from './auth';

vi.mock('server-only', () => ({}));

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/get-server-session', () => ({
  getServerSession: getServerSessionMock,
}));

describe('auth façade', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
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
});
