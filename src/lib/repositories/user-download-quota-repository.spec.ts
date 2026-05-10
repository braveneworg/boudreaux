/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';
import type { DownloadSubject } from '@/types/download-subject';

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

  const userSubject: DownloadSubject = { kind: 'user', userId: 'user-123' };
  const guestSubject: DownloadSubject = {
    kind: 'guest',
    visitorId: 'visitor-abc',
  };
  const mockReleaseId = 'release-456';

  function createUserQuota(overrides?: Partial<UserDownloadQuota>): UserDownloadQuota {
    return {
      id: 'quota-1',
      userId: 'user-123',
      visitorId: null,
      uniqueReleaseIds: ['release-1', 'release-2'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as UserDownloadQuota;
  }

  function createGuestQuota(overrides?: Partial<UserDownloadQuota>): UserDownloadQuota {
    return {
      id: 'quota-g1',
      userId: null,
      visitorId: 'visitor-abc',
      uniqueReleaseIds: ['release-1'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as UserDownloadQuota;
  }

  beforeEach(() => {
    repo = new UserDownloadQuotaRepository();
    vi.mocked(prisma.userDownloadQuota.findUnique).mockReset();
    vi.mocked(prisma.userDownloadQuota.create).mockReset();
    vi.mocked(prisma.userDownloadQuota.update).mockReset();
  });

  describe('findOrCreateBySubject', () => {
    it('returns existing user quota keyed by userId', async () => {
      const existing = createUserQuota();
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(existing);

      const result = await repo.findOrCreateBySubject(userSubject);

      expect(result).toEqual(existing);
      expect(prisma.userDownloadQuota.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
      expect(prisma.userDownloadQuota.create).not.toHaveBeenCalled();
    });

    it('returns existing guest quota keyed by visitorId', async () => {
      const existing = createGuestQuota();
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(existing);

      const result = await repo.findOrCreateBySubject(guestSubject);

      expect(result).toEqual(existing);
      expect(prisma.userDownloadQuota.findUnique).toHaveBeenCalledWith({
        where: { visitorId: 'visitor-abc' },
      });
    });

    it('creates a new user quota row when missing', async () => {
      const created = createUserQuota({ id: 'new-1', uniqueReleaseIds: [] });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDownloadQuota.create).mockResolvedValue(created);

      const result = await repo.findOrCreateBySubject(userSubject);

      expect(result).toEqual(created);
      expect(prisma.userDownloadQuota.create).toHaveBeenCalledWith({
        data: {
          user: { connect: { id: 'user-123' } },
          uniqueReleaseIds: [],
        },
      });
    });

    it('creates a new guest quota row when missing', async () => {
      const created = createGuestQuota({ id: 'new-g1', uniqueReleaseIds: [] });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDownloadQuota.create).mockResolvedValue(created);

      const result = await repo.findOrCreateBySubject(guestSubject);

      expect(result).toEqual(created);
      expect(prisma.userDownloadQuota.create).toHaveBeenCalledWith({
        data: {
          visitorId: 'visitor-abc',
          uniqueReleaseIds: [],
        },
      });
    });
  });

  describe('addUniqueRelease', () => {
    it('atomically pushes a release id for a user', async () => {
      const existing = createUserQuota();
      const updated = createUserQuota({
        uniqueReleaseIds: [...existing.uniqueReleaseIds, mockReleaseId],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(existing);
      vi.mocked(prisma.userDownloadQuota.update).mockResolvedValue(updated);

      const result = await repo.addUniqueRelease(userSubject, mockReleaseId);

      expect(result.uniqueReleaseIds).toContain(mockReleaseId);
      expect(prisma.userDownloadQuota.update).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: { uniqueReleaseIds: { push: mockReleaseId } },
      });
    });

    it('atomically pushes a release id for a guest', async () => {
      const existing = createGuestQuota();
      const updated = createGuestQuota({
        uniqueReleaseIds: [...existing.uniqueReleaseIds, mockReleaseId],
      });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(existing);
      vi.mocked(prisma.userDownloadQuota.update).mockResolvedValue(updated);

      const result = await repo.addUniqueRelease(guestSubject, mockReleaseId);

      expect(result.uniqueReleaseIds).toContain(mockReleaseId);
      expect(prisma.userDownloadQuota.update).toHaveBeenCalledWith({
        where: { visitorId: 'visitor-abc' },
        data: { uniqueReleaseIds: { push: mockReleaseId } },
      });
    });

    it('creates the row first when missing before pushing', async () => {
      const created = createGuestQuota({ uniqueReleaseIds: [] });
      const updated = createGuestQuota({ uniqueReleaseIds: [mockReleaseId] });
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.userDownloadQuota.create).mockResolvedValue(created);
      vi.mocked(prisma.userDownloadQuota.update).mockResolvedValue(updated);

      const result = await repo.addUniqueRelease(guestSubject, mockReleaseId);

      expect(prisma.userDownloadQuota.create).toHaveBeenCalled();
      expect(result.uniqueReleaseIds).toEqual([mockReleaseId]);
    });
  });

  describe('checkQuotaExceeded', () => {
    it('returns false under the cap (user)', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(createUserQuota());
      expect(await repo.checkQuotaExceeded(userSubject, 5)).toBe(false);
    });

    it('returns true at the cap (guest)', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(
        createGuestQuota({ uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5'] })
      );
      expect(await repo.checkQuotaExceeded(guestSubject, 5)).toBe(true);
    });

    it('defaults to a cap of 5', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(createUserQuota());
      expect(await repo.checkQuotaExceeded(userSubject)).toBe(false);
    });
  });

  describe('getRemainingQuota', () => {
    it('returns the remaining count for a guest', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(
        createGuestQuota({ uniqueReleaseIds: ['r1', 'r2'] })
      );
      expect(await repo.getRemainingQuota(guestSubject, 5)).toBe(3);
    });

    it('clamps to zero when over cap', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(
        createUserQuota({
          uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
        })
      );
      expect(await repo.getRemainingQuota(userSubject, 5)).toBe(0);
    });
  });

  describe('hasDownloadedRelease', () => {
    it('returns true when the release is present', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(createUserQuota());
      expect(await repo.hasDownloadedRelease(userSubject, 'release-1')).toBe(true);
    });

    it('returns false when the release is absent (guest)', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(createGuestQuota());
      expect(await repo.hasDownloadedRelease(guestSubject, 'release-999')).toBe(false);
    });
  });

  describe('getDownloadedReleaseIds', () => {
    it('returns the array of release ids for a guest', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(
        createGuestQuota({ uniqueReleaseIds: ['rA', 'rB'] })
      );
      expect(await repo.getDownloadedReleaseIds(guestSubject)).toEqual(['rA', 'rB']);
    });
  });
});
