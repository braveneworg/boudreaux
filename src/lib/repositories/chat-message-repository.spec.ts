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
          user: { select: { id: true, username: true, email: true } },
        },
      });
      expect(result).toEqual(stored);
    });
  });

  describe('findRecent', () => {
    it('returns most recent messages with no cursor', async () => {
      const rows = [{ id: 'msg-2' }, { id: 'msg-1' }];
      vi.mocked(prisma.chatMessage.findMany).mockResolvedValue(rows as never);

      const result = await ChatMessageRepository.findRecent({ limit: 20 });

      expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: {
          user: { select: { id: true, username: true, email: true } },
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
            OR: [
              { createdAt: { lt: cursorDate } },
              { createdAt: cursorDate, id: { lt: 'cursor-id' } },
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
        include: { user: { select: { id: true, username: true, email: true } } },
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
});
