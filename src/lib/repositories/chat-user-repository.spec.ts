/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { ChatUserRepository } from './chat-user-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatUser: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('ChatUserRepository', () => {
  describe('upsert', () => {
    it('refreshes fingerprint and IP on update; creates with the same values', async () => {
      vi.mocked(prisma.chatUser.upsert).mockResolvedValue({ id: 'cu-1' } as never);

      await ChatUserRepository.upsert({
        userId: 'user-1',
        fingerprint: 'fp-abc',
        ipAddress: '203.0.113.5',
      });

      expect(prisma.chatUser.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        update: { fingerprint: 'fp-abc', ipAddress: '203.0.113.5' },
        create: { userId: 'user-1', fingerprint: 'fp-abc', ipAddress: '203.0.113.5' },
      });
    });
  });

  describe('findByUserId', () => {
    it('looks up by the parent userId', async () => {
      vi.mocked(prisma.chatUser.findUnique).mockResolvedValue({ id: 'cu-1' } as never);

      await ChatUserRepository.findByUserId('user-1');

      expect(prisma.chatUser.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('returns null when no row exists', async () => {
      vi.mocked(prisma.chatUser.findUnique).mockResolvedValue(null);

      const result = await ChatUserRepository.findByUserId('user-missing');

      expect(result).toBeNull();
    });
  });

  describe('incrementMessageCount', () => {
    it('issues a Prisma increment on the message count', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.incrementMessageCount('user-1');

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { messageCount: { increment: 1 } },
      });
    });
  });

  describe('setFlagged', () => {
    it('sets the flagged column to true', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.setFlagged('user-1', true);

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { flagged: true },
      });
    });

    it('can clear the flagged column', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.setFlagged('user-1', false);

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { flagged: false },
      });
    });
  });

  describe('setDisabled', () => {
    it('toggles the disabled gate', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.setDisabled('user-1', true);

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { disabled: true },
      });
    });
  });

  describe('disableWithAudit', () => {
    it('records the admin id and stated reason', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.disableWithAudit({
        userId: 'user-1',
        adminId: 'admin-1',
        reason: 'spam',
      });

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          disabled: true,
          disabledByAdminId: 'admin-1',
          disabledReason: 'spam',
        }),
      });
    });

    it('stores null when no reason is supplied', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.disableWithAudit({ userId: 'user-1', adminId: 'admin-1' });

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: expect.objectContaining({ disabledReason: null }),
      });
    });
  });

  describe('enableWithAudit', () => {
    it('clears every disable-audit field', async () => {
      vi.mocked(prisma.chatUser.update).mockResolvedValue({} as never);

      await ChatUserRepository.enableWithAudit('user-1');

      expect(prisma.chatUser.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: {
          disabled: false,
          disabledAt: null,
          disabledByAdminId: null,
          disabledReason: null,
        },
      });
    });
  });

  describe('findManyPaginated', () => {
    it('orders by the requested column and direction with the requested page window', async () => {
      vi.mocked(prisma.chatUser.findMany).mockResolvedValue([] as never);

      await ChatUserRepository.findManyPaginated({
        skip: 50,
        take: 50,
        sortBy: 'messageCount',
        sortDirection: 'desc',
      });

      expect(prisma.chatUser.findMany).toHaveBeenCalledWith({
        orderBy: { messageCount: 'desc' },
        skip: 50,
        take: 50,
        include: {
          user: { select: { id: true, username: true, email: true } },
        },
      });
    });
  });

  describe('count', () => {
    it('returns the total ChatUser row count', async () => {
      vi.mocked(prisma.chatUser.count).mockResolvedValue(123);

      const result = await ChatUserRepository.count();

      expect(result).toBe(123);
    });
  });
});
