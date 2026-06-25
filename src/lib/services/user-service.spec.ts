/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UserRepository } from '@/lib/repositories/user-repository';
import { DataError, type DataErrorCode } from '@/lib/types/domain/errors';

import { UserService } from './user-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    findByEmail: vi.fn(),
    findIdByEmail: vi.fn(),
    findEmailById: vi.fn(),
    create: vi.fn(),
    createGuest: vi.fn(),
    updateUsername: vi.fn(),
  },
}));

vi.mock('unique-username-generator', () => ({
  generateUsername: vi.fn(() => 'generated-name'),
}));

const dataError = (code: DataErrorCode): DataError => new DataError(code, 'forced');

describe('UserService', () => {
  describe('ensureAdminUser', () => {
    const adminData = {
      firstName: 'Admin',
      lastName: 'User',
      phone: '555-0100',
      email: 'admin@example.com',
      role: 'admin',
    };

    it('should create admin user when user does not exist', async () => {
      vi.mocked(UserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(UserRepository.create).mockResolvedValue({} as never);

      await UserService.ensureAdminUser(adminData);

      expect(UserRepository.findByEmail).toHaveBeenCalledWith('admin@example.com');
      expect(UserRepository.create).toHaveBeenCalledWith({
        firstName: 'Admin',
        lastName: 'User',
        phone: '555-0100',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        emailVerified: true,
      });
    });

    it('should skip creation when user already exists', async () => {
      vi.mocked(UserRepository.findByEmail).mockResolvedValue({
        id: 'existing-user',
        email: 'admin@example.com',
      } as never);

      await UserService.ensureAdminUser(adminData);

      expect(UserRepository.findByEmail).toHaveBeenCalledWith('admin@example.com');
      expect(UserRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('delegates to UserRepository.findByEmail', async () => {
      const user = { id: 'u1', email: 'a@b.co' };
      vi.mocked(UserRepository.findByEmail).mockResolvedValue(user as never);

      await expect(UserService.findByEmail('a@b.co')).resolves.toBe(user);
      expect(UserRepository.findByEmail).toHaveBeenCalledWith('a@b.co');
    });
  });

  describe('findEmailById', () => {
    it('returns the email when the user is found', async () => {
      vi.mocked(UserRepository.findEmailById).mockResolvedValue({ email: 'user@example.com' });
      await expect(UserService.findEmailById('u1')).resolves.toBe('user@example.com');
    });

    it('returns null when the user has no email', async () => {
      vi.mocked(UserRepository.findEmailById).mockResolvedValue({ email: null });
      await expect(UserService.findEmailById('u1')).resolves.toBeNull();
    });

    it('returns null when the user does not exist', async () => {
      vi.mocked(UserRepository.findEmailById).mockResolvedValue(null);
      await expect(UserService.findEmailById('u1')).resolves.toBeNull();
    });
  });

  describe('updateUsername', () => {
    it('returns success when the update succeeds', async () => {
      vi.mocked(UserRepository.updateUsername).mockResolvedValue({} as never);
      await expect(UserService.updateUsername('u1', 'alice')).resolves.toEqual({
        success: true,
        duplicate: false,
      });
      expect(UserRepository.updateUsername).toHaveBeenCalledWith('u1', 'alice');
    });

    it('returns duplicate when the repository raises a DUPLICATE DataError', async () => {
      vi.mocked(UserRepository.updateUsername).mockRejectedValue(dataError('DUPLICATE'));
      await expect(UserService.updateUsername('u1', 'taken')).resolves.toEqual({
        success: false,
        duplicate: true,
      });
    });

    it('rethrows any other DataError', async () => {
      vi.mocked(UserRepository.updateUsername).mockRejectedValue(dataError('NOT_FOUND'));
      await expect(UserService.updateUsername('u1', 'x')).rejects.toBeInstanceOf(DataError);
    });

    it('rethrows generic errors', async () => {
      vi.mocked(UserRepository.updateUsername).mockRejectedValue(new Error('boom'));
      await expect(UserService.updateUsername('u1', 'x')).rejects.toThrow('boom');
    });
  });

  describe('createGuestPurchaser', () => {
    it('returns the new user id when create succeeds', async () => {
      vi.mocked(UserRepository.createGuest).mockResolvedValue({ id: 'new-id' });
      await expect(UserService.createGuestPurchaser('g@x.io')).resolves.toEqual({
        id: 'new-id',
        created: true,
      });
    });

    it('recovers the existing user when create races on a DUPLICATE DataError', async () => {
      vi.mocked(UserRepository.createGuest).mockRejectedValue(dataError('DUPLICATE'));
      vi.mocked(UserRepository.findIdByEmail).mockResolvedValue({ id: 'raced-id' });

      await expect(UserService.createGuestPurchaser('g@x.io')).resolves.toEqual({
        id: 'raced-id',
        created: false,
      });
    });

    it('rethrows DUPLICATE when the raced user cannot be recovered', async () => {
      vi.mocked(UserRepository.createGuest).mockRejectedValue(dataError('DUPLICATE'));
      vi.mocked(UserRepository.findIdByEmail).mockResolvedValue(null);

      await expect(UserService.createGuestPurchaser('g@x.io')).rejects.toBeInstanceOf(DataError);
    });

    it('rethrows non-DUPLICATE DataErrors', async () => {
      vi.mocked(UserRepository.createGuest).mockRejectedValue(dataError('NOT_FOUND'));
      await expect(UserService.createGuestPurchaser('g@x.io')).rejects.toBeInstanceOf(DataError);
    });

    it('rethrows generic errors', async () => {
      vi.mocked(UserRepository.createGuest).mockRejectedValue(new Error('db down'));
      await expect(UserService.createGuestPurchaser('g@x.io')).rejects.toThrow('db down');
    });
  });
});
