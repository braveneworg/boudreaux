/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { UserService } from './user-service';
import { prisma } from '../prisma';

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('unique-username-generator', () => ({
  generateUsername: vi.fn(() => 'generated-name'),
}));

const knownError = (code: string): PrismaClientKnownRequestError =>
  new PrismaClientKnownRequestError('forced', { code, clientVersion: 'test' });

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
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.create).mockResolvedValue({} as never);

      await UserService.ensureAdminUser(adminData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Admin',
          lastName: 'User',
          phone: '555-0100',
          email: 'admin@example.com',
          name: 'Admin',
          role: 'admin',
          emailVerified: expect.any(Date),
        },
      });
    });

    it('should skip creation when user already exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'existing-user',
        email: 'admin@example.com',
      } as never);

      await UserService.ensureAdminUser(adminData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('delegates to prisma.user.findUnique', async () => {
      const user = { id: 'u1', email: 'a@b.co' };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);

      await expect(UserService.findByEmail('a@b.co')).resolves.toBe(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.co' } });
    });
  });

  describe('findEmailById', () => {
    it('returns the email when the user is found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'user@example.com' } as never);
      await expect(UserService.findEmailById('u1')).resolves.toBe('user@example.com');
    });

    it('returns null when the user has no email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: null } as never);
      await expect(UserService.findEmailById('u1')).resolves.toBeNull();
    });

    it('returns null when the user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
      await expect(UserService.findEmailById('u1')).resolves.toBeNull();
    });
  });

  describe('updateUsername', () => {
    it('returns success when the update succeeds', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as never);
      await expect(UserService.updateUsername('u1', 'alice')).resolves.toEqual({
        success: true,
        duplicate: false,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { username: 'alice' },
      });
    });

    it('returns duplicate when prisma raises P2002', async () => {
      vi.mocked(prisma.user.update).mockRejectedValue(knownError('P2002'));
      await expect(UserService.updateUsername('u1', 'taken')).resolves.toEqual({
        success: false,
        duplicate: true,
      });
    });

    it('rethrows any other Prisma error', async () => {
      vi.mocked(prisma.user.update).mockRejectedValue(knownError('P2025'));
      await expect(UserService.updateUsername('u1', 'x')).rejects.toBeInstanceOf(
        PrismaClientKnownRequestError
      );
    });

    it('rethrows generic errors', async () => {
      vi.mocked(prisma.user.update).mockRejectedValue(new Error('boom'));
      await expect(UserService.updateUsername('u1', 'x')).rejects.toThrow('boom');
    });
  });

  describe('createGuestPurchaser', () => {
    it('returns the new user id when create succeeds', async () => {
      vi.mocked(prisma.user.create).mockResolvedValue({ id: 'new-id' } as never);
      await expect(UserService.createGuestPurchaser('g@x.io')).resolves.toEqual({
        id: 'new-id',
        created: true,
      });
    });

    it('recovers the existing user when create races on P2002', async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(knownError('P2002'));
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'raced-id' } as never);

      await expect(UserService.createGuestPurchaser('g@x.io')).resolves.toEqual({
        id: 'raced-id',
        created: false,
      });
    });

    it('rethrows P2002 when the raced user cannot be recovered', async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(knownError('P2002'));
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      await expect(UserService.createGuestPurchaser('g@x.io')).rejects.toBeInstanceOf(
        PrismaClientKnownRequestError
      );
    });

    it('rethrows non-P2002 Prisma errors', async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(knownError('P2025'));
      await expect(UserService.createGuestPurchaser('g@x.io')).rejects.toBeInstanceOf(
        PrismaClientKnownRequestError
      );
    });

    it('rethrows generic errors', async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(new Error('db down'));
      await expect(UserService.createGuestPurchaser('g@x.io')).rejects.toThrow('db down');
    });
  });
});
