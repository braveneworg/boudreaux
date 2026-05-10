/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { VisitorIdentityRepository } from './visitor-identity-repository';

import type { VisitorIdentity } from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    visitorIdentity: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('VisitorIdentityRepository', () => {
  let repo: VisitorIdentityRepository;

  function createRow(overrides?: Partial<VisitorIdentity>): VisitorIdentity {
    return {
      id: 'vi-1',
      visitorId: 'visitor-abc',
      fingerprintHash: 'a'.repeat(64),
      firstSeenAt: new Date('2026-01-01T00:00:00Z'),
      lastSeenAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    } as VisitorIdentity;
  }

  beforeEach(() => {
    repo = new VisitorIdentityRepository();
    vi.mocked(prisma.visitorIdentity.findUnique).mockReset();
    vi.mocked(prisma.visitorIdentity.findFirst).mockReset();
    vi.mocked(prisma.visitorIdentity.upsert).mockReset();
  });

  describe('findByVisitorId', () => {
    it('returns the row when one exists', async () => {
      const row = createRow();
      vi.mocked(prisma.visitorIdentity.findUnique).mockResolvedValue(row);

      const result = await repo.findByVisitorId('visitor-abc');

      expect(result).toEqual(row);
      expect(prisma.visitorIdentity.findUnique).toHaveBeenCalledWith({
        where: { visitorId: 'visitor-abc' },
      });
    });

    it('returns null when no row exists', async () => {
      vi.mocked(prisma.visitorIdentity.findUnique).mockResolvedValue(null);

      const result = await repo.findByVisitorId('visitor-missing');

      expect(result).toBeNull();
    });
  });

  describe('findByFingerprintHash', () => {
    it('returns the most recently seen row matching the hash', async () => {
      const row = createRow();
      vi.mocked(prisma.visitorIdentity.findFirst).mockResolvedValue(row);

      const result = await repo.findByFingerprintHash('a'.repeat(64));

      expect(result).toEqual(row);
      expect(prisma.visitorIdentity.findFirst).toHaveBeenCalledWith({
        where: { fingerprintHash: 'a'.repeat(64) },
        orderBy: { lastSeenAt: 'desc' },
      });
    });

    it('returns null when no row matches', async () => {
      vi.mocked(prisma.visitorIdentity.findFirst).mockResolvedValue(null);

      const result = await repo.findByFingerprintHash('b'.repeat(64));

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    const now = new Date('2026-05-07T12:00:00Z');

    it('creates a new row with firstSeenAt = lastSeenAt = now when none exists', async () => {
      const created = createRow({ firstSeenAt: now, lastSeenAt: now });
      vi.mocked(prisma.visitorIdentity.upsert).mockResolvedValue(created);

      const result = await repo.upsert(
        { visitorId: 'visitor-abc', fingerprintHash: 'a'.repeat(64) },
        now
      );

      expect(result).toEqual(created);
      expect(prisma.visitorIdentity.upsert).toHaveBeenCalledWith({
        where: { visitorId: 'visitor-abc' },
        create: {
          visitorId: 'visitor-abc',
          fingerprintHash: 'a'.repeat(64),
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: {
          fingerprintHash: 'a'.repeat(64),
          lastSeenAt: now,
        },
      });
    });

    it('updates fingerprintHash and lastSeenAt without touching firstSeenAt on collision', async () => {
      const updated = createRow({
        fingerprintHash: 'b'.repeat(64),
        lastSeenAt: now,
        firstSeenAt: new Date('2026-01-01T00:00:00Z'),
      });
      vi.mocked(prisma.visitorIdentity.upsert).mockResolvedValue(updated);

      const result = await repo.upsert(
        { visitorId: 'visitor-abc', fingerprintHash: 'b'.repeat(64) },
        now
      );

      expect(result.firstSeenAt).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(result.lastSeenAt).toEqual(now);
      expect(result.fingerprintHash).toBe('b'.repeat(64));
    });

    it('defaults `now` to current time when not provided', async () => {
      const row = createRow();
      vi.mocked(prisma.visitorIdentity.upsert).mockResolvedValue(row);

      await repo.upsert({ visitorId: 'visitor-abc', fingerprintHash: 'a'.repeat(64) });

      const calls = vi.mocked(prisma.visitorIdentity.upsert).mock.calls;
      expect(calls).toHaveLength(1);
      const call = calls[0]?.[0];
      expect(call?.create.firstSeenAt).toBeInstanceOf(Date);
      expect(call?.create.lastSeenAt).toBeInstanceOf(Date);
      expect(call?.update.lastSeenAt).toBeInstanceOf(Date);
    });
  });
});
