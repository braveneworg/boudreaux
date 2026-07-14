/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import {
  ReleaseDigitalFormatFileRepository,
  type TrackFileWithRelease,
} from './release-digital-format-file-repository';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    releaseDigitalFormatFile: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('ReleaseDigitalFormatFileRepository', () => {
  let repo: ReleaseDigitalFormatFileRepository;

  const mockFile = {
    id: 'file-1',
    formatId: 'format-1',
    trackNumber: 1,
    s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/1-song.mp3',
    fileName: 'song1.mp3',
    fileSize: BigInt(10000000),
    mimeType: 'audio/mpeg',
    checksum: null,
    title: null,
    duration: null,
    uploadedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    repo = new ReleaseDigitalFormatFileRepository();
  });

  describe('create', () => {
    it('should create a single track file record', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.create).mockResolvedValue(mockFile);

      const result = await repo.create({
        formatId: 'format-1',
        trackNumber: 1,
        s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/1-song.mp3',
        fileName: 'song1.mp3',
        fileSize: BigInt(10000000),
        mimeType: 'audio/mpeg',
      });

      expect(result).toEqual(mockFile);
      expect(prisma.releaseDigitalFormatFile.create).toHaveBeenCalledWith({
        data: {
          format: { connect: { id: 'format-1' } },
          trackNumber: 1,
          s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/1-song.mp3',
          fileName: 'song1.mp3',
          fileSize: BigInt(10000000),
          mimeType: 'audio/mpeg',
        },
      });
    });
  });

  describe('createMany', () => {
    it('should create multiple track file records and return count', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.createMany).mockResolvedValue({ count: 3 });

      const files = [
        {
          trackNumber: 1,
          s3Key: 'key-1',
          fileName: 'song1.mp3',
          fileSize: BigInt(10000000),
          mimeType: 'audio/mpeg',
        },
        {
          trackNumber: 2,
          s3Key: 'key-2',
          fileName: 'song2.mp3',
          fileSize: BigInt(12000000),
          mimeType: 'audio/mpeg',
        },
        {
          trackNumber: 3,
          s3Key: 'key-3',
          fileName: 'song3.mp3',
          fileSize: BigInt(8000000),
          mimeType: 'audio/mpeg',
        },
      ];

      const count = await repo.createMany('format-1', files);

      expect(count).toBe(3);
      expect(prisma.releaseDigitalFormatFile.createMany).toHaveBeenCalledWith({
        data: files.map((f) => ({
          formatId: 'format-1',
          trackNumber: f.trackNumber,
          s3Key: f.s3Key,
          fileName: f.fileName,
          fileSize: f.fileSize,
          mimeType: f.mimeType,
        })),
      });
    });

    it('should pass through title and duration when provided', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.createMany).mockResolvedValue({ count: 1 });

      await repo.createMany('format-1', [
        {
          trackNumber: 1,
          s3Key: 'k',
          fileName: 'song.mp3',
          fileSize: BigInt(1),
          mimeType: 'audio/mpeg',
          title: 'My Song',
          duration: 215,
        },
      ]);

      expect(prisma.releaseDigitalFormatFile.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ title: 'My Song', duration: 215 })],
      });
    });
  });

  describe('findAllByFormatId', () => {
    it('should return all files ordered by trackNumber', async () => {
      const files = [mockFile, { ...mockFile, id: 'file-2', trackNumber: 2 }];
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue(files);

      const result = await repo.findAllByFormatId('format-1');

      expect(result).toEqual(files);
      expect(prisma.releaseDigitalFormatFile.findMany).toHaveBeenCalledWith({
        where: { formatId: 'format-1' },
        orderBy: { trackNumber: 'asc' },
      });
    });
  });

  describe('findByFormatAndTrack', () => {
    it('should return a specific track file', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findUnique).mockResolvedValue(mockFile);

      const result = await repo.findByFormatAndTrack('format-1', 1);

      expect(result).toEqual(mockFile);
      expect(prisma.releaseDigitalFormatFile.findUnique).toHaveBeenCalledWith({
        where: {
          formatId_trackNumber: { formatId: 'format-1', trackNumber: 1 },
        },
      });
    });

    it('should return null when track not found', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findUnique).mockResolvedValue(null);

      const result = await repo.findByFormatAndTrack('format-1', 99);

      expect(result).toBeNull();
    });
  });

  describe('deleteAllByFormatId', () => {
    it('should delete all files for a format and return count', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.deleteMany).mockResolvedValue({ count: 5 });

      const count = await repo.deleteAllByFormatId('format-1');

      expect(count).toBe(5);
      expect(prisma.releaseDigitalFormatFile.deleteMany).toHaveBeenCalledWith({
        where: { formatId: 'format-1' },
      });
    });
  });

  describe('deleteById', () => {
    it('should delete a single file by ID', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.delete).mockResolvedValue(mockFile);

      const result = await repo.deleteById('file-1');

      expect(result).toEqual(mockFile);
      expect(prisma.releaseDigitalFormatFile.delete).toHaveBeenCalledWith({
        where: { id: 'file-1' },
      });
    });
  });

  describe('getFileCount', () => {
    it('should return file count for a format', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.count).mockResolvedValue(10);

      const count = await repo.getFileCount('format-1');

      expect(count).toBe(10);
      expect(prisma.releaseDigitalFormatFile.count).toHaveBeenCalledWith({
        where: { formatId: 'format-1' },
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // The expected select shape shared by both new methods. Pinning it here
  // ensures fileSize is never added back (BigInt breaks JSON serialization).
  // ──────────────────────────────────────────────────────────────────────────
  const TRACK_FILE_WITH_RELEASE_SELECT = {
    id: true,
    trackNumber: true,
    title: true,
    duration: true,
    s3Key: true,
    fileName: true,
    mimeType: true,
    format: {
      select: {
        formatType: true,
        releaseId: true,
        release: {
          select: {
            id: true,
            title: true,
            coverArt: true,
            publishedAt: true,
            artistReleases: {
              select: {
                artist: {
                  select: {
                    displayName: true,
                    firstName: true,
                    surname: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  } as const;

  const mockTrackFileWithRelease: TrackFileWithRelease = {
    id: 'file-1',
    trackNumber: 1,
    title: 'Song One',
    duration: 215,
    s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/1-song.mp3',
    fileName: 'song1.mp3',
    mimeType: 'audio/mpeg',
    format: {
      formatType: 'MP3_320KBPS',
      releaseId: 'release-1',
      release: {
        id: 'release-1',
        title: 'My Album',
        coverArt: 'https://example.com/cover.jpg',
        publishedAt: new Date('2024-01-01'),
        artistReleases: [
          {
            artist: {
              displayName: 'Artist One',
              firstName: 'Artist',
              surname: 'One',
            },
          },
        ],
      },
    },
  };

  describe('findManyByIdsWithRelease', () => {
    it('should call findMany with id-in where and the exact select (fileSize excluded)', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue([
        mockTrackFileWithRelease,
      ] as never);

      const result = await repo.findManyByIdsWithRelease(['file-1', 'file-2']);

      expect(result).toEqual([mockTrackFileWithRelease]);
      expect(prisma.releaseDigitalFormatFile.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['file-1', 'file-2'] } },
        select: TRACK_FILE_WITH_RELEASE_SELECT,
      });
    });

    it('should return an empty array when ids list is empty', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue([]);

      const result = await repo.findManyByIdsWithRelease([]);

      expect(result).toEqual([]);
      expect(prisma.releaseDigitalFormatFile.findMany).toHaveBeenCalledWith({
        where: { id: { in: [] } },
        select: TRACK_FILE_WITH_RELEASE_SELECT,
      });
    });

    it('should not include fileSize in the select', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue([]);

      await repo.findManyByIdsWithRelease([]);

      const [call] = vi.mocked(prisma.releaseDigitalFormatFile.findMany).mock.calls;
      expect(call[0]).not.toHaveProperty('select.fileSize');
    });

    it('should propagate a DataError when prisma throws', async () => {
      const prismaError = Object.assign(new Error('DB error'), { code: 'P2025' });
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockRejectedValue(prismaError);

      await expect(repo.findManyByIdsWithRelease(['file-1'])).rejects.toThrow('DB error');
    });
  });

  describe('searchTracksByTitle', () => {
    it('should call findMany with title search, MP3_320KBPS format filter, and published-release filter', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue([
        mockTrackFileWithRelease,
      ] as never);

      const result = await repo.searchTracksByTitle('song', 10);

      expect(result).toEqual([mockTrackFileWithRelease]);
      expect(prisma.releaseDigitalFormatFile.findMany).toHaveBeenCalledWith({
        where: {
          title: { contains: 'song', mode: 'insensitive' },
          format: {
            is: {
              formatType: 'MP3_320KBPS',
              release: {
                is: {
                  publishedAt: { not: null },
                  AND: [{ OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }] }],
                },
              },
            },
          },
        },
        take: 10,
        select: TRACK_FILE_WITH_RELEASE_SELECT,
      });
    });

    it('should respect the take limit', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue([]);

      await repo.searchTracksByTitle('query', 5);

      const [call] = vi.mocked(prisma.releaseDigitalFormatFile.findMany).mock.calls;
      expect(call[0]).toMatchObject({ take: 5 });
    });

    it('should not include fileSize in the select', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockResolvedValue([]);

      await repo.searchTracksByTitle('x', 1);

      const [call] = vi.mocked(prisma.releaseDigitalFormatFile.findMany).mock.calls;
      expect(call[0]).not.toHaveProperty('select.fileSize');
    });

    it('should propagate a DataError when prisma throws', async () => {
      const prismaError = Object.assign(new Error('DB error'), { code: 'P2025' });
      vi.mocked(prisma.releaseDigitalFormatFile.findMany).mockRejectedValue(prismaError);

      await expect(repo.searchTracksByTitle('x', 10)).rejects.toThrow('DB error');
    });
  });
});
