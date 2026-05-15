/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { BannedIdentityRepository } from './banned-identity-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    bannedIdentity: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('BannedIdentityRepository.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes email to lowercase + trim and persists all fields', async () => {
    vi.mocked(prisma.bannedIdentity.create).mockResolvedValue({ id: 'b-1' } as never);

    await BannedIdentityRepository.create({
      userId: 'user-1',
      email: '  BadActor@Example.COM  ',
      fingerprintHash: 'fp-hash',
      bannedByAdminId: 'admin-7',
      reason: 'evading prior ban',
    });

    expect(prisma.bannedIdentity.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        email: 'badactor@example.com',
        fingerprintHash: 'fp-hash',
        bannedByAdminId: 'admin-7',
        reason: 'evading prior ban',
      },
    });
  });

  it('coerces missing userId / fingerprintHash / reason to null', async () => {
    vi.mocked(prisma.bannedIdentity.create).mockResolvedValue({ id: 'b-2' } as never);

    await BannedIdentityRepository.create({
      email: 'baduser@example.com',
      bannedByAdminId: 'admin-7',
    });

    expect(prisma.bannedIdentity.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        email: 'baduser@example.com',
        fingerprintHash: null,
        bannedByAdminId: 'admin-7',
        reason: null,
      },
    });
  });
});

describe('BannedIdentityRepository.findActiveMatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null without querying when no signals are provided', async () => {
    const result = await BannedIdentityRepository.findActiveMatch({});

    expect(result).toBeNull();
    expect(prisma.bannedIdentity.findFirst).not.toHaveBeenCalled();
  });

  it('builds an OR with only the userId when only userId is given', async () => {
    vi.mocked(prisma.bannedIdentity.findFirst).mockResolvedValue(null);

    await BannedIdentityRepository.findActiveMatch({ userId: 'user-1' });

    expect(prisma.bannedIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        unbannedAt: null,
        OR: [{ userId: 'user-1' }],
      },
      orderBy: { bannedAt: 'desc' },
    });
  });

  it('normalizes email and includes all signals in the OR list', async () => {
    vi.mocked(prisma.bannedIdentity.findFirst).mockResolvedValue({ id: 'b-1' } as never);

    await BannedIdentityRepository.findActiveMatch({
      userId: 'user-1',
      email: '  BadActor@Example.COM ',
      fingerprintHash: 'fp-hash',
    });

    expect(prisma.bannedIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        unbannedAt: null,
        OR: [
          { userId: 'user-1' },
          { email: 'badactor@example.com' },
          { fingerprintHash: 'fp-hash' },
        ],
      },
      orderBy: { bannedAt: 'desc' },
    });
  });

  it('skips falsy signals (null/undefined) when assembling OR', async () => {
    vi.mocked(prisma.bannedIdentity.findFirst).mockResolvedValue(null);

    await BannedIdentityRepository.findActiveMatch({
      userId: null,
      email: undefined,
      fingerprintHash: 'fp-hash',
    });

    expect(prisma.bannedIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        unbannedAt: null,
        OR: [{ fingerprintHash: 'fp-hash' }],
      },
      orderBy: { bannedAt: 'desc' },
    });
  });
});

describe('BannedIdentityRepository.unban', () => {
  it('stamps unbannedAt with the current time on the matching row', async () => {
    vi.mocked(prisma.bannedIdentity.update).mockResolvedValue({} as never);

    await BannedIdentityRepository.unban('ban-1');

    expect(prisma.bannedIdentity.update).toHaveBeenCalledWith({
      where: { id: 'ban-1' },
      data: { unbannedAt: expect.any(Date) },
    });
  });
});

describe('BannedIdentityRepository.listActive', () => {
  it('returns all rows with unbannedAt null sorted newest-first', async () => {
    vi.mocked(prisma.bannedIdentity.findMany).mockResolvedValue([] as never);

    await BannedIdentityRepository.listActive();

    expect(prisma.bannedIdentity.findMany).toHaveBeenCalledWith({
      where: { unbannedAt: null },
      orderBy: { bannedAt: 'desc' },
    });
  });
});
