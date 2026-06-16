/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const findUniqueMock = vi.fn();
const findManyMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      findMany: findManyMock,
      create: createMock,
      update: updateMock,
    },
  },
}));

const { UserRepository } = await import('./user-repository');

describe('UserRepository', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findManyMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
  });

  describe('findByEmail', () => {
    it('looks up a user by email', async () => {
      const user = { id: 'u1', email: 'a@b.co' };
      findUniqueMock.mockResolvedValue(user);

      await expect(UserRepository.findByEmail('a@b.co')).resolves.toBe(user);
      expect(findUniqueMock).toHaveBeenCalledWith({ where: { email: 'a@b.co' } });
    });
  });

  describe('findIdByEmail', () => {
    it('looks up a user by email selecting only the id', async () => {
      findUniqueMock.mockResolvedValue({ id: 'u1' });

      await expect(UserRepository.findIdByEmail('a@b.co')).resolves.toEqual({ id: 'u1' });
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { email: 'a@b.co' },
        select: { id: true },
      });
    });
  });

  describe('findEmailById', () => {
    it('looks up a user by id selecting only the email', async () => {
      findUniqueMock.mockResolvedValue({ email: 'a@b.co' });

      await expect(UserRepository.findEmailById('u1')).resolves.toEqual({ email: 'a@b.co' });
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { email: true },
      });
    });
  });

  describe('findByUsername', () => {
    it('looks up a user by username selecting id, username and email', async () => {
      const row = { id: 'u1', username: 'alice', email: 'a@b.co' };
      findUniqueMock.mockResolvedValue(row);

      await expect(UserRepository.findByUsername('alice')).resolves.toBe(row);
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { username: 'alice' },
        select: { id: true, username: true, email: true },
      });
    });
  });

  describe('create', () => {
    it('creates a user with the supplied data', async () => {
      const created = { id: 'u1' };
      createMock.mockResolvedValue(created);
      const data = { email: 'a@b.co', name: 'Admin', role: 'admin', emailVerified: new Date() };

      await expect(UserRepository.create(data)).resolves.toBe(created);
      expect(createMock).toHaveBeenCalledWith({ data });
    });
  });

  describe('createGuest', () => {
    it('creates a guest user returning only the id', async () => {
      createMock.mockResolvedValue({ id: 'new-id' });
      const verified = new Date();
      const data = { email: 'g@x.io', emailVerified: verified, username: 'guest-name' };

      await expect(UserRepository.createGuest(data)).resolves.toEqual({ id: 'new-id' });
      expect(createMock).toHaveBeenCalledWith({ data, select: { id: true } });
    });
  });

  describe('updateUsername', () => {
    it('updates the username for the given id', async () => {
      updateMock.mockResolvedValue({ id: 'u1' });

      await UserRepository.updateUsername('u1', 'alice');
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { username: 'alice' },
      });
    });
  });

  describe('searchByUsernamePrefix', () => {
    it('queries by case-insensitive prefix, excludes the caller and caps results', async () => {
      const rows = [{ id: 'u1', username: 'alice' }];
      findManyMock.mockResolvedValue(rows);

      await expect(UserRepository.searchByUsernamePrefix('al', 'me', 8)).resolves.toBe(rows);
      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          username: { startsWith: 'al', mode: 'insensitive' },
          NOT: { id: 'me' },
        },
        select: { id: true, username: true },
        take: 8,
        orderBy: { username: 'asc' },
      });
    });
  });

  describe('findByUsernames', () => {
    it('queries by the supplied usernames and excludes the author', async () => {
      const rows = [{ id: 'u1', username: 'alice', email: 'a@x.com' }];
      findManyMock.mockResolvedValue(rows);

      await expect(UserRepository.findByUsernames(['alice'], 'author-1')).resolves.toBe(rows);
      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          username: { in: ['alice'], mode: 'insensitive' },
          NOT: { id: 'author-1' },
        },
        select: { id: true, username: true, email: true },
      });
    });
  });

  describe('findAdmins', () => {
    it('queries all admin users with notification fields', async () => {
      const rows = [
        {
          id: 'a1',
          email: 'a1@x.com',
          username: 'admin1',
          phone: null,
          allowSmsNotifications: false,
        },
      ];
      findManyMock.mockResolvedValue(rows);

      await expect(UserRepository.findAdmins()).resolves.toBe(rows);
      expect(findManyMock).toHaveBeenCalledWith({
        where: { role: 'admin' },
        select: {
          id: true,
          email: true,
          username: true,
          phone: true,
          allowSmsNotifications: true,
        },
      });
    });
  });
});
