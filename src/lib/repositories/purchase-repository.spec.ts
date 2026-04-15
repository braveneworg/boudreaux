/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';

import { PurchaseRepository } from './purchase-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    releasePurchase: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    releaseDownload: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('PurchaseRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should call prisma.releasePurchase.create with the provided data', async () => {
      const createData = {
        userId: 'user-123',
        releaseId: 'release-abc',
        amountPaid: 500,
        currency: 'usd',
        stripePaymentIntentId: 'pi_test_123',
        stripeSessionId: 'cs_test_456',
      };
      const mockRecord = { id: 'purchase-1', ...createData };
      vi.mocked(prisma.releasePurchase.create).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.create(createData);

      expect(prisma.releasePurchase.create).toHaveBeenCalledWith({
        data: { ...createData, confirmationEmailSentAt: null, refundedAt: null },
      });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('findByPaymentIntentId', () => {
    it('should call prisma.releasePurchase.findUnique with the paymentIntentId and return the result', async () => {
      const mockRecord = { id: 'purchase-1', stripePaymentIntentId: 'pi_test_123' };
      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.findByPaymentIntentId('pi_test_123');

      expect(prisma.releasePurchase.findUnique).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: 'pi_test_123' },
      });
      expect(result).toEqual(mockRecord);
    });

    it('should return null when no matching record exists', async () => {
      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(null);

      const result = await PurchaseRepository.findByPaymentIntentId('pi_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findBySessionId', () => {
    it('should call prisma.releasePurchase.findUnique with the sessionId and return the result', async () => {
      const mockRecord = { id: 'purchase-1', stripeSessionId: 'cs_test_123' };
      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.findBySessionId('cs_test_123');

      expect(prisma.releasePurchase.findUnique).toHaveBeenCalledWith({
        where: { stripeSessionId: 'cs_test_123' },
      });
      expect(result).toEqual(mockRecord);
    });

    it('should return null when no matching record exists', async () => {
      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(null);

      const result = await PurchaseRepository.findBySessionId('cs_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUserAndRelease', () => {
    it('should call prisma.releasePurchase.findFirst with userId, releaseId, and refundedAt null filter', async () => {
      const mockRecord = { id: 'purchase-1', userId: 'user-123', releaseId: 'release-abc' };
      vi.mocked(prisma.releasePurchase.findFirst).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.findByUserAndRelease('user-123', 'release-abc');

      expect(prisma.releasePurchase.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          releaseId: 'release-abc',
          OR: [{ refundedAt: null }, { refundedAt: { isSet: false } }],
        },
      });
      expect(result).toEqual(mockRecord);
    });

    it('should return null when no matching purchase exists', async () => {
      vi.mocked(prisma.releasePurchase.findFirst).mockResolvedValue(null);

      const result = await PurchaseRepository.findByUserAndRelease('user-123', 'release-xyz');

      expect(result).toBeNull();
    });
  });

  describe('getDownloadRecord', () => {
    it('should call prisma.releaseDownload.findUnique with the userId+releaseId composite key', async () => {
      const mockRecord = {
        id: 'dl-1',
        userId: 'user-123',
        releaseId: 'release-abc',
        downloadCount: 2,
        lastDownloadedAt: new Date(),
      };
      vi.mocked(prisma.releaseDownload.findUnique).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.getDownloadRecord('user-123', 'release-abc');

      expect(prisma.releaseDownload.findUnique).toHaveBeenCalledWith({
        where: { userId_releaseId: { userId: 'user-123', releaseId: 'release-abc' } },
      });
      expect(result).toEqual(mockRecord);
    });

    it('should return null when no download record exists', async () => {
      vi.mocked(prisma.releaseDownload.findUnique).mockResolvedValue(null);

      const result = await PurchaseRepository.getDownloadRecord('user-123', 'release-abc');

      expect(result).toBeNull();
    });
  });

  describe('upsertDownloadCount', () => {
    it('should call prisma.releaseDownload.upsert with increment update and create with count 1', async () => {
      const mockRecord = {
        id: 'dl-1',
        userId: 'user-123',
        releaseId: 'release-abc',
        downloadCount: 3,
        lastDownloadedAt: new Date(),
      };
      vi.mocked(prisma.releaseDownload.upsert).mockResolvedValue(mockRecord as never);

      await PurchaseRepository.upsertDownloadCount('user-123', 'release-abc');

      expect(prisma.releaseDownload.upsert).toHaveBeenCalledWith({
        where: { userId_releaseId: { userId: 'user-123', releaseId: 'release-abc' } },
        update: {
          downloadCount: { increment: 1 },
          lastDownloadedAt: expect.any(Date),
        },
        create: {
          userId: 'user-123',
          releaseId: 'release-abc',
          downloadCount: 1,
          lastDownloadedAt: expect.any(Date),
        },
      });
    });
  });

  describe('markEmailSent', () => {
    it('should return true when updateMany sets the flag on exactly one record', async () => {
      vi.mocked(prisma.releasePurchase.updateMany).mockResolvedValue({ count: 1 } as never);

      const result = await PurchaseRepository.markEmailSent('purchase-1');

      expect(prisma.releasePurchase.updateMany).toHaveBeenCalledWith({
        where: { id: 'purchase-1', confirmationEmailSentAt: null },
        data: { confirmationEmailSentAt: expect.any(Date) },
      });
      expect(result).toBe(true);
    });

    it('should return false when updateMany matches zero records (email already sent)', async () => {
      vi.mocked(prisma.releasePurchase.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await PurchaseRepository.markEmailSent('purchase-1');

      expect(result).toBe(false);
    });
  });

  describe('findAllByUser', () => {
    it('should call prisma.releasePurchase.findMany with the userId and include release details', async () => {
      const mockRecords = [
        {
          id: 'purchase-1',
          userId: 'user-123',
          releaseId: 'release-abc',
          release: { id: 'release-abc', title: 'Test Album' },
        },
      ];
      vi.mocked(prisma.releasePurchase.findMany).mockResolvedValue(mockRecords as never);

      const result = await PurchaseRepository.findAllByUser('user-123');

      expect(prisma.releasePurchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
          orderBy: { purchasedAt: 'desc' },
          include: expect.objectContaining({
            release: expect.objectContaining({
              select: expect.objectContaining({
                digitalFormats: expect.objectContaining({
                  where: expect.objectContaining({
                    AND: expect.arrayContaining([
                      expect.objectContaining({
                        OR: expect.arrayContaining([
                          { files: { some: {} } },
                          expect.objectContaining({
                            AND: expect.arrayContaining([{ fileName: { not: null } }]),
                          }),
                        ]),
                      }),
                    ]),
                  }),
                  select: expect.objectContaining({
                    formatType: true,
                    fileName: true,
                  }),
                }),
              }),
            }),
          }),
        })
      );
      expect(result).toEqual(mockRecords);
    });

    it('should return empty array when user has no purchases', async () => {
      vi.mocked(prisma.releasePurchase.findMany).mockResolvedValue([]);

      const result = await PurchaseRepository.findAllByUser('user-no-purchases');

      expect(result).toEqual([]);
    });
  });

  describe('deleteById', () => {
    it('should call prisma.releasePurchase.delete with the purchase id', async () => {
      const mockRecord = { id: 'purchase-1', userId: 'user-123' };
      vi.mocked(prisma.releasePurchase.delete).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.deleteById('purchase-1');

      expect(prisma.releasePurchase.delete).toHaveBeenCalledWith({
        where: { id: 'purchase-1' },
      });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('findUserByEmail', () => {
    it('should call prisma.user.findUnique with the email and select only the id field', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-123' } as never);

      const result = await PurchaseRepository.findUserByEmail('test@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'user-123' });
    });

    it('should return null when no user matches the email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const result = await PurchaseRepository.findUserByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('resetDownloadCount', () => {
    it('should call prisma.releaseDownload.update with count 0 and new lastDownloadedAt', async () => {
      const mockRecord = {
        id: 'dl-1',
        userId: 'user-123',
        releaseId: 'release-abc',
        downloadCount: 0,
        lastDownloadedAt: new Date(),
      };
      vi.mocked(prisma.releaseDownload.update).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.resetDownloadCount('user-123', 'release-abc');

      expect(prisma.releaseDownload.update).toHaveBeenCalledWith({
        where: { userId_releaseId: { userId: 'user-123', releaseId: 'release-abc' } },
        data: { downloadCount: 0, lastDownloadedAt: expect.any(Date) },
      });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('updateSessionId', () => {
    it('should call prisma.releasePurchase.update with the new sessionId', async () => {
      const mockRecord = { id: 'purchase-1', stripeSessionId: 'cs_new_session' };
      vi.mocked(prisma.releasePurchase.update).mockResolvedValue(mockRecord as never);

      const result = await PurchaseRepository.updateSessionId('purchase-1', 'cs_new_session');

      expect(prisma.releasePurchase.update).toHaveBeenCalledWith({
        where: { id: 'purchase-1' },
        data: { stripeSessionId: 'cs_new_session' },
      });
      expect(result).toEqual(mockRecord);
    });
  });

  describe('resetEmailSent', () => {
    it('should call prisma.releasePurchase.updateMany to set confirmationEmailSentAt to null', async () => {
      vi.mocked(prisma.releasePurchase.updateMany).mockResolvedValue({ count: 1 } as never);

      await PurchaseRepository.resetEmailSent('purchase-1');

      expect(prisma.releasePurchase.updateMany).toHaveBeenCalledWith({
        where: { id: 'purchase-1' },
        data: { confirmationEmailSentAt: null },
      });
    });
  });

  describe('markRefunded', () => {
    it('should return true when updateMany marks exactly one record as refunded', async () => {
      vi.mocked(prisma.releasePurchase.updateMany).mockResolvedValue({ count: 1 } as never);

      const result = await PurchaseRepository.markRefunded('pi_test_123');

      expect(prisma.releasePurchase.updateMany).toHaveBeenCalledWith({
        where: {
          stripePaymentIntentId: 'pi_test_123',
          OR: [{ refundedAt: null }, { refundedAt: { isSet: false } }],
        },
        data: { refundedAt: expect.any(Date) },
      });
      expect(result).toBe(true);
    });

    it('should return false when updateMany matches zero records (already refunded)', async () => {
      vi.mocked(prisma.releasePurchase.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await PurchaseRepository.markRefunded('pi_test_123');

      expect(result).toBe(false);
    });
  });
});
