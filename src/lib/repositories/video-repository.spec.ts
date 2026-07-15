/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';
import type { CreateVideoData, SaveProbeResultData } from '@/lib/types/domain/video';

import { VideoRepository, type VideoSummary } from './video-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    video: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('VideoRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockVideo = { id: 'video-123', title: 'Test Video' };

  const createData: CreateVideoData = {
    title: 'Test Video',
    artist: 'Test Artist',
    category: 'MUSIC',
    releasedOn: new Date('2024-01-15'),
    s3Key: 'videos/test.mp4',
    fileName: 'test.mp4',
    mimeType: 'video/mp4',
  };

  // The Mongo null-safe exclusions pushed by the where builder.
  const notArchived = { OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] };
  const notPublished = { OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }] };
  const contains = (value: string) => ({ contains: value, mode: 'insensitive' });

  describe('create', () => {
    it('creates a video from the mapped create data', async () => {
      vi.mocked(prisma.video.create).mockResolvedValue(mockVideo as never);

      const result = await VideoRepository.create(createData);

      expect(result).toEqual(mockVideo);
      expect(prisma.video.create).toHaveBeenCalledWith({ data: createData });
    });
  });

  describe('findById', () => {
    it('finds a video by id', async () => {
      vi.mocked(prisma.video.findUnique).mockResolvedValue(mockVideo as never);

      const result = await VideoRepository.findById('video-123');

      expect(result).toEqual(mockVideo);
      expect(prisma.video.findUnique).toHaveBeenCalledWith({ where: { id: 'video-123' } });
    });

    it('returns null when the video is not found', async () => {
      vi.mocked(prisma.video.findUnique).mockResolvedValue(null);

      const result = await VideoRepository.findById('missing');

      expect(result).toBeNull();
    });

    it('wraps a Prisma not-found error as a DataError with code NOT_FOUND', async () => {
      vi.mocked(prisma.video.findUnique).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '6' })
      );

      await expect(VideoRepository.findById('a')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws a DataError instance on failure', async () => {
      vi.mocked(prisma.video.findUnique).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(VideoRepository.findById('a')).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('findMany', () => {
    it('uses default sort (releasedOn desc) and default pagination', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([mockVideo] as never);

      const result = await VideoRepository.findMany({});

      expect(result).toEqual([mockVideo]);
      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.orderBy).toEqual({ releasedOn: 'desc' });
      expect(arg?.skip).toBe(0);
      expect(arg?.take).toBe(5);
    });

    it('excludes archived videos by default (Mongo null-safe)', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({});

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [notArchived] });
    });

    it('excludes archived videos when archived=false', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ archived: false });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [notArchived] });
    });

    it('shows only archived videos when archived=true (exclusive view)', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ archived: true });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [{ archivedAt: { not: null } }] });
    });

    it('filters to published videos when published=true', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ published: true });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [notArchived, { publishedAt: { not: null } }] });
    });

    it('filters to unpublished videos when published=false', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ published: false });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [notArchived, notPublished] });
    });

    it('adds no publish clause when published=null', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ published: null });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ AND: [notArchived] });
    });

    it('adds a case-insensitive search OR across title/artist/description', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ search: 'foo' });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({
        AND: [
          notArchived,
          {
            OR: [
              { title: contains('foo') },
              { artist: contains('foo') },
              { description: contains('foo') },
            ],
          },
        ],
      });
    });

    it('sorts ascending when sort=asc', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ sort: 'asc' });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.orderBy).toEqual({ releasedOn: 'asc' });
    });

    it('sorts descending when sort=desc', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ sort: 'desc' });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.orderBy).toEqual({ releasedOn: 'desc' });
    });

    it('honors custom pagination', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findMany({ skip: 10, take: 3 });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.skip).toBe(10);
      expect(arg?.take).toBe(3);
    });
  });

  describe('findPublished', () => {
    it('composes publishedAt-not-null AND not-archived with defaults', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([mockVideo] as never);

      const result = await VideoRepository.findPublished({});

      expect(result).toEqual([mockVideo]);
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: { AND: [notArchived, { publishedAt: { not: null } }] },
        orderBy: { releasedOn: 'desc' },
        skip: 0,
        take: 5,
      });
    });

    it('honors custom sort/skip/take', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.findPublished({ sort: 'asc', skip: 5, take: 2 });

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.orderBy).toEqual({ releasedOn: 'asc' });
      expect(arg?.skip).toBe(5);
      expect(arg?.take).toBe(2);
    });
  });

  // The lean projection pinned for the playlist lookup/search reads.
  const summarySelect = {
    id: true,
    title: true,
    artist: true,
    durationSeconds: true,
    posterUrl: true,
    s3Key: true,
  };

  // The published + non-archived clauses mirrored from findPublished's where.
  const publishedNonArchived = [notArchived, { publishedAt: { not: null } }];

  const mockSummary: VideoSummary = {
    id: 'video-123',
    title: 'Test Video',
    artist: 'Test Artist',
    durationSeconds: 215,
    posterUrl: 'https://cdn.example.com/poster.jpg',
    s3Key: 'videos/test.mp4',
  };

  describe('findManyByIds', () => {
    it('fetches published, non-archived videos by id with the lean select', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([mockSummary] as never);

      const result = await VideoRepository.findManyByIds(['video-123', 'video-456']);

      expect(result).toEqual([mockSummary]);
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: { AND: publishedNonArchived, id: { in: ['video-123', 'video-456'] } },
        select: summarySelect,
      });
    });

    it('passes an empty in-list through when ids is empty', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      const result = await VideoRepository.findManyByIds([]);

      expect(result).toEqual([]);
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: { AND: publishedNonArchived, id: { in: [] } },
        select: summarySelect,
      });
    });

    it('returns an empty array when no ids match', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      const result = await VideoRepository.findManyByIds(['missing']);

      expect(result).toEqual([]);
    });

    it('wraps a Prisma not-found error as a DataError with code NOT_FOUND', async () => {
      vi.mocked(prisma.video.findMany).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '6' })
      );

      await expect(VideoRepository.findManyByIds(['a'])).rejects.toMatchObject({
        name: 'DataError',
        code: 'NOT_FOUND',
      });
    });

    it('throws a DataError instance on failure', async () => {
      vi.mocked(prisma.video.findMany).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(VideoRepository.findManyByIds(['a'])).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('searchPublished', () => {
    it('searches title/artist within published videos, ordered by title asc', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([mockSummary] as never);

      const result = await VideoRepository.searchPublished('foo', 8);

      expect(result).toEqual([mockSummary]);
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: {
          AND: publishedNonArchived,
          OR: [{ title: contains('foo') }, { artist: contains('foo') }],
        },
        orderBy: { title: 'asc' },
        take: 8,
        select: summarySelect,
      });
    });

    it('honors the take limit', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      await VideoRepository.searchPublished('x', 3);

      const arg = vi.mocked(prisma.video.findMany).mock.calls[0]?.[0];
      expect(arg?.take).toBe(3);
    });

    it('returns an empty array when nothing matches', async () => {
      vi.mocked(prisma.video.findMany).mockResolvedValue([] as never);

      const result = await VideoRepository.searchPublished('zzz', 8);

      expect(result).toEqual([]);
    });

    it('wraps a Prisma not-found error as a DataError with code NOT_FOUND', async () => {
      vi.mocked(prisma.video.findMany).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: '6' })
      );

      await expect(VideoRepository.searchPublished('a', 8)).rejects.toMatchObject({
        name: 'DataError',
        code: 'NOT_FOUND',
      });
    });

    it('throws a DataError instance on failure', async () => {
      vi.mocked(prisma.video.findMany).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(VideoRepository.searchPublished('a', 8)).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('count', () => {
    it('counts all videos with no filters', async () => {
      vi.mocked(prisma.video.count).mockResolvedValue(7 as never);

      const result = await VideoRepository.count();

      expect(result).toBe(7);
      expect(prisma.video.count).toHaveBeenCalledWith({ where: {} });
    });

    it('counts only published videos when published=true', async () => {
      vi.mocked(prisma.video.count).mockResolvedValue(3 as never);

      await VideoRepository.count({ published: true });

      expect(prisma.video.count).toHaveBeenCalledWith({ where: { publishedAt: { not: null } } });
    });

    it('counts only unpublished videos when published=false', async () => {
      vi.mocked(prisma.video.count).mockResolvedValue(4 as never);

      await VideoRepository.count({ published: false });

      expect(prisma.video.count).toHaveBeenCalledWith({ where: notPublished });
    });
  });

  describe('update', () => {
    it('updates a video by id from the mapped update data', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue(mockVideo as never);

      const result = await VideoRepository.update('video-123', { title: 'New' });

      expect(result).toEqual(mockVideo);
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { title: 'New' },
      });
    });
  });

  describe('delete', () => {
    it('hard-deletes the video by id', async () => {
      vi.mocked(prisma.video.delete).mockResolvedValue(mockVideo as never);

      const result = await VideoRepository.delete('video-123');

      expect(result).toEqual(mockVideo);
      expect(prisma.video.delete).toHaveBeenCalledWith({ where: { id: 'video-123' } });
    });
  });

  describe('saveProbeResult', () => {
    const probeData = { format: { filename: 'videos/test.mp4' } };

    const saveData: SaveProbeResultData = {
      probedAt: new Date('2026-07-11T00:00:00.000Z'),
      probeError: null,
      probeData,
      width: 1920,
      height: 1080,
    };

    it('returns true when the s3Key-conditional update writes a row', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      const result = await VideoRepository.saveProbeResult(
        'video-123',
        'videos/test.mp4',
        saveData
      );

      expect(result).toBe(true);
    });

    it('returns false when the file was replaced during the probe (zero rows)', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 0 } as never);

      const result = await VideoRepository.saveProbeResult(
        'video-123',
        'videos/stale.mp4',
        saveData
      );

      expect(result).toBe(false);
    });

    it('conditions the update on BOTH id and the probed s3Key (race guard)', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', saveData);

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.where).toEqual({ id: 'video-123', s3Key: 'videos/test.mp4' });
    });

    it('writes the scalar fields and the probe JSON', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', saveData);

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.data).toEqual({
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeError: null,
        width: 1920,
        height: 1080,
        probeData,
      });
    });

    it('omits probeData when not supplied (failure-only persist)', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', {
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeError: 'ffprobe exited with code 1',
      });

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.data).toEqual({
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeError: 'ffprobe exited with code 1',
      });
    });

    it('writes a null probeData as a DB null', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 } as never);

      await VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', {
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeData: null,
      });

      const arg = vi.mocked(prisma.video.updateMany).mock.calls[0]?.[0];
      expect(arg?.data).toEqual({
        probedAt: new Date('2026-07-11T00:00:00.000Z'),
        probeData: null,
      });
    });

    it('wraps a connection failure as a DataError', async () => {
      vi.mocked(prisma.video.updateMany).mockRejectedValue(
        new Prisma.PrismaClientInitializationError('no db', '6')
      );

      await expect(
        VideoRepository.saveProbeResult('video-123', 'videos/test.mp4', saveData)
      ).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('setEnrichmentStatus', () => {
    it('stamps enrichmentStartedAt when flipping to processing', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'processing');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentStatus: 'processing', enrichmentStartedAt: expect.any(Date) },
      });
    });

    it('clears progress and error when flipping to pending', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'pending');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentStatus: 'pending', enrichmentProgress: null, enrichmentError: null },
      });
    });

    it('stamps enrichedAt when flipping to succeeded', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'succeeded', { error: null });

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: {
          enrichmentStatus: 'succeeded',
          enrichmentError: null,
          enrichedAt: expect.any(Date),
        },
      });
    });

    it('writes the provided error when flipping to failed', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentStatus('video-123', 'failed', { error: 'boom' });

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentStatus: 'failed', enrichmentError: 'boom' },
      });
    });
  });

  describe('setEnrichmentJobToken', () => {
    it('stores the per-job token', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentJobToken('video-123', 'token-1');

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentJobToken: 'token-1' },
      });
    });

    it('clears the token with null', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);

      await VideoRepository.setEnrichmentJobToken('video-123', null);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentJobToken: null },
      });
    });
  });

  describe('claimEnrichmentJobToken', () => {
    it('claims atomically iff the token matches a processing job', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 1 });

      const result = await VideoRepository.claimEnrichmentJobToken('video-123', 'token-1');

      expect(result).toBe(true);
      expect(prisma.video.updateMany).toHaveBeenCalledWith({
        where: { id: 'video-123', enrichmentJobToken: 'token-1', enrichmentStatus: 'processing' },
        data: { enrichmentJobToken: null },
      });
    });

    it('returns false when another caller already claimed', async () => {
      vi.mocked(prisma.video.updateMany).mockResolvedValue({ count: 0 });

      const result = await VideoRepository.claimEnrichmentJobToken('video-123', 'token-1');

      expect(result).toBe(false);
    });
  });

  describe('setEnrichmentProgress', () => {
    it('persists the checkpoint payload', async () => {
      vi.mocked(prisma.video.update).mockResolvedValue({} as never);
      const checkpoint = { stage: 'musicbrainz', at: '2026-07-12T00:00:00.000Z' };

      await VideoRepository.setEnrichmentProgress('video-123', checkpoint);

      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        data: { enrichmentProgress: checkpoint },
      });
    });
  });

  describe('getEnrichmentState', () => {
    it('selects the enrichment lifecycle projection', async () => {
      vi.mocked(prisma.video.findUnique).mockResolvedValue(null);

      await VideoRepository.getEnrichmentState('video-123');

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'video-123' },
        select: {
          id: true,
          enrichmentStatus: true,
          enrichmentError: true,
          enrichmentStartedAt: true,
          enrichmentJobToken: true,
          enrichmentProgress: true,
          enrichedAt: true,
          category: true,
          artist: true,
          title: true,
          releasedOn: true,
          s3Key: true,
        },
      });
    });
  });
});
