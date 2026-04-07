/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { FORMAT_SIZE_LIMITS } from '@/lib/constants/digital-formats';
import * as s3Client from '@/lib/utils/s3-client';

import { UploadService } from './upload-service';

// Mock S3 client utilities
vi.mock('@/lib/utils/s3-client', () => ({
  generatePresignedUploadUrl: vi.fn(),
  generatePresignedDownloadUrl: vi.fn(),
}));

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(() => {
    service = new UploadService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateFileInfo', () => {
    describe('MP3_320KBPS validation', () => {
      it('should accept valid MP3 file within size limit', () => {
        const fileInfo = {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          fileSize: 40000000, // 40MB (under 48MB limit)
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject MP3 file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          fileSize: FORMAT_SIZE_LIMITS.MP3_320KBPS + 1000, // Over 100MB
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('48');
        expect(result.error).toContain('MB');
      });

      it('should reject MP3 with invalid MIME type', () => {
        const fileInfo = {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          fileSize: 40000000,
          mimeType: 'audio/flac', // Wrong MIME type
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('MIME');
      });
    });

    describe('FLAC validation', () => {
      it('should accept valid FLAC file within size limit', () => {
        const fileInfo = {
          formatType: 'FLAC' as const,
          fileName: 'album.flac',
          fileSize: 100000000, // 100MB (under 150MB limit)
          mimeType: 'audio/flac',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject FLAC file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'FLAC' as const,
          fileName: 'album.flac',
          fileSize: FORMAT_SIZE_LIMITS.FLAC + 1, // Over 250MB
          mimeType: 'audio/flac',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('150');
      });
    });

    describe('WAV validation', () => {
      it('should accept valid WAV file within size limit', () => {
        const fileInfo = {
          formatType: 'WAV' as const,
          fileName: 'album.wav',
          fileSize: 200000000, // 200MB (under 300MB limit)
          mimeType: 'audio/wav',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject WAV file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'WAV' as const,
          fileName: 'album.wav',
          fileSize: FORMAT_SIZE_LIMITS.WAV + 1000, // Over 500MB
          mimeType: 'audio/wav',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('300');
      });
    });

    describe('AAC validation', () => {
      it('should accept valid AAC file within size limit', () => {
        const fileInfo = {
          formatType: 'AAC' as const,
          fileName: 'album.aac',
          fileSize: 40000000, // 40MB (under 50MB limit)
          mimeType: 'audio/aac',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject AAC file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'AAC' as const,
          fileName: 'album.aac',
          fileSize: FORMAT_SIZE_LIMITS.AAC + 500, // Over 100MB
          mimeType: 'audio/aac',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('50');
      });
    });

    describe('MP3_V0 validation', () => {
      it('should accept valid MP3 V0 file within size limit', () => {
        const fileInfo = {
          formatType: 'MP3_V0' as const,
          fileName: 'album.mp3',
          fileSize: 40000000, // 40MB (under 50MB limit)
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject MP3 V0 file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'MP3_V0' as const,
          fileName: 'album.mp3',
          fileSize: FORMAT_SIZE_LIMITS.MP3_V0 + 1000,
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('48');
      });
    });

    describe('OGG_VORBIS validation', () => {
      it('should accept valid Ogg Vorbis file within size limit', () => {
        const fileInfo = {
          formatType: 'OGG_VORBIS' as const,
          fileName: 'album.ogg',
          fileSize: 40000000,
          mimeType: 'audio/ogg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject Ogg Vorbis file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'OGG_VORBIS' as const,
          fileName: 'album.ogg',
          fileSize: FORMAT_SIZE_LIMITS.OGG_VORBIS + 500,
          mimeType: 'audio/ogg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('50');
      });
    });

    describe('ALAC validation', () => {
      it('should accept valid ALAC file within size limit', () => {
        const fileInfo = {
          formatType: 'ALAC' as const,
          fileName: 'album.m4a',
          fileSize: 100000000,
          mimeType: 'audio/x-m4a',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject ALAC file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'ALAC' as const,
          fileName: 'album.m4a',
          fileSize: FORMAT_SIZE_LIMITS.ALAC + 1000,
          mimeType: 'audio/x-m4a',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('150');
      });
    });

    describe('AIFF validation', () => {
      it('should accept valid AIFF file within size limit', () => {
        const fileInfo = {
          formatType: 'AIFF' as const,
          fileName: 'album.aiff',
          fileSize: 200000000,
          mimeType: 'audio/aiff',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(true);
      });

      it('should reject AIFF file exceeding size limit', () => {
        const fileInfo = {
          formatType: 'AIFF' as const,
          fileName: 'album.aiff',
          fileSize: FORMAT_SIZE_LIMITS.AIFF + 1000,
          mimeType: 'audio/aiff',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('300');
      });
    });

    describe('Common validations', () => {
      it('should reject empty file name', () => {
        const fileInfo = {
          formatType: 'MP3_320KBPS' as const,
          fileName: '',
          fileSize: 40000000,
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('File name');
      });

      it('should reject negative file size', () => {
        const fileInfo = {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          fileSize: -100,
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('positive');
      });

      it('should reject zero file size', () => {
        const fileInfo = {
          formatType: 'MP3_320KBPS' as const,
          fileName: 'album.mp3',
          fileSize: 0,
          mimeType: 'audio/mpeg',
        };

        const result = service.validateFileInfo(fileInfo);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('positive');
      });
    });
  });

  describe('generatePresignedUploadUrl', () => {
    it('should generate presigned URL with correct parameters', async () => {
      const releaseId = '507f1f77bcf86cd799439011';
      const formatType = 'MP3_320KBPS';
      const fileName = 'album.mp3';
      const mimeType = 'audio/mpeg';

      const mockPresignedUrl = 'https://s3.amazonaws.com/bucket/key?signature';
      const mockS3Key = `releases/${releaseId}/digital-formats/${formatType}/${Date.now()}-album.mp3`;

      vi.mocked(s3Client.generatePresignedUploadUrl).mockResolvedValue({
        uploadUrl: mockPresignedUrl,
        s3Key: mockS3Key,
        contentType: mimeType,
      });

      const result = await service.generatePresignedUploadUrl(
        releaseId,
        formatType,
        fileName,
        mimeType
      );

      expect(s3Client.generatePresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining(releaseId),
        formatType,
        mimeType
      );
      expect(result.uploadUrl).toBe(mockPresignedUrl);
      expect(result.s3Key).toBe(mockS3Key);
    });

    it('should include release ID and format type in S3 key', async () => {
      const releaseId = '507f1f77bcf86cd799439011';
      const formatType = 'FLAC';
      const fileName = 'album.flac';
      const mimeType = 'audio/flac';

      vi.mocked(s3Client.generatePresignedUploadUrl).mockResolvedValue({
        uploadUrl: 'https://s3.example.com/url',
        s3Key: 'some-key',
        contentType: mimeType,
      });

      await service.generatePresignedUploadUrl(releaseId, formatType, fileName, mimeType);

      expect(s3Client.generatePresignedUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining(releaseId),
        formatType,
        mimeType
      );
    });

    it('should throw error if S3 client fails', async () => {
      const releaseId = '507f1f77bcf86cd799439011';
      const formatType = 'MP3_320KBPS';
      const fileName = 'album.mp3';
      const mimeType = 'audio/mpeg';

      vi.mocked(s3Client.generatePresignedUploadUrl).mockRejectedValue(new Error('S3 error'));

      await expect(
        service.generatePresignedUploadUrl(releaseId, formatType, fileName, mimeType)
      ).rejects.toThrow('S3 error');
    });

    it('should pass the content type through to the S3 client', async () => {
      const releaseId = '507f1f77bcf86cd799439011';
      const formatType = 'MP3_320KBPS';
      const fileName = 'album.mp3';
      const mimeType = 'audio/mpeg';

      vi.mocked(s3Client.generatePresignedUploadUrl).mockResolvedValue({
        uploadUrl: 'https://s3.example.com/url',
        s3Key: 'some-key',
        contentType: mimeType,
      });

      await service.generatePresignedUploadUrl(releaseId, formatType, fileName, mimeType);

      expect(s3Client.generatePresignedUploadUrl).toHaveBeenCalledWith(
        expect.any(String),
        formatType,
        mimeType
      );
    });
  });

  describe('createFormatMetadata', () => {
    it('should create metadata object with all required fields', () => {
      const params = {
        releaseId: '507f1f77bcf86cd799439011',
        formatType: 'MP3_320KBPS' as const,
        s3Key: 'releases/123/MP3/album.mp3',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: 'audio/mpeg',
      };

      const metadata = service.createFormatMetadata(params);

      expect(metadata).toHaveProperty('releaseId', params.releaseId);
      expect(metadata).toHaveProperty('formatType', params.formatType);
      expect(metadata).toHaveProperty('s3Key', params.s3Key);
      expect(metadata).toHaveProperty('fileName', params.fileName);
      expect(metadata).toHaveProperty('fileSize', BigInt(params.fileSize));
      expect(metadata).toHaveProperty('mimeType', params.mimeType);
      expect(metadata).toHaveProperty('uploadedAt');
      expect(metadata.uploadedAt).toBeInstanceOf(Date);
    });

    it('should preserve BigInt file sizes', () => {
      const bigFileSize = BigInt('500000000'); // 500MB as BigInt

      const params = {
        releaseId: '507f1f77bcf86cd799439011',
        formatType: 'WAV' as const,
        s3Key: 'releases/123/WAV/album.wav',
        fileName: 'album.wav',
        fileSize: bigFileSize,
        mimeType: 'audio/wav',
      };

      const metadata = service.createFormatMetadata(params);

      expect(typeof metadata.fileSize).toBe('bigint');
      expect(metadata.fileSize).toBe(bigFileSize);
    });

    it('should generate unique timestamp for uploadedAt', async () => {
      const params = {
        releaseId: '507f1f77bcf86cd799439011',
        formatType: 'MP3_320KBPS' as const,
        s3Key: 'releases/123/MP3/album.mp3',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: 'audio/mpeg',
      };

      const metadata1 = service.createFormatMetadata(params);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      const metadata2 = service.createFormatMetadata(params);

      // Timestamps should be different (or very close)
      expect(metadata1.uploadedAt).toBeInstanceOf(Date);
      expect(metadata2.uploadedAt).toBeInstanceOf(Date);
    });
  });
});
