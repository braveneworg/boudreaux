/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ServiceResponse } from '@/lib/services/service.types';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

import { ImageUploadService } from './image-upload-service';

vi.mock('server-only', () => ({}));

// Mock shared S3 client
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: vi.fn(() => ({ send: mockSend })),
  getS3BucketName: vi.fn(() => 'test-bucket'),
}));

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn(function (this: unknown, params: unknown) {
    // Store params on the instance for assertions
    Object.assign(this as object, params);
  }),
  DeleteObjectCommand: vi.fn(function (this: unknown, params: unknown) {
    // Store params on the instance for assertions
    Object.assign(this as object, params);
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('ImageUploadService', () => {
  const expectSuccess = <T>(result: ServiceResponse<T>): T => {
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error);
    }

    return result.data;
  };

  const expectFailure = (result: ServiceResponse<unknown>): string => {
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected failure response');
    }

    return result.error;
  };

  const mockEnv = {
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'test-access-key',
    AWS_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_BUCKET: 'test-bucket',
    CDN_DOMAIN: 'https://cdn.example.com',
  };

  beforeEach(() => {
    // Set up environment variables (auto-restored by the global afterEach)
    Object.entries(mockEnv).forEach(([key, value]) => {
      vi.stubEnv(key, value);
    });
  });

  describe('presignPut', () => {
    const PUT = {
      s3Key: 'media/tours/tour123/poster-1-abc.jpg',
      mimeType: 'image/jpeg' as const,
      fileSize: 1024 * 1024,
      metadata: { tourId: 'tour123', originalFileName: 'poster.jpg' },
    };

    it('signs a 15-minute PUT for the key it is given', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      vi.mocked(getSignedUrl).mockResolvedValueOnce(mockPresignedUrl);

      const result = await ImageUploadService.presignPut(PUT);

      expect(expectSuccess(result)).toEqual({
        uploadUrl: mockPresignedUrl,
        s3Key: PUT.s3Key,
        s3Bucket: 'test-bucket',
        expiresIn: 900,
      });
      expect(vi.mocked(getSignedUrl).mock.calls[0][2]).toEqual({ expiresIn: 900 });
    });

    it('signs the object type, length, immutable caching and metadata', async () => {
      vi.mocked(getSignedUrl).mockResolvedValueOnce('https://signed');

      await ImageUploadService.presignPut(PUT);

      expect(vi.mocked(getSignedUrl).mock.calls[0][1]).toEqual(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: PUT.s3Key,
          ContentType: 'image/jpeg',
          ContentLength: 1024 * 1024,
          CacheControl: 'public, max-age=31536000, immutable',
          Metadata: PUT.metadata,
        })
      );
    });

    it('should reject files that are too large', async () => {
      const result = await ImageUploadService.presignPut({ ...PUT, fileSize: 15 * 1024 * 1024 });

      expect(expectFailure(result)).toContain('File size exceeds maximum');
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('should reject invalid file types', async () => {
      const result = await ImageUploadService.presignPut({
        ...PUT,
        mimeType: 'application/pdf' as unknown as 'image/jpeg',
      });

      expect(expectFailure(result)).toContain('Invalid file type');
    });

    it('should accept all supported image formats', async () => {
      vi.mocked(getSignedUrl)
        .mockResolvedValueOnce('https://signed/1')
        .mockResolvedValueOnce('https://signed/2')
        .mockResolvedValueOnce('https://signed/3')
        .mockResolvedValueOnce('https://signed/4');

      const results = await Promise.all(
        (['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const).map((mimeType) =>
          ImageUploadService.presignPut({ ...PUT, mimeType })
        )
      );

      expect(results.map(({ success }) => success)).toEqual([true, true, true, true]);
    });

    it('should return error when S3 bucket is not configured', async () => {
      vi.mocked(getS3BucketName).mockImplementationOnce(() => {
        throw new Error('S3 bucket not configured');
      });

      const result = await ImageUploadService.presignPut(PUT);

      expect(expectFailure(result)).toBe('Failed to generate upload URL');
    });

    it('should return error when getSignedUrl throws', async () => {
      vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error('AWS credentials invalid'));

      const result = await ImageUploadService.presignPut(PUT);

      expect(expectFailure(result)).toBe('Failed to generate upload URL');
    });

    it('should return error when AWS credentials are missing', async () => {
      vi.mocked(getS3Client).mockImplementationOnce(() => {
        throw new Error('AWS credentials not configured');
      });

      const result = await ImageUploadService.presignPut(PUT);

      expect(expectFailure(result)).toBe('Failed to generate upload URL');
    });

    it('should return "Invalid file" when validation.error is undefined', async () => {
      const spy = vi
        .spyOn(ImageUploadService, 'validateImageFile')
        .mockReturnValueOnce({ valid: false });

      const result = await ImageUploadService.presignPut(PUT);

      expect(expectFailure(result)).toBe('Invalid file');
      spy.mockRestore();
    });
  });

  describe('generateCdnUrl', () => {
    it('should generate CDN URL when CDN domain is configured', () => {
      const s3Key = 'media/tours/tour123/poster-123456.jpg';
      const result = ImageUploadService.generateCdnUrl(s3Key);

      expect(result).toBe('https://cdn.example.com/media/tours/tour123/poster-123456.jpg');
    });

    it('should generate S3 direct URL when CDN domain is not configured', () => {
      vi.stubEnv('CDN_DOMAIN', undefined);

      const s3Key = 'media/tours/tour123/poster-123456.jpg';
      const result = ImageUploadService.generateCdnUrl(s3Key);

      expect(result).toContain('s3.us-east-1.amazonaws.com');
      expect(result).toContain(s3Key);
    });

    it('falls back to the default region when AWS_REGION is unset', () => {
      vi.stubEnv('CDN_DOMAIN', undefined);
      vi.stubEnv('AWS_REGION', undefined);

      const result = ImageUploadService.generateCdnUrl('media/tours/t1/poster.jpg');

      expect(result).toContain('s3.us-east-1.amazonaws.com');
    });

    it('should handle CDN domain with or without https protocol', () => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example.com'); // No protocol

      const s3Key = 'media/tours/tour123/poster-123456.jpg';
      const result = ImageUploadService.generateCdnUrl(s3Key);

      expect(result).toBe('https://cdn.example.com/media/tours/tour123/poster-123456.jpg');
      expect(result).not.toContain('https://https://');
    });
  });

  describe('deleteFromS3', () => {
    it('should delete file from S3 successfully', async () => {
      mockSend.mockResolvedValue({});

      const result = await ImageUploadService.deleteFromS3('media/tours/tour123/poster-123456.jpg');

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(expect.any(Object));
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'media/tours/tour123/poster-123456.jpg',
      });
    });

    it('should handle S3 deletion errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('S3 delete failed'));

      const result = await ImageUploadService.deleteFromS3('media/tours/tour123/poster-123456.jpg');

      const error = expectFailure(result);

      expect(error).toContain('Failed to delete file from S3');
    });

    it('should return error when S3 bucket is not configured', async () => {
      vi.mocked(getS3BucketName).mockImplementationOnce(() => {
        throw new Error('S3 bucket not configured');
      });

      const result = await ImageUploadService.deleteFromS3('media/tours/tour123/poster-123456.jpg');

      const error = expectFailure(result);

      expect(error).toContain('Failed to delete file from S3');
    });
  });

  describe('validateImageFile', () => {
    it('should validate supported image formats', () => {
      const validFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

      validFormats.forEach((mimeType) => {
        const result = ImageUploadService.validateImageFile(mimeType, 1024 * 1024);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject non-image file types', () => {
      const invalidFormats = [
        'application/pdf',
        'text/plain',
        'video/mp4',
        'application/zip',
        'text/html',
      ];

      invalidFormats.forEach((mimeType) => {
        const result = ImageUploadService.validateImageFile(mimeType, 1024 * 1024);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid file type');
      });
    });

    it('should reject files exceeding size limit', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      const oversizedFile = maxSize + 1;

      const result = ImageUploadService.validateImageFile('image/jpeg', oversizedFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should accept files at exactly the size limit', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB

      const result = ImageUploadService.validateImageFile('image/jpeg', maxSize);

      expect(result.valid).toBe(true);
    });

    it('should reject negative file sizes', () => {
      const result = ImageUploadService.validateImageFile('image/jpeg', -100);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file size');
    });

    it('should reject zero-byte files', () => {
      const result = ImageUploadService.validateImageFile('image/jpeg', 0);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file size');
    });
  });

  describe('generateCdnUrl - env var fallbacks', () => {
    it('should use S3 direct URL with bucket name when CDN domain is not set', () => {
      vi.stubEnv('CDN_DOMAIN', undefined);

      const result = ImageUploadService.generateCdnUrl('media/tours/tour123/poster.jpg');

      expect(result).toBe(
        'https://test-bucket.s3.us-east-1.amazonaws.com/media/tours/tour123/poster.jpg'
      );
    });
  });
});
