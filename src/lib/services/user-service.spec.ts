/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { UserService } from './user-service';
import { prisma } from '../prisma';

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
