/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { ReleaseDigitalFormatRepository } from './release-digital-format-repository';

import type { ReleaseDigitalFormat, Prisma } from '@prisma/client';

vi.mock('server-only', () => ({}));

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    releaseDigitalFormat: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    releaseDigitalFormatFile: {
      aggregate: vi.fn(),
    },
  },
}));

describe('ReleaseDigitalFormatRepository', () => {
  let repository: ReleaseDigitalFormatRepository;

  const mockReleaseId = '507f1f77bcf86cd799439011';
  const mockS3Key = 'releases/123/digital-formats/MP3_320KBPS/album.mp3';

  function createMockFormat(overrides?: Partial<ReleaseDigitalFormat>): ReleaseDigitalFormat {
    return {
      id: 'format123',
      releaseId: mockReleaseId,
      formatType: 'MP3_320KBPS',
      s3Key: mockS3Key,
      fileName: 'album.mp3',
      fileSize: BigInt(50000000),
      mimeType: 'audio/mpeg',
      trackCount: 0,
      totalFileSize: null,
      checksum: null,
      uploadedAt: new Date(),
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    repository = new ReleaseDigitalFormatRepository();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('should create a new digital format record', async () => {
      const createData: Prisma.ReleaseDigitalFormatCreateInput = {
        release: { connect: { id: mockReleaseId } },
        formatType: 'MP3_320KBPS',
        s3Key: mockS3Key,
        fileName: 'album.mp3',
        fileSize: BigInt(50000000),
        mimeType: 'audio/mpeg',
        uploadedAt: new Date(),
      };

      const mockCreatedFormat = createMockFormat();

      vi.mocked(prisma.releaseDigitalFormat.create).mockResolvedValue(mockCreatedFormat);

      const result = await repository.create(createData);

      expect(prisma.releaseDigitalFormat.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(result).toEqual(mockCreatedFormat);
    });

    it('should enforce unique constraint on releaseId + formatType', async () => {
      const createData: Prisma.ReleaseDigitalFormatCreateInput = {
        release: { connect: { id: mockReleaseId } },
        formatType: 'MP3_320KBPS',
        s3Key: mockS3Key,
        fileName: 'album.mp3',
        fileSize: BigInt(50000000),
        mimeType: 'audio/mpeg',
        uploadedAt: new Date(),
      };

      const uniqueViolationError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });

      vi.mocked(prisma.releaseDigitalFormat.create).mockRejectedValue(uniqueViolationError);

      await expect(repository.create(createData)).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('findByReleaseAndFormat', () => {
    it('should find a digital format by releaseId and formatType', async () => {
      const mockFormat = createMockFormat();

      vi.mocked(prisma.releaseDigitalFormat.findUnique).mockResolvedValue(mockFormat);

      const result = await repository.findByReleaseAndFormat(mockReleaseId, 'MP3_320KBPS');

      expect(prisma.releaseDigitalFormat.findUnique).toHaveBeenCalledWith({
        where: {
          releaseId_formatType: {
            releaseId: mockReleaseId,
            formatType: 'MP3_320KBPS',
          },
        },
        include: { files: { orderBy: { trackNumber: 'asc' } } },
      });
      expect(result).toEqual(mockFormat);
    });

    it('should return null if format not found', async () => {
      vi.mocked(prisma.releaseDigitalFormat.findUnique).mockResolvedValue(null);

      const result = await repository.findByReleaseAndFormat(mockReleaseId, 'FLAC');

      expect(result).toBeNull();
    });

    it('should exclude soft-deleted formats by default', async () => {
      const deletedFormat = createMockFormat({ deletedAt: new Date() });

      vi.mocked(prisma.releaseDigitalFormat.findUnique).mockResolvedValue(deletedFormat);

      const result = await repository.findByReleaseAndFormat(mockReleaseId, 'MP3_320KBPS');

      expect(result).toBeNull();
    });
  });

  describe('findAllByRelease', () => {
    it('should find all active digital formats for a release', async () => {
      const mockFormats: ReleaseDigitalFormat[] = [
        createMockFormat({ id: 'format1', s3Key: 'releases/123/MP3/album.mp3' }),
        createMockFormat({
          id: 'format2',
          formatType: 'FLAC',
          s3Key: 'releases/123/FLAC/album.flac',
          fileName: 'album.flac',
          fileSize: BigInt(200000000),
          mimeType: 'audio/flac',
        }),
      ];

      vi.mocked(prisma.releaseDigitalFormat.findMany).mockResolvedValue(mockFormats);

      const result = await repository.findAllByRelease(mockReleaseId);

      expect(prisma.releaseDigitalFormat.findMany).toHaveBeenCalledWith({
        where: {
          releaseId: mockReleaseId,
          OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
        },
        include: { files: { orderBy: { trackNumber: 'asc' } } },
      });
      expect(result).toHaveLength(2);
      expect(result).toEqual(mockFormats);
    });

    it('should return empty array if no formats exist', async () => {
      vi.mocked(prisma.releaseDigitalFormat.findMany).mockResolvedValue([]);

      const result = await repository.findAllByRelease(mockReleaseId);

      expect(result).toEqual([]);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a format by setting deletedAt timestamp', async () => {
      const now = new Date();
      const updatedFormat = createMockFormat({ deletedAt: now });

      vi.mocked(prisma.releaseDigitalFormat.update).mockResolvedValue(updatedFormat);

      const result = await repository.softDelete(mockReleaseId, 'MP3_320KBPS');

      expect(prisma.releaseDigitalFormat.update).toHaveBeenCalledWith({
        where: {
          releaseId_formatType: {
            releaseId: mockReleaseId,
            formatType: 'MP3_320KBPS',
          },
        },
        data: {
          deletedAt: expect.any(Date),
        },
      });
      expect(result.deletedAt).not.toBeNull();
    });

    it('should preserve S3 key during soft delete for grace period restoration', async () => {
      const updatedFormat = createMockFormat({ deletedAt: new Date() });

      vi.mocked(prisma.releaseDigitalFormat.update).mockResolvedValue(updatedFormat);

      const result = await repository.softDelete(mockReleaseId, 'MP3_320KBPS');

      expect(result.s3Key).toBe(mockS3Key);
    });
  });

  describe('updateS3Key', () => {
    it('should update the s3Key for an existing format', async () => {
      const newS3Key = 'releases/123/digital-formats/MP3_320KBPS/new-album.mp3';
      const updatedFormat = createMockFormat({ s3Key: newS3Key, fileName: 'new-album.mp3' });

      vi.mocked(prisma.releaseDigitalFormat.update).mockResolvedValue(updatedFormat);

      const result = await repository.updateS3Key(mockReleaseId, 'MP3_320KBPS', newS3Key);

      expect(prisma.releaseDigitalFormat.update).toHaveBeenCalledWith({
        where: {
          releaseId_formatType: {
            releaseId: mockReleaseId,
            formatType: 'MP3_320KBPS',
          },
        },
        data: {
          s3Key: newS3Key,
        },
      });
      expect(result.s3Key).toBe(newS3Key);
    });

    it('should throw error if format does not exist', async () => {
      const notFoundError = Object.assign(new Error('Record to update not found'), {
        code: 'P2025',
      });

      vi.mocked(prisma.releaseDigitalFormat.update).mockRejectedValue(notFoundError);

      await expect(repository.updateS3Key(mockReleaseId, 'FLAC', 'new-key')).rejects.toThrow(
        'Record to update not found'
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted format by setting deletedAt to null', async () => {
      const restoredFormat = createMockFormat({ deletedAt: null });
      vi.mocked(prisma.releaseDigitalFormat.update).mockResolvedValue(restoredFormat);

      const result = await repository.restore(mockReleaseId, 'MP3_320KBPS');

      expect(prisma.releaseDigitalFormat.update).toHaveBeenCalledWith({
        where: {
          releaseId_formatType: {
            releaseId: mockReleaseId,
            formatType: 'MP3_320KBPS',
          },
        },
        data: { deletedAt: null },
      });
      expect(result.deletedAt).toBeNull();
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete a format record', async () => {
      const deletedFormat = createMockFormat();
      vi.mocked(prisma.releaseDigitalFormat.delete).mockResolvedValue(deletedFormat);

      const result = await repository.hardDelete(mockReleaseId, 'MP3_320KBPS');

      expect(prisma.releaseDigitalFormat.delete).toHaveBeenCalledWith({
        where: {
          releaseId_formatType: {
            releaseId: mockReleaseId,
            formatType: 'MP3_320KBPS',
          },
        },
      });
      expect(result).toEqual(deletedFormat);
    });
  });

  describe('findExpiredDeleted', () => {
    it('should find formats deleted before a given date', async () => {
      const expiryDate = new Date('2025-01-01');
      const expiredFormats = [
        createMockFormat({ id: 'f1', deletedAt: new Date('2024-06-01') }),
        createMockFormat({ id: 'f2', deletedAt: new Date('2024-09-01') }),
      ];
      vi.mocked(prisma.releaseDigitalFormat.findMany).mockResolvedValue(expiredFormats);

      const result = await repository.findExpiredDeleted(expiryDate);

      expect(prisma.releaseDigitalFormat.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: {
            not: null,
            lt: expiryDate,
          },
        },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('upsertParent', () => {
    it('should create a new parent format record if it does not exist', async () => {
      const newFormat = createMockFormat({ trackCount: 0 });
      vi.mocked(prisma.releaseDigitalFormat.upsert).mockResolvedValue(newFormat);

      const result = await repository.upsertParent(mockReleaseId, 'MP3_320KBPS');

      expect(prisma.releaseDigitalFormat.upsert).toHaveBeenCalledWith({
        where: {
          releaseId_formatType: { releaseId: mockReleaseId, formatType: 'MP3_320KBPS' },
        },
        create: {
          release: { connect: { id: mockReleaseId } },
          formatType: 'MP3_320KBPS',
          trackCount: 0,
        },
        update: {
          deletedAt: null,
        },
      });
      expect(result).toEqual(newFormat);
    });

    it('should restore soft-deleted format on upsert', async () => {
      const restoredFormat = createMockFormat({ deletedAt: null });
      vi.mocked(prisma.releaseDigitalFormat.upsert).mockResolvedValue(restoredFormat);

      const result = await repository.upsertParent(mockReleaseId, 'FLAC');

      expect(result.deletedAt).toBeNull();
    });
  });

  describe('updateTrackCounts', () => {
    it('should recalculate trackCount and totalFileSize from child files', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.aggregate).mockResolvedValue({
        _count: 5,
        _sum: { fileSize: BigInt(100000000) },
        _avg: { fileSize: null },
        _min: { fileSize: null },
        _max: { fileSize: null },
      } as never);
      const updatedFormat = createMockFormat({ trackCount: 5, totalFileSize: BigInt(100000000) });
      vi.mocked(prisma.releaseDigitalFormat.update).mockResolvedValue(updatedFormat);

      const result = await repository.updateTrackCounts('format123');

      expect(prisma.releaseDigitalFormatFile.aggregate).toHaveBeenCalledWith({
        where: { formatId: 'format123' },
        _count: true,
        _sum: { fileSize: true },
      });
      expect(prisma.releaseDigitalFormat.update).toHaveBeenCalledWith({
        where: { id: 'format123' },
        data: {
          trackCount: 5,
          totalFileSize: BigInt(100000000),
        },
      });
      expect(result.trackCount).toBe(5);
    });

    it('should default totalFileSize to 0 when no files exist', async () => {
      vi.mocked(prisma.releaseDigitalFormatFile.aggregate).mockResolvedValue({
        _count: 0,
        _sum: { fileSize: null },
        _avg: { fileSize: null },
        _min: { fileSize: null },
        _max: { fileSize: null },
      } as never);
      const updatedFormat = createMockFormat({ trackCount: 0, totalFileSize: BigInt(0) });
      vi.mocked(prisma.releaseDigitalFormat.update).mockResolvedValue(updatedFormat);

      await repository.updateTrackCounts('format-empty');

      expect(prisma.releaseDigitalFormat.update).toHaveBeenCalledWith({
        where: { id: 'format-empty' },
        data: {
          trackCount: 0,
          totalFileSize: BigInt(0),
        },
      });
    });
  });
});
