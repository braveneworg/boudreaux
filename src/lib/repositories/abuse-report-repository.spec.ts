/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { AbuseReportRepository } from './abuse-report-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    abuseReport: {
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

describe('AbuseReportRepository.create', () => {
  it('persists the report with reporter and target ids and fingerprint', async () => {
    vi.mocked(prisma.abuseReport.create).mockResolvedValue({ id: 'r-1' } as never);

    await AbuseReportRepository.create({
      reportedUserId: 'target-1',
      reporterId: 'reporter-1',
      reporterFingerprint: 'fp-1',
    });

    expect(prisma.abuseReport.create).toHaveBeenCalledWith({
      data: {
        reportedUserId: 'target-1',
        reporterId: 'reporter-1',
        reporterFingerprint: 'fp-1',
      },
    });
  });

  it('persists with a null fingerprint when none was supplied', async () => {
    vi.mocked(prisma.abuseReport.create).mockResolvedValue({ id: 'r-2' } as never);

    await AbuseReportRepository.create({
      reportedUserId: 'target-1',
      reporterId: 'reporter-1',
      reporterFingerprint: null,
    });

    expect(prisma.abuseReport.create).toHaveBeenCalledWith({
      data: {
        reportedUserId: 'target-1',
        reporterId: 'reporter-1',
        reporterFingerprint: null,
      },
    });
  });
});

describe('AbuseReportRepository.countByReporterAndTarget', () => {
  it('counts reports inside the rolling window for a specific reporter/target pair', async () => {
    vi.mocked(prisma.abuseReport.count).mockResolvedValue(2);
    const fixedNow = new Date('2026-05-14T00:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const result = await AbuseReportRepository.countByReporterAndTarget({
      reporterId: 'reporter-1',
      reportedUserId: 'target-1',
      sinceMs: 60_000,
    });

    expect(result).toBe(2);
    expect(prisma.abuseReport.count).toHaveBeenCalledWith({
      where: {
        reporterId: 'reporter-1',
        reportedUserId: 'target-1',
        createdAt: { gte: new Date(fixedNow - 60_000) },
      },
    });
  });
});

describe('AbuseReportRepository.countByReporter', () => {
  it('counts all reports made by a single reporter inside the window', async () => {
    vi.mocked(prisma.abuseReport.count).mockResolvedValue(5);
    const fixedNow = new Date('2026-05-14T00:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const result = await AbuseReportRepository.countByReporter({
      reporterId: 'reporter-1',
      sinceMs: 3_600_000,
    });

    expect(result).toBe(5);
    expect(prisma.abuseReport.count).toHaveBeenCalledWith({
      where: {
        reporterId: 'reporter-1',
        createdAt: { gte: new Date(fixedNow - 3_600_000) },
      },
    });
  });
});

describe('AbuseReportRepository.listReportedUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns [] when no reports exist (skips the user lookup)', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([] as never);

    const result = await AbuseReportRepository.listReportedUsers({ windowDays: null });

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('uses an empty where clause when windowDays is null (all-time)', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([] as never);

    await AbuseReportRepository.listReportedUsers({ windowDays: null });

    expect(prisma.abuseReport.groupBy).toHaveBeenCalledWith({
      by: ['reportedUserId'],
      where: {},
      _count: { _all: true },
      _max: { createdAt: true },
    });
  });

  it('builds a createdAt gte clause from windowDays', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([] as never);
    const fixedNow = new Date('2026-05-14T00:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    await AbuseReportRepository.listReportedUsers({ windowDays: 7 });

    expect(prisma.abuseReport.groupBy).toHaveBeenCalledWith({
      by: ['reportedUserId'],
      where: {
        createdAt: { gte: new Date(fixedNow - 7 * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    });
  });

  it('pushes the search term into the where via the reportedUser relation', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([] as never);

    await AbuseReportRepository.listReportedUsers({ windowDays: null, search: '  SPAM  ' });

    expect(prisma.abuseReport.groupBy).toHaveBeenCalledWith({
      by: ['reportedUserId'],
      where: {
        reportedUser: {
          OR: [
            { username: { contains: 'SPAM', mode: 'insensitive' } },
            { email: { contains: 'SPAM', mode: 'insensitive' } },
          ],
        },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    });
  });

  it('combines the window and search filters in the same where clause', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([] as never);
    const fixedNow = new Date('2026-05-14T00:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    await AbuseReportRepository.listReportedUsers({ windowDays: 7, search: 'bob' });

    expect(prisma.abuseReport.groupBy).toHaveBeenCalledWith({
      by: ['reportedUserId'],
      where: {
        createdAt: { gte: new Date(fixedNow - 7 * 24 * 60 * 60 * 1000) },
        reportedUser: {
          OR: [
            { username: { contains: 'bob', mode: 'insensitive' } },
            { email: { contains: 'bob', mode: 'insensitive' } },
          ],
        },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    });
  });

  it('ignores a blank/whitespace-only search term', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([] as never);

    await AbuseReportRepository.listReportedUsers({ windowDays: null, search: '   ' });

    expect(prisma.abuseReport.groupBy).toHaveBeenCalledWith({
      by: ['reportedUserId'],
      where: {},
      _count: { _all: true },
      _max: { createdAt: true },
    });
  });

  it('joins users, computes chatDisabled, and sorts newest-first', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([
      {
        reportedUserId: 'user-1',
        _count: { _all: 3 },
        _max: { createdAt: new Date('2026-05-01T00:00:00Z') },
      },
      {
        reportedUserId: 'user-2',
        _count: { _all: 1 },
        _max: { createdAt: new Date('2026-05-10T00:00:00Z') },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        chatUsers: [{ disabled: false }],
      },
      {
        id: 'user-2',
        username: 'bob',
        email: 'bob@example.com',
        chatUsers: [{ disabled: true }, { disabled: false }],
      },
    ] as never);

    const result = await AbuseReportRepository.listReportedUsers({ windowDays: null });

    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe('user-2');
    expect(result[0].chatDisabled).toBe(true);
    expect(result[0].reportCount).toBe(1);
    expect(result[1].userId).toBe('user-1');
    expect(result[1].chatDisabled).toBe(false);
    expect(result[1].reportCount).toBe(3);
  });

  it('drops grouped rows whose user is missing (deleted user)', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([
      {
        reportedUserId: 'user-1',
        _count: { _all: 1 },
        _max: { createdAt: new Date('2026-05-01T00:00:00Z') },
      },
      {
        reportedUserId: 'ghost',
        _count: { _all: 9 },
        _max: { createdAt: new Date('2026-05-02T00:00:00Z') },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        chatUsers: [],
      },
    ] as never);

    const result = await AbuseReportRepository.listReportedUsers({ windowDays: null });

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user-1');
  });

  it('falls back to epoch-0 when groupBy returns no createdAt', async () => {
    vi.mocked(prisma.abuseReport.groupBy).mockResolvedValue([
      {
        reportedUserId: 'user-1',
        _count: { _all: 1 },
        _max: { createdAt: null },
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        chatUsers: [],
      },
    ] as never);

    const result = await AbuseReportRepository.listReportedUsers({ windowDays: null });

    expect(result[0].latestReportedAt).toEqual(new Date(0));
  });
});
