/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { SOFT_DELETE_GRACE_PERIOD_DAYS } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';
import { generatePresignedDownloadUrl } from '@/lib/utils/s3-client';

import { DownloadAuthorizationService } from './download-authorization-service';

import type { ReleaseDigitalFormat, ReleasePurchase } from '@prisma/client';

// Mock Prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    releasePurchase: {
      findUnique: vi.fn(),
    },
    releaseDigitalFormat: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock S3 client
vi.mock('@/lib/utils/s3-client', () => ({
  generatePresignedDownloadUrl: vi.fn(),
}));

describe('DownloadAuthorizationService', () => {
  let service: DownloadAuthorizationService;

  const mockUserId = '507f1f77bcf86cd799439011';
  const mockReleaseId = '507f1f77bcf86cd799439012';
  const mockFormatType: DigitalFormatType = 'MP3_320KBPS';
  const mockS3Key = 'releases/123/digital-formats/MP3_320KBPS/album.mp3';
  const mockFileName = 'album.mp3';

  function createMockFormat(overrides?: Partial<ReleaseDigitalFormat>): ReleaseDigitalFormat {
    return {
      id: 'format123',
      releaseId: mockReleaseId,
      formatType: mockFormatType,
      s3Key: mockS3Key,
      fileName: mockFileName,
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
    service = new DownloadAuthorizationService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('checkPurchaseStatus', () => {
    it('should return true when user has a successful purchase', async () => {
      const mockPurchase: Partial<ReleasePurchase> = {
        id: 'purchase123',
        userId: mockUserId,
        releaseId: mockReleaseId,
        amountPaid: 500,
        currency: 'usd',
      };

      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(
        mockPurchase as ReleasePurchase
      );

      const result = await service.checkPurchaseStatus(mockUserId, mockReleaseId);

      expect(prisma.releasePurchase.findUnique).toHaveBeenCalledWith({
        where: {
          userId_releaseId: {
            userId: mockUserId,
            releaseId: mockReleaseId,
          },
        },
      });
      expect(result).toBe(true);
    });

    it('should return false when user has no purchase', async () => {
      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(null);

      const result = await service.checkPurchaseStatus(mockUserId, mockReleaseId);

      expect(result).toBe(false);
    });
  });

  describe('checkFormatExists', () => {
    it('should return format record when format exists and is not deleted', async () => {
      const mockFormat = createMockFormat();

      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(mockFormat);

      const result = await service.checkFormatExists(mockReleaseId, mockFormatType);

      expect(prisma.releaseDigitalFormat.findFirst).toHaveBeenCalledWith({
        where: {
          releaseId: mockReleaseId,
          formatType: mockFormatType,
          deletedAt: null,
        },
      });
      expect(result).toEqual(mockFormat);
    });

    it('should return null when format does not exist', async () => {
      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(null);

      const result = await service.checkFormatExists(mockReleaseId, mockFormatType);

      expect(result).toBeNull();
    });

    it('should return null when format is soft-deleted', async () => {
      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(null);

      const result = await service.checkFormatExists(mockReleaseId, mockFormatType);

      expect(result).toBeNull();
    });
  });

  describe('checkSoftDeleteGracePeriod', () => {
    it('should return true when format is not deleted', async () => {
      const mockFormat = createMockFormat();

      const result = await service.checkSoftDeleteGracePeriod(mockFormat);

      expect(result).toBe(true);
    });

    it('should return true when within grace period', async () => {
      // Deleted 45 days ago (within 90-day grace period)
      const deletedDate = new Date();
      deletedDate.setDate(deletedDate.getDate() - 45);

      const mockFormat = createMockFormat({ deletedAt: deletedDate });

      const result = await service.checkSoftDeleteGracePeriod(mockFormat);

      expect(result).toBe(true);
    });

    it('should return false when beyond grace period', async () => {
      // Deleted 100 days ago (beyond 90-day grace period)
      const deletedDate = new Date();
      deletedDate.setDate(deletedDate.getDate() - (SOFT_DELETE_GRACE_PERIOD_DAYS + 10));

      const mockFormat = createMockFormat({ deletedAt: deletedDate });

      const result = await service.checkSoftDeleteGracePeriod(mockFormat);

      expect(result).toBe(false);
    });

    it('should return true on grace period boundary (exactly 90 days)', async () => {
      vi.useFakeTimers();

      // Deleted exactly 90 days ago
      const deletedDate = new Date();
      deletedDate.setDate(deletedDate.getDate() - SOFT_DELETE_GRACE_PERIOD_DAYS);

      const mockFormat = createMockFormat({ deletedAt: deletedDate });

      const result = await service.checkSoftDeleteGracePeriod(mockFormat);

      expect(result).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('generateDownloadUrl', () => {
    it('should generate presigned download URL with 24-hour expiration', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature=xyz';

      vi.mocked(generatePresignedDownloadUrl).mockResolvedValue(mockPresignedUrl);

      const result = await service.generateDownloadUrl(mockS3Key, mockFileName);

      expect(generatePresignedDownloadUrl).toHaveBeenCalledWith(mockS3Key, mockFileName);
      expect(result).toBe(mockPresignedUrl);
    });
  });

  describe('authorizeDownload', () => {
    const mockFormat = createMockFormat();

    it('should authorize download when all checks pass', async () => {
      const mockPurchase: Partial<ReleasePurchase> = {
        id: 'purchase123',
        userId: mockUserId,
        releaseId: mockReleaseId,
        amountPaid: 500,
      };
      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature=xyz';

      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(
        mockPurchase as ReleasePurchase
      );
      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(mockFormat);
      vi.mocked(generatePresignedDownloadUrl).mockResolvedValue(mockPresignedUrl);

      const result = await service.authorizeDownload(mockUserId, mockReleaseId, mockFormatType);

      expect(result).toEqual({
        authorized: true,
        downloadUrl: mockPresignedUrl,
        format: mockFormat,
      });
    });

    it('should deny download when user has not purchased', async () => {
      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(null);

      const result = await service.authorizeDownload(mockUserId, mockReleaseId, mockFormatType);

      expect(result).toEqual({
        authorized: false,
        errorCode: 'PURCHASE_REQUIRED',
        message: 'Purchase required to download this release',
      });

      // Should not check format or generate URL
      expect(prisma.releaseDigitalFormat.findFirst).not.toHaveBeenCalled();
      expect(generatePresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('should deny download when format does not exist', async () => {
      const mockPurchase: Partial<ReleasePurchase> = {
        id: 'purchase123',
        userId: mockUserId,
        releaseId: mockReleaseId,
        amountPaid: 500,
      };

      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(
        mockPurchase as ReleasePurchase
      );
      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(null);

      const result = await service.authorizeDownload(mockUserId, mockReleaseId, mockFormatType);

      expect(result).toEqual({
        authorized: false,
        errorCode: 'FORMAT_NOT_FOUND',
        message: 'Digital format not available',
      });

      // Should not generate URL
      expect(generatePresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('should deny download when format is beyond grace period', async () => {
      // Deleted 100 days ago
      const deletedDate = new Date();
      deletedDate.setDate(deletedDate.getDate() - (SOFT_DELETE_GRACE_PERIOD_DAYS + 10));

      const deletedFormat = createMockFormat({ deletedAt: deletedDate });

      const mockPurchase: Partial<ReleasePurchase> = {
        id: 'purchase123',
        userId: mockUserId,
        releaseId: mockReleaseId,
        amountPaid: 500,
      };

      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(
        mockPurchase as ReleasePurchase
      );
      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(deletedFormat);

      const result = await service.authorizeDownload(mockUserId, mockReleaseId, mockFormatType);

      expect(result).toEqual({
        authorized: false,
        errorCode: 'FORMAT_EXPIRED',
        message: 'Digital format no longer available',
      });

      // Should not generate URL
      expect(generatePresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('should authorize download when format is within grace period', async () => {
      // Deleted 45 days ago
      const deletedDate = new Date();
      deletedDate.setDate(deletedDate.getDate() - 45);

      const deletedFormat = createMockFormat({ deletedAt: deletedDate });

      const mockPurchase: Partial<ReleasePurchase> = {
        id: 'purchase123',
        userId: mockUserId,
        releaseId: mockReleaseId,
        amountPaid: 500,
      };
      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature=xyz';

      vi.mocked(prisma.releasePurchase.findUnique).mockResolvedValue(
        mockPurchase as ReleasePurchase
      );
      vi.mocked(prisma.releaseDigitalFormat.findFirst).mockResolvedValue(deletedFormat);
      vi.mocked(generatePresignedDownloadUrl).mockResolvedValue(mockPresignedUrl);

      const result = await service.authorizeDownload(mockUserId, mockReleaseId, mockFormatType);

      expect(result).toEqual({
        authorized: true,
        downloadUrl: mockPresignedUrl,
        format: deletedFormat,
      });
    });
  });
});
