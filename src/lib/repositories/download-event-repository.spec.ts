/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';

import { DownloadEventRepository } from './download-event-repository';

import type { DownloadEvent } from '@prisma/client';

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    downloadEvent: {
      create: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('DownloadEventRepository', () => {
  let repository: DownloadEventRepository;

  const mockUserId = '507f1f77bcf86cd799439011';
  const mockReleaseId = '507f1f77bcf86cd799439012';
  const mockFormatType: DigitalFormatType = 'MP3_320KBPS';

  function createMockEvent(overrides?: Partial<DownloadEvent>): DownloadEvent {
    return {
      id: 'event123',
      userId: mockUserId,
      visitorId: null,
      releaseId: mockReleaseId,
      formatType: mockFormatType,
      success: true,
      errorCode: null,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      downloadedAt: new Date(),
      createdAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    repository = new DownloadEventRepository();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('logDownloadEvent', () => {
    it('should log a successful download event', async () => {
      const eventData = {
        userId: mockUserId,
        releaseId: mockReleaseId,
        formatType: mockFormatType,
        success: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const mockCreatedEvent = createMockEvent();

      vi.mocked(prisma.downloadEvent.create).mockResolvedValue(mockCreatedEvent);

      const result = await repository.logDownloadEvent(eventData);

      expect(prisma.downloadEvent.create).toHaveBeenCalledWith({
        data: {
          ...eventData,
          visitorId: null,
          errorCode: null,
        },
      });
      expect(result).toEqual(mockCreatedEvent);
      expect(result.success).toBe(true);
    });

    it('should log a failed download event with error code', async () => {
      const eventData = {
        userId: mockUserId,
        releaseId: mockReleaseId,
        formatType: mockFormatType,
        success: false,
        errorCode: 'QUOTA_EXCEEDED',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const mockFailedEvent = createMockEvent({
        id: 'event124',
        success: false,
        errorCode: 'QUOTA_EXCEEDED',
      });

      vi.mocked(prisma.downloadEvent.create).mockResolvedValue(mockFailedEvent);

      const result = await repository.logDownloadEvent(eventData);

      expect(prisma.downloadEvent.create).toHaveBeenCalledWith({
        data: { ...eventData, visitorId: null },
      });
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('QUOTA_EXCEEDED');
    });

    it('should allow logging events without userId (unauthenticated)', async () => {
      const eventData = {
        userId: null,
        releaseId: mockReleaseId,
        formatType: mockFormatType,
        success: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const mockEvent = createMockEvent({ id: 'event125', userId: null });

      vi.mocked(prisma.downloadEvent.create).mockResolvedValue(mockEvent);

      const result = await repository.logDownloadEvent(eventData);

      expect(result.userId).toBeNull();
    });
  });

  describe('getAnalyticsByRelease', () => {
    it('should return download counts by format type', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-12-31');

      const mockAggregation = [
        {
          formatType: 'MP3_320KBPS' as DigitalFormatType,
          _count: {
            id: 150,
          },
        },
        {
          formatType: 'FLAC' as DigitalFormatType,
          _count: {
            id: 75,
          },
        },
      ];

      vi.mocked(prisma.downloadEvent.groupBy).mockResolvedValue(
        mockAggregation as unknown as Awaited<ReturnType<typeof prisma.downloadEvent.groupBy>>
      );

      const result = await repository.getAnalyticsByRelease(mockReleaseId, { startDate, endDate });

      expect(prisma.downloadEvent.groupBy).toHaveBeenCalledWith({
        by: ['formatType'],
        where: {
          releaseId: mockReleaseId,
          success: true,
          downloadedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
      });

      expect(result).toEqual([
        { formatType: 'MP3_320KBPS', count: 150 },
        { formatType: 'FLAC', count: 75 },
      ]);
    });

    it('should handle empty results', async () => {
      vi.mocked(prisma.downloadEvent.groupBy).mockResolvedValue([]);

      const result = await repository.getAnalyticsByRelease(mockReleaseId);

      expect(result).toEqual([]);
    });
  });

  describe('getAnalyticsByUser', () => {
    it('should return total download count for a user', async () => {
      const mockCount = 42;

      vi.mocked(prisma.downloadEvent.count).mockResolvedValue(mockCount);

      const result = await repository.getAnalyticsByUser(mockUserId);

      expect(prisma.downloadEvent.count).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          success: true,
        },
      });
      expect(result).toEqual({ totalDownloads: mockCount });
    });

    it('should apply date range filter when provided', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-12-31');

      vi.mocked(prisma.downloadEvent.count).mockResolvedValue(10);

      await repository.getAnalyticsByUser(mockUserId, {
        startDate,
        endDate,
      });

      expect(prisma.downloadEvent.count).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          success: true,
          downloadedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
    });
  });

  describe('getUniqueUsers', () => {
    it('should return count of unique users who downloaded a release', async () => {
      const mockUsers = [{ userId: 'user1' }, { userId: 'user2' }];

      vi.mocked(prisma.downloadEvent.findMany).mockResolvedValue(
        mockUsers as unknown as Awaited<ReturnType<typeof prisma.downloadEvent.findMany>>
      );

      const result = await repository.getUniqueUsers(mockReleaseId);

      expect(prisma.downloadEvent.findMany).toHaveBeenCalledWith({
        where: {
          releaseId: mockReleaseId,
          success: true,
          userId: { not: null },
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      expect(result).toBe(2);
    });

    it('should handle releases with no downloads', async () => {
      vi.mocked(prisma.downloadEvent.findMany).mockResolvedValue([]);

      const result = await repository.getUniqueUsers(mockReleaseId);

      expect(result).toBe(0);
    });

    it('should apply date range filter when provided', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-06-30');
      const mockUsers = [{ userId: 'user1' }];

      vi.mocked(prisma.downloadEvent.findMany).mockResolvedValue(
        mockUsers as unknown as Awaited<ReturnType<typeof prisma.downloadEvent.findMany>>
      );

      const result = await repository.getUniqueUsers(mockReleaseId, { startDate, endDate });

      expect(prisma.downloadEvent.findMany).toHaveBeenCalledWith({
        where: {
          releaseId: mockReleaseId,
          success: true,
          userId: { not: null },
          downloadedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      expect(result).toBe(1);
    });
  });

  describe('getTotalDownloads', () => {
    it('should return total successful downloads for a release', async () => {
      const mockCount = 500;

      vi.mocked(prisma.downloadEvent.count).mockResolvedValue(mockCount);

      const result = await repository.getTotalDownloads(mockReleaseId);

      expect(prisma.downloadEvent.count).toHaveBeenCalledWith({
        where: {
          releaseId: mockReleaseId,
          success: true,
        },
      });
      expect(result).toBe(mockCount);
    });

    it('should return 0 for a release with no downloads', async () => {
      vi.mocked(prisma.downloadEvent.count).mockResolvedValue(0);

      const result = await repository.getTotalDownloads(mockReleaseId);

      expect(result).toBe(0);
    });

    it('should apply date range filter when provided', async () => {
      const startDate = new Date('2026-03-01');
      const endDate = new Date('2026-03-31');

      vi.mocked(prisma.downloadEvent.count).mockResolvedValue(25);

      const result = await repository.getTotalDownloads(mockReleaseId, { startDate, endDate });

      expect(prisma.downloadEvent.count).toHaveBeenCalledWith({
        where: {
          releaseId: mockReleaseId,
          success: true,
          downloadedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
      expect(result).toBe(25);
    });
  });

  describe('countSuccessfulDownloadsInWindow', () => {
    const windowStart = new Date('2026-05-07T00:00:00Z');
    const oldest = new Date('2026-05-07T01:23:45Z');

    it('counts events for a single visitorId scoped to release+window+success', async () => {
      vi.mocked(prisma.downloadEvent.aggregate).mockResolvedValue({
        _count: { _all: 2 },
        _min: { downloadedAt: oldest },
      } as never);

      const result = await repository.countSuccessfulDownloadsInWindow({
        visitorId: 'visitor-abc',
        releaseId: mockReleaseId,
        windowStart,
      });

      expect(result).toEqual({ count: 2, oldestInWindow: oldest });
      expect(prisma.downloadEvent.aggregate).toHaveBeenCalledWith({
        where: {
          visitorId: 'visitor-abc',
          releaseId: mockReleaseId,
          success: true,
          downloadedAt: { gte: windowStart },
        },
        _count: { _all: true },
        _min: { downloadedAt: true },
      });
    });

    it('uses gte (boundary inclusive) so events at exactly windowStart count', async () => {
      vi.mocked(prisma.downloadEvent.aggregate).mockResolvedValue({
        _count: { _all: 1 },
        _min: { downloadedAt: windowStart },
      } as never);

      const result = await repository.countSuccessfulDownloadsInWindow({
        visitorId: 'visitor-abc',
        releaseId: mockReleaseId,
        windowStart,
      });

      expect(result).toEqual({ count: 1, oldestInWindow: windowStart });
      const call = vi.mocked(prisma.downloadEvent.aggregate).mock.calls[0]?.[0];
      expect(call?.where?.downloadedAt).toEqual({ gte: windowStart });
    });

    it('returns count=0 and oldestInWindow=null when no events match', async () => {
      vi.mocked(prisma.downloadEvent.aggregate).mockResolvedValue({
        _count: { _all: 0 },
        _min: { downloadedAt: null },
      } as never);

      const result = await repository.countSuccessfulDownloadsInWindow({
        visitorId: 'visitor-abc',
        releaseId: mockReleaseId,
        windowStart,
      });

      expect(result).toEqual({ count: 0, oldestInWindow: null });
    });

    it('unions multiple visitorIds via the visitorIds[] overload', async () => {
      vi.mocked(prisma.downloadEvent.aggregate).mockResolvedValue({
        _count: { _all: 3 },
        _min: { downloadedAt: oldest },
      } as never);

      const result = await repository.countSuccessfulDownloadsInWindow({
        visitorIds: ['visitor-a', 'visitor-b'],
        releaseId: mockReleaseId,
        windowStart,
      });

      expect(result).toEqual({ count: 3, oldestInWindow: oldest });
      expect(prisma.downloadEvent.aggregate).toHaveBeenCalledWith({
        where: {
          visitorId: { in: ['visitor-a', 'visitor-b'] },
          releaseId: mockReleaseId,
          success: true,
          downloadedAt: { gte: windowStart },
        },
        _count: { _all: true },
        _min: { downloadedAt: true },
      });
    });

    it('short-circuits to count=0 without DB access when visitorIds is empty', async () => {
      const result = await repository.countSuccessfulDownloadsInWindow({
        visitorIds: [],
        releaseId: mockReleaseId,
        windowStart,
      });

      expect(result).toEqual({ count: 0, oldestInWindow: null });
      expect(prisma.downloadEvent.aggregate).not.toHaveBeenCalled();
    });

    it('queries by userId when the userId variant is used', async () => {
      vi.mocked(prisma.downloadEvent.aggregate).mockResolvedValue({
        _count: { _all: 1 },
        _min: { downloadedAt: oldest },
      } as never);

      const result = await repository.countSuccessfulDownloadsInWindow({
        userId: mockUserId,
        releaseId: mockReleaseId,
        windowStart,
      });

      expect(result).toEqual({ count: 1, oldestInWindow: oldest });
      expect(prisma.downloadEvent.aggregate).toHaveBeenCalledWith({
        where: {
          userId: mockUserId,
          releaseId: mockReleaseId,
          success: true,
          downloadedAt: { gte: windowStart },
        },
        _count: { _all: true },
        _min: { downloadedAt: true },
      });
    });

    it('ignores success=false rows by virtue of where clause', async () => {
      // The mock is configured with success=true filter; assert clause shape.
      vi.mocked(prisma.downloadEvent.aggregate).mockResolvedValue({
        _count: { _all: 0 },
        _min: { downloadedAt: null },
      } as never);

      await repository.countSuccessfulDownloadsInWindow({
        visitorId: 'visitor-abc',
        releaseId: mockReleaseId,
        windowStart,
      });

      const call = vi.mocked(prisma.downloadEvent.aggregate).mock.calls[0]?.[0];
      expect(call?.where?.success).toBe(true);
    });
  });

  describe('deleteAllByReleaseId', () => {
    it('deletes all download events for a release and returns the count', async () => {
      vi.mocked(prisma.downloadEvent.deleteMany).mockResolvedValue({ count: 5 } as never);

      const result = await repository.deleteAllByReleaseId(mockReleaseId);

      expect(result).toBe(5);
      expect(prisma.downloadEvent.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: mockReleaseId },
      });
    });
  });
});
