/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { ChatMessageRepository } from './chat-message-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('ChatMessageRepository', () => {
  describe('create', () => {
    it('creates a message with the author and an empty reactions array', async () => {
      const stored = { id: 'msg-1', userId: 'user-1', body: 'hi', reactions: [] };
      vi.mocked(prisma.chatMessage.create).mockResolvedValue(stored as never);

      const result = await ChatMessageRepository.create({ userId: 'user-1', body: 'hi' });

      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', body: 'hi', reactions: [] },
        include: {
          user: { select: { id: true, username: true, email: true, role: true } },
        },
      });
      expect(result).toEqual(stored);
    });
  });

  describe('findRecent', () => {
    const activeBan = { OR: [{ unbannedAt: null }, { unbannedAt: { isSet: false } }] };
    const baseAnd = [
      { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
      {
        user: {
          is: {
            chatUsers: { none: { disabled: true } },
            bannedIdentities: { none: activeBan },
          },
        },
      },
    ];

    it('treats missing hiddenAt as not-hidden and excludes disabled/banned authors', async () => {
      const rows = [{ id: 'msg-2' }, { id: 'msg-1' }];
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue(rows as never);

      const result = await ChatMessageRepository.findRecent({ limit: 20 });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { AND: baseAnd },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: {
          user: { select: { id: true, username: true, email: true, role: true } },
        },
      });
      expect(result).toEqual(rows);
    });

    it('applies a cursor with id-tiebreaker for messages older than the cursor', async () => {
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never);
      const cursorDate = new Date('2026-05-01T12:00:00Z');

      await ChatMessageRepository.findRecent({
        limit: 20,
        cursor: { createdAt: cursorDate, id: 'cursor-id' },
      });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { createdAt: { lt: cursorDate } },
                  { createdAt: cursorDate, id: { lt: 'cursor-id' } },
                ],
              },
              ...baseAnd,
            ],
          },
        })
      );
    });
  });

  describe('findById', () => {
    it('looks up a message by id', async () => {
      vi.mocked(prisma.chatMessage.findUnique).mockResolvedValue({ id: 'msg-1' } as never);

      const result = await ChatMessageRepository.findById('msg-1');

      expect(prisma.chatMessage.findUnique).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        include: { user: { select: { id: true, username: true, email: true, role: true } } },
      });
      expect(result).toEqual({ id: 'msg-1' });
    });

    it('returns null when the message is not found', async () => {
      vi.mocked(prisma.chatMessage.findUnique).mockResolvedValue(null);

      const result = await ChatMessageRepository.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('paginates a single user’s messages newest-first', async () => {
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never);

      await ChatMessageRepository.findByUserId({ userId: 'user-1', skip: 50, take: 50 });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 50,
        take: 50,
      });
    });
  });

  describe('setReactions', () => {
    it('overwrites the reactions array for the given message', async () => {
      vi.mocked(prisma.chatMessage.update).mockResolvedValue({ id: 'msg-1' } as never);
      const reactions = [{ emoji: '🔥', userIds: ['abcdef1234567890abcdef12'] }];

      await ChatMessageRepository.setReactions('msg-1', reactions);

      expect(prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { reactions },
      });
    });
  });

  describe('hideAsAdminFlagged', () => {
    it('stamps hiddenAt and the admin attribution', async () => {
      vi.mocked(prisma.chatMessage.update).mockResolvedValue({ id: 'msg-1' } as never);
      await ChatMessageRepository.hideAsAdminFlagged({
        messageId: 'msg-1',
        adminId: 'admin-1',
      });
      const call = vi.mocked(prisma.chatMessage.update).mock.calls.at(-1)?.[0];
      expect(call?.where).toEqual({ id: 'msg-1' });
      expect(call?.data?.hiddenByAdminId).toBe('admin-1');
      expect(call?.data?.hiddenReason).toBe('admin_flagged');
      expect(call?.data?.hiddenAt).toBeInstanceOf(Date);
    });
  });

  describe('unhide', () => {
    it('clears every hide field so the message is visible again', async () => {
      vi.mocked(prisma.chatMessage.update).mockResolvedValue({ id: 'msg-1' } as never);
      await ChatMessageRepository.unhide('msg-1');
      expect(prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { hiddenAt: null, hiddenByAdminId: null, hiddenReason: null },
      });
    });
  });

  describe('hideAllByUserAsAdminFlagged', () => {
    it('targets only this author and skips already-hidden rows', async () => {
      vi.mocked(prisma.chatMessage.updateMany).mockResolvedValue({ count: 4 } as never);
      await ChatMessageRepository.hideAllByUserAsAdminFlagged({
        userId: 'user-1',
        adminId: 'admin-1',
      });
      const call = vi.mocked(prisma.chatMessage.updateMany).mock.calls.at(-1)?.[0];
      expect(call?.where).toEqual({
        userId: 'user-1',
        OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }],
      });
      expect(call?.data?.hiddenByAdminId).toBe('admin-1');
      expect(call?.data?.hiddenReason).toBe('admin_flagged');
      expect(call?.data?.hiddenAt).toBeInstanceOf(Date);
    });
  });

  describe('findVisibleIdsByUser', () => {
    it('selects only id fields and excludes hidden rows', async () => {
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([{ id: 'a' }, { id: 'b' }] as never);
      const result = await ChatMessageRepository.findVisibleIdsByUser('user-1');
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }],
        },
        select: { id: true },
      });
      expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
    });
  });

  describe('findByUserIdForAdmin', () => {
    it('returns every message by the user (hidden or not), newest first', async () => {
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never);
      await ChatMessageRepository.findByUserIdForAdmin({ userId: 'user-1', skip: 10, take: 5 });
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 10,
        take: 5,
      });
    });
  });

  describe('pin', () => {
    it('stamps pinnedAt and the admin attribution', async () => {
      vi.mocked(prisma.chatMessage.update).mockResolvedValue({ id: 'msg-1' } as never);
      await ChatMessageRepository.pin({ messageId: 'msg-1', adminId: 'admin-1' });
      const call = vi.mocked(prisma.chatMessage.update).mock.calls.at(-1)?.[0];
      expect(call?.where).toEqual({ id: 'msg-1' });
      expect(call?.data?.pinnedByAdminId).toBe('admin-1');
      expect(call?.data?.pinnedAt).toBeInstanceOf(Date);
      expect(call?.include).toEqual({
        user: { select: { id: true, username: true, email: true, role: true } },
      });
    });
  });

  describe('unpin', () => {
    it('clears the pin metadata', async () => {
      vi.mocked(prisma.chatMessage.update).mockResolvedValue({ id: 'msg-1' } as never);
      await ChatMessageRepository.unpin('msg-1');
      expect(prisma.chatMessage.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: { pinnedAt: null, pinnedByAdminId: null },
        include: { user: { select: { id: true, username: true, email: true, role: true } } },
      });
    });
  });

  describe('findPinned', () => {
    it('orders pinned rows by pinnedAt desc and excludes hidden ones', async () => {
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never);
      await ChatMessageRepository.findPinned();
      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { OR: [{ pinnedAt: { not: null } }] },
            { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
          ],
        },
        orderBy: [{ pinnedAt: 'desc' }],
        include: { user: { select: { id: true, username: true, email: true, role: true } } },
      });
    });
  });

  describe('countPinned', () => {
    it('counts pinned, non-hidden rows', async () => {
      vi.mocked(prisma.chatMessage.count).mockResolvedValue(2 as never);
      const result = await ChatMessageRepository.countPinned();
      expect(prisma.chatMessage.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { pinnedAt: { not: null } },
            { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
          ],
        },
      });
      expect(result).toBe(2);
    });
  });
});
