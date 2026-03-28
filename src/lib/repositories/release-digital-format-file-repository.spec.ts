/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { prisma } from '@/lib/prisma';

import { ReleaseDigitalFormatFileRepository } from './release-digital-format-file-repository';

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
    vi.clearAllMocks();
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
});
