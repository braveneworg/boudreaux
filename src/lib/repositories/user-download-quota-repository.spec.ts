/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { UserDownloadQuotaRepository } from './user-download-quota-repository';

import type { UserDownloadQuota } from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userDownloadQuota: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('UserDownloadQuotaRepository', () => {
  let repo: UserDownloadQuotaRepository;

  const mockUserId = 'user-123';
  const mockReleaseId = 'release-456';

  function createMockQuota(overrides?: Partial<UserDownloadQuota>): UserDownloadQuota {
    return {
      id: 'quota-1',
      userId: mockUserId,
      uniqueReleaseIds: ['release-1', 'release-2'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  const mockQuota = createMockQuota();

  beforeEach(() => {
    repo = new UserDownloadQuotaRepository();
  });

  describe('findOrCreateByUserId', () => {
    it('should return existing quota record', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const result = await repo.findOrCreateByUserId(mockUserId);

      expect(result).toEqual(mockQuota);
      expect(prisma.userDownloadQuota.findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
      });
      expect(prisma.userDownloadQuota.create).not.toHaveBeenCalled();
    });

    it('should create new quota record if none exists', async () => {
      const newQuota = createMockQuota({ id: 'new-1', uniqueReleaseIds: [] });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDownloadQuota.create).mockResolvedValue(newQuota);

      const result = await repo.findOrCreateByUserId(mockUserId);

      expect(result).toEqual(newQuota);
      expect(prisma.userDownloadQuota.create).toHaveBeenCalledWith({
        data: { userId: mockUserId, uniqueReleaseIds: [] },
      });
    });
  });

  describe('addUniqueRelease', () => {
    it('should atomically add release ID to quota', async () => {
      const updatedQuota = createMockQuota({
        uniqueReleaseIds: [...mockQuota.uniqueReleaseIds, mockReleaseId],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);
      vi.mocked(prisma.userDownloadQuota.update).mockResolvedValue(updatedQuota);

      const result = await repo.addUniqueRelease(mockUserId, mockReleaseId);

      expect(result.uniqueReleaseIds).toContain(mockReleaseId);
      expect(prisma.userDownloadQuota.update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { uniqueReleaseIds: { push: mockReleaseId } },
      });
    });

    it('should create quota record if it does not exist before adding', async () => {
      const newQuota = createMockQuota({ id: 'new-1', uniqueReleaseIds: [] });
      const updatedQuota = createMockQuota({
        id: 'new-1',
        uniqueReleaseIds: [mockReleaseId],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDownloadQuota.create).mockResolvedValue(newQuota);
      vi.mocked(prisma.userDownloadQuota.update).mockResolvedValue(updatedQuota);

      const result = await repo.addUniqueRelease(mockUserId, mockReleaseId);

      expect(prisma.userDownloadQuota.create).toHaveBeenCalled();
      expect(result.uniqueReleaseIds).toContain(mockReleaseId);
    });
  });

  describe('checkQuotaExceeded', () => {
    it('should return false when under quota', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const exceeded = await repo.checkQuotaExceeded(mockUserId, 5);

      expect(exceeded).toBe(false);
    });

    it('should return true when at quota limit', async () => {
      const fullQuota = createMockQuota({
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(fullQuota);

      const exceeded = await repo.checkQuotaExceeded(mockUserId, 5);

      expect(exceeded).toBe(true);
    });

    it('should return true when over quota limit', async () => {
      const overQuota = createMockQuota({
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(overQuota);

      const exceeded = await repo.checkQuotaExceeded(mockUserId, 5);

      expect(exceeded).toBe(true);
    });

    it('should use default quota of 5', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const exceeded = await repo.checkQuotaExceeded(mockUserId);

      expect(exceeded).toBe(false);
    });
  });

  describe('getRemainingQuota', () => {
    it('should return correct remaining quota', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const remaining = await repo.getRemainingQuota(mockUserId, 5);

      expect(remaining).toBe(3);
    });

    it('should return 0 when quota is fully used', async () => {
      const fullQuota = createMockQuota({
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(fullQuota);

      const remaining = await repo.getRemainingQuota(mockUserId, 5);

      expect(remaining).toBe(0);
    });

    it('should never return negative values', async () => {
      const overQuota = createMockQuota({
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(overQuota);

      const remaining = await repo.getRemainingQuota(mockUserId, 5);

      expect(remaining).toBe(0);
    });
  });

  describe('hasDownloadedRelease', () => {
    it('should return true if release is in uniqueReleaseIds', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const result = await repo.hasDownloadedRelease(mockUserId, 'release-1');

      expect(result).toBe(true);
    });

    it('should return false if release is not in uniqueReleaseIds', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const result = await repo.hasDownloadedRelease(mockUserId, 'release-999');

      expect(result).toBe(false);
    });
  });

  describe('getDownloadedReleaseIds', () => {
    it('should return array of downloaded release IDs', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(mockQuota);

      const result = await repo.getDownloadedReleaseIds(mockUserId);

      expect(result).toEqual(['release-1', 'release-2']);
    });

    it('should return empty array for new user', async () => {
      const emptyQuota = createMockQuota({ uniqueReleaseIds: [] });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(emptyQuota);

      const result = await repo.getDownloadedReleaseIds(mockUserId);

      expect(result).toEqual([]);
    });
  });
});
