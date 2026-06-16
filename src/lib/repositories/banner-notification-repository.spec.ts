/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';

import { BannerNotificationRepository } from './banner-notification-repository';

import type { BannerNotification } from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    bannerNotification: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const mockFindMany = vi.mocked(prisma.bannerNotification.findMany);
const mockUpsert = vi.mocked(prisma.bannerNotification.upsert);
const mockDelete = vi.mocked(prisma.bannerNotification.delete);

const mockNotification: BannerNotification = {
  id: 'notif-1',
  slotNumber: 1,
  content: 'Test banner content',
  textColor: '#ffffff',
  backgroundColor: '#000000',
  displayFrom: new Date('2026-04-01T00:00:00.000Z'),
  displayUntil: new Date('2026-04-30T23:59:59.000Z'),
  repostedFromId: null,
  addedById: 'user-1',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

describe('BannerNotificationRepository', () => {
  describe('findAllOrderedBySlot', () => {
    it('returns notifications ordered by slotNumber ascending', async () => {
      mockFindMany.mockResolvedValue([mockNotification]);

      const result = await BannerNotificationRepository.findAllOrderedBySlot();

      expect(result).toEqual([mockNotification]);
      expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { slotNumber: 'asc' } });
    });
  });

  describe('searchByContent', () => {
    it('performs a case-insensitive contains match when a query is given', async () => {
      mockFindMany.mockResolvedValue([mockNotification]);

      const result = await BannerNotificationRepository.searchByContent('test', 20);

      expect(result).toEqual([mockNotification]);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: { content: { contains: 'test', mode: 'insensitive' } },
        select: {
          id: true,
          content: true,
          textColor: true,
          backgroundColor: true,
          slotNumber: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });

    it('returns non-null content rows when query is empty', async () => {
      mockFindMany.mockResolvedValue([mockNotification]);

      await BannerNotificationRepository.searchByContent('', 20);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { content: { not: null } },
        select: {
          id: true,
          content: true,
          textColor: true,
          backgroundColor: true,
          slotNumber: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });

    it('forwards the take parameter', async () => {
      mockFindMany.mockResolvedValue([]);

      await BannerNotificationRepository.searchByContent('test', 5);

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  describe('upsertBySlot', () => {
    const data = {
      content: 'Updated content',
      textColor: '#ff0000',
      backgroundColor: '#00ff00',
      displayFrom: new Date('2026-04-01T00:00:00.000Z'),
      displayUntil: new Date('2026-04-30T23:59:59.000Z'),
      repostedFromId: null,
      addedById: 'user-1',
    };

    it('upserts the notification keyed by slotNumber', async () => {
      const upserted = { ...mockNotification, ...data };
      mockUpsert.mockResolvedValue(upserted);

      const result = await BannerNotificationRepository.upsertBySlot(1, data);

      expect(result).toEqual(upserted);
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { slotNumber: 1 },
        update: {
          content: data.content,
          textColor: data.textColor,
          backgroundColor: data.backgroundColor,
          displayFrom: data.displayFrom,
          displayUntil: data.displayUntil,
          repostedFromId: data.repostedFromId,
          addedById: data.addedById,
        },
        create: {
          slotNumber: 1,
          content: data.content,
          textColor: data.textColor,
          backgroundColor: data.backgroundColor,
          displayFrom: data.displayFrom,
          displayUntil: data.displayUntil,
          repostedFromId: data.repostedFromId,
          addedById: data.addedById,
        },
      });
    });
  });

  describe('deleteBySlot', () => {
    it('deletes the notification by slotNumber', async () => {
      mockDelete.mockResolvedValue(mockNotification);

      const result = await BannerNotificationRepository.deleteBySlot(1);

      expect(result).toEqual(mockNotification);
      expect(mockDelete).toHaveBeenCalledWith({ where: { slotNumber: 1 } });
    });
  });
});
