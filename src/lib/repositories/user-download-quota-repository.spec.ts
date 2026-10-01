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
      upsert: vi.fn(),
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

  const createUserQuota = (overrides?: Partial<UserDownloadQuota>): UserDownloadQuota =>
    ({
      id: 'quota-1',
      userId: 'user-123',
      visitorId: null,
      uniqueReleaseIds: ['release-1', 'release-2'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as UserDownloadQuota;

  const createGuestQuota = (overrides?: Partial<UserDownloadQuota>): UserDownloadQuota =>
    ({
      id: 'quota-g1',
      userId: null,
      visitorId: 'visitor-abc',
      uniqueReleaseIds: ['release-1'],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as UserDownloadQuota;

  beforeEach(() => {
    repo = new UserDownloadQuotaRepository();
    vi.mocked(prisma.userDownloadQuota.findUnique).mockReset();
    vi.mocked(prisma.userDownloadQuota.create).mockReset();
    vi.mocked(prisma.userDownloadQuota.update).mockReset();
    vi.mocked(prisma.userDownloadQuota.upsert).mockReset();
  });

  describe('findReleaseIds', () => {
    it('returns the stored release ids without creating a row', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(
        createUserQuota({ uniqueReleaseIds: ['r1', 'r2'] })
      );

      const result = await repo.findReleaseIds(userSubject);

      expect(result).toEqual(['r1', 'r2']);
      expect(prisma.userDownloadQuota.create).not.toHaveBeenCalled();
    });

    it('returns an empty list when the subject has no quota row yet', async () => {
      vi.mocked(prisma.userDownloadQuota.findUnique).mockResolvedValue(null);

      const result = await repo.findReleaseIds(userSubject);

      expect(result).toEqual([]);
      expect(prisma.userDownloadQuota.create).not.toHaveBeenCalled();
    });
  });

  describe('addUniqueRelease', () => {
    it('upserts a pushed release id for a user in a single round trip', async () => {
      const updated = createUserQuota({
        uniqueReleaseIds: ['release-1', 'release-2', mockReleaseId],
      });
      vi.mocked(prisma.userDownloadQuota.upsert).mockResolvedValue(updated);

      const result = await repo.addUniqueRelease(userSubject, mockReleaseId);

      expect(result.uniqueReleaseIds).toContain(mockReleaseId);
      expect(prisma.userDownloadQuota.upsert).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        update: { uniqueReleaseIds: { push: mockReleaseId } },
        create: { user: { connect: { id: 'user-123' } }, uniqueReleaseIds: [mockReleaseId] },
      });
    });

    it('does not pre-fetch the row before upserting', async () => {
      vi.mocked(prisma.userDownloadQuota.upsert).mockResolvedValue(createUserQuota());

      await repo.addUniqueRelease(userSubject, mockReleaseId);

      expect(prisma.userDownloadQuota.findUnique).not.toHaveBeenCalled();
    });

    it('upserts a pushed release id for a guest, seeding the create branch', async () => {
      const updated = createGuestQuota({ uniqueReleaseIds: ['release-1', mockReleaseId] });
      vi.mocked(prisma.userDownloadQuota.upsert).mockResolvedValue(updated);

      const result = await repo.addUniqueRelease(guestSubject, mockReleaseId);

      expect(result.uniqueReleaseIds).toContain(mockReleaseId);
      expect(prisma.userDownloadQuota.upsert).toHaveBeenCalledWith({
        where: { visitorId: 'visitor-abc' },
        update: { uniqueReleaseIds: { push: mockReleaseId } },
        create: { visitorId: 'visitor-abc', uniqueReleaseIds: [mockReleaseId] },
      });
    });
  });
});
