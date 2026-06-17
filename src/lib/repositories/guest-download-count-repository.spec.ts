/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { GuestDownloadCountRepository } from './guest-download-count-repository';

import type { GuestDownloadCount } from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    guestDownloadCount: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('GuestDownloadCountRepository', () => {
  let repo: GuestDownloadCountRepository;
  const visitorId = 'visitor-1';
  const releaseId = 'release-1';

  const makeRow = (overrides?: Partial<GuestDownloadCount>): GuestDownloadCount =>
    ({
      id: 'row-1',
      visitorId,
      releaseId,
      downloadCount: 1,
      lastDownloadAt: new Date('2026-05-06T00:00:00.000Z'),
      createdAt: new Date('2026-05-06T00:00:00.000Z'),
      updatedAt: new Date('2026-05-06T00:00:00.000Z'),
      ...overrides,
    }) as GuestDownloadCount;

  beforeEach(() => {
    repo = new GuestDownloadCountRepository();
    vi.mocked(prisma.guestDownloadCount.findUnique).mockReset();
    vi.mocked(prisma.guestDownloadCount.create).mockReset();
    vi.mocked(prisma.guestDownloadCount.update).mockReset();
  });

  describe('find', () => {
    it('reads by composite (visitorId, releaseId)', async () => {
      const row = makeRow();
      vi.mocked(prisma.guestDownloadCount.findUnique).mockResolvedValue(row);

      const result = await repo.find(visitorId, releaseId);

      expect(result).toEqual(row);
      expect(prisma.guestDownloadCount.findUnique).toHaveBeenCalledWith({
        where: { visitorId_releaseId: { visitorId, releaseId } },
      });
    });
  });

  describe('incrementOrReset', () => {
    it('creates a fresh row at count 1 when none exists', async () => {
      vi.mocked(prisma.guestDownloadCount.findUnique).mockResolvedValue(null);
      const created = makeRow({ downloadCount: 1 });
      vi.mocked(prisma.guestDownloadCount.create).mockResolvedValue(created);

      const now = new Date('2026-05-06T01:00:00.000Z');
      const result = await repo.incrementOrReset(visitorId, releaseId, now);

      expect(result).toEqual(created);
      expect(prisma.guestDownloadCount.create).toHaveBeenCalledWith({
        data: {
          visitorId,
          releaseId,
          downloadCount: 1,
          lastDownloadAt: now,
        },
      });
      expect(prisma.guestDownloadCount.update).not.toHaveBeenCalled();
    });

    it('increments the existing count when within the 6-hour window', async () => {
      const last = new Date('2026-05-06T00:00:00.000Z');
      vi.mocked(prisma.guestDownloadCount.findUnique).mockResolvedValue(
        makeRow({ downloadCount: 2, lastDownloadAt: last })
      );
      const updated = makeRow({ downloadCount: 3 });
      vi.mocked(prisma.guestDownloadCount.update).mockResolvedValue(updated);

      const now = new Date('2026-05-06T05:59:59.000Z'); // <6h since last
      await repo.incrementOrReset(visitorId, releaseId, now);

      expect(prisma.guestDownloadCount.update).toHaveBeenCalledWith({
        where: { visitorId_releaseId: { visitorId, releaseId } },
        data: {
          downloadCount: { increment: 1 },
          lastDownloadAt: now,
        },
      });
    });

    it('resets the count to 1 when more than 6 hours have elapsed', async () => {
      const last = new Date('2026-05-06T00:00:00.000Z');
      vi.mocked(prisma.guestDownloadCount.findUnique).mockResolvedValue(
        makeRow({ downloadCount: 5, lastDownloadAt: last })
      );
      const updated = makeRow({ downloadCount: 1 });
      vi.mocked(prisma.guestDownloadCount.update).mockResolvedValue(updated);

      const now = new Date('2026-05-06T06:01:00.000Z'); // >6h since last
      await repo.incrementOrReset(visitorId, releaseId, now);

      expect(prisma.guestDownloadCount.update).toHaveBeenCalledWith({
        where: { visitorId_releaseId: { visitorId, releaseId } },
        data: { downloadCount: 1, lastDownloadAt: now },
      });
    });
  });
});
