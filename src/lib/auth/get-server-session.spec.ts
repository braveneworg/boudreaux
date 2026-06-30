/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getServerSession } from './get-server-session';

vi.mock('server-only', () => ({}));

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: getSessionMock } },
}));

const headersMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

const findByIdMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    findById: findByIdMock,
  },
}));

describe('getServerSession', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    findByIdMock.mockReset();
    headersMock.mockResolvedValue(new Headers());
  });

  it('returns null when better-auth has no session', async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(getServerSession()).resolves.toBeNull();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('passes the request headers through to better-auth', async () => {
    const headers = new Headers({ cookie: 'x=1' });
    headersMock.mockResolvedValue(headers);
    getSessionMock.mockResolvedValue(null);

    await getServerSession();

    expect(getSessionMock).toHaveBeenCalledWith({ headers });
  });

  it('returns null when the session user id no longer resolves to a DB user', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's1' } });
    findByIdMock.mockResolvedValue(null);

    await expect(getServerSession()).resolves.toBeNull();
  });

  it('normalizes to a session whose user carries the authoritative DB fields', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's1' } });
    findByIdMock.mockResolvedValue({
      id: 'u1',
      email: 'fan@example.com',
      role: 'admin',
      username: 'fan',
      name: 'Fan Name',
      image: null,
      firstName: 'Fan',
      lastName: 'Name',
      phone: '555',
    });

    const result = await getServerSession();

    expect(result?.user).toEqual(
      expect.objectContaining({
        id: 'u1',
        email: 'fan@example.com',
        role: 'admin',
        username: 'fan',
        name: 'Fan Name',
      })
    );
  });

  it('looks the user up by the session user id', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's1' } });
    findByIdMock.mockResolvedValue({ id: 'u1', email: 'fan@example.com', role: 'user' });

    await getServerSession();

    expect(findByIdMock).toHaveBeenCalledWith('u1');
  });

  it('returns null when better-auth resolves a session without a user id', async () => {
    getSessionMock.mockResolvedValue({ user: {}, session: { id: 's1' } });

    await expect(getServerSession()).resolves.toBeNull();
    expect(findByIdMock).not.toHaveBeenCalled();
  });
});
