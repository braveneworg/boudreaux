/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UserRepository } from '@/lib/repositories/user-repository';

import { ManagerService } from './manager-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findManagers: vi.fn(), findRoleByUsername: vi.fn(), setRole: vi.fn() },
}));

const USER_ID = 'a'.repeat(24);

const found = (overrides: { role?: string | null; banned?: boolean | null } = {}) => ({
  id: USER_ID,
  username: 'fan',
  role: 'user',
  banned: false,
  ...overrides,
});

const failureOf = async (
  promise: Promise<unknown>
): Promise<{ code?: string; message?: string }> => {
  try {
    await promise;
    return {};
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    return { code, message };
  }
};

describe('ManagerService.list', () => {
  it('lists the managers by id and username, without their email', async () => {
    vi.mocked(UserRepository.findManagers).mockResolvedValueOnce([
      { id: USER_ID, username: 'fan', email: 'fan@example.com' },
    ]);

    await expect(ManagerService.list()).resolves.toEqual([{ id: USER_ID, username: 'fan' }]);
  });
});

describe('ManagerService.grant', () => {
  it('makes a user a manager', async () => {
    vi.mocked(UserRepository.findRoleByUsername).mockResolvedValueOnce(found());

    await expect(ManagerService.grant('fan')).resolves.toBeUndefined();
    expect(vi.mocked(UserRepository.findRoleByUsername).mock.calls).toEqual([['fan']]);
    expect(vi.mocked(UserRepository.setRole).mock.calls).toEqual([[USER_ID, 'manager']]);
  });

  it('makes a manager of a user whose role was never set', async () => {
    vi.mocked(UserRepository.findRoleByUsername).mockResolvedValueOnce(found({ role: null }));

    await ManagerService.grant('fan');

    expect(vi.mocked(UserRepository.setRole).mock.calls).toEqual([[USER_ID, 'manager']]);
  });

  it.each([
    ['an unknown username', null, 'NOT_FOUND', 'No user has that username.'],
    [
      'a banned account',
      found({ banned: true }),
      'INVALID_INPUT',
      'That account is suspended, so it cannot be made a manager.',
    ],
    [
      'an admin',
      found({ role: 'admin' }),
      'INVALID_INPUT',
      'That user is an admin, who can already approve submissions.',
    ],
    ['a manager', found({ role: 'manager' }), 'INVALID_INPUT', 'That user is already a manager.'],
  ])('refuses %s and writes nothing', async (_name, row, code, message) => {
    vi.mocked(UserRepository.findRoleByUsername).mockResolvedValueOnce(row);

    await expect(failureOf(ManagerService.grant('fan'))).resolves.toEqual({ code, message });
    expect(UserRepository.setRole).not.toHaveBeenCalled();
  });
});

describe('ManagerService.remove', () => {
  it('returns a manager to the user role', async () => {
    vi.mocked(UserRepository.findRoleByUsername).mockResolvedValueOnce(found({ role: 'manager' }));

    await expect(ManagerService.remove('fan')).resolves.toBeUndefined();
    expect(vi.mocked(UserRepository.setRole).mock.calls).toEqual([[USER_ID, 'user']]);
  });

  it.each([
    ['an unknown username', null, 'NOT_FOUND', 'No user has that username.'],
    ['a plain user', found(), 'INVALID_INPUT', 'That user is not a manager.'],
    ['an admin', found({ role: 'admin' }), 'INVALID_INPUT', 'That user is not a manager.'],
  ])('refuses %s and writes nothing', async (_name, row, code, message) => {
    vi.mocked(UserRepository.findRoleByUsername).mockResolvedValueOnce(row);

    await expect(failureOf(ManagerService.remove('fan'))).resolves.toEqual({ code, message });
    expect(UserRepository.setRole).not.toHaveBeenCalled();
  });
});
