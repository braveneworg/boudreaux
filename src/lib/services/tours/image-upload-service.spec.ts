/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ServiceResponse } from '@/lib/services/service.types';
import type { ImageUploadRequest } from '@/lib/validations/tours/image-schema';

import { ImageUploadService } from './image-upload-service';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(function (this: unknown) {
    // Return empty object - mocked client doesn't need real methods
    return {};
  }),
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
    vi.clearAllMocks();
    // Set up environment variables
    Object.entries(mockEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach((key) => {
      delete process.env[key];
    });
  });

  describe('generatePresignedUploadUrl', () => {
    it('should generate a presigned URL for valid image upload', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresignedUrl);

      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'poster.jpg',
        fileSize: 1024 * 1024, // 1MB
        mimeType: 'image/jpeg',
      });

      const data = expectSuccess(result);

      expect(data.uploadUrl).toBe(mockPresignedUrl);
      expect(data.s3Key).toContain('media/tours/tour123/');
      expect(data.s3Key).toContain('.jpg');
      expect(data.expiresIn).toBe(900); // 15 minutes
    });

    it('should reject files that are too large', async () => {
      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'large-poster.jpg',
        fileSize: 15 * 1024 * 1024, // 15MB (over 10MB limit)
        mimeType: 'image/jpeg',
      });

      const error = expectFailure(result);

      expect(error).toContain('File size exceeds maximum');
    });

    it('should reject invalid file types', async () => {
      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'document.pdf',
        fileSize: 1024 * 1024,
        mimeType: 'application/pdf' as unknown as ImageUploadRequest['mimeType'],
      });

      const error = expectFailure(result);

      expect(error).toContain('Invalid file type');
    });

    it('should accept all supported image formats', async () => {
      const supportedFormats = [
        { ext: 'jpg', mime: 'image/jpeg' },
        { ext: 'png', mime: 'image/png' },
        { ext: 'gif', mime: 'image/gif' },
        { ext: 'webp', mime: 'image/webp' },
      ];

      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresignedUrl);

      for (const format of supportedFormats) {
        const result = await ImageUploadService.generatePresignedUploadUrl({
          tourId: 'tour123',
          fileName: `poster.${format.ext}`,
          fileSize: 1024 * 1024,
          mimeType: format.mime as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        });

        expect(result.success).toBe(true);
      }
    });

    it('should return error when S3 bucket is not configured', async () => {
      delete process.env.S3_BUCKET;

      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'poster.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      const error = expectFailure(result);

      expect(error).toContain('S3 bucket not configured');
    });

    it('should sanitize file names in S3 keys', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresignedUrl);

      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'My Poster! @#$%.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      const data = expectSuccess(result);

      expect(data.s3Key).toMatch(/^media\/tours\/tour123\/[a-z0-9-]+\.jpg$/);
    });
  });

  describe('generateCdnUrl', () => {
    it('should generate CDN URL when CDN domain is configured', () => {
      const s3Key = 'media/tours/tour123/poster-123456.jpg';
      const result = ImageUploadService.generateCdnUrl(s3Key);

      expect(result).toBe('https://cdn.example.com/media/tours/tour123/poster-123456.jpg');
    });

    it('should generate S3 direct URL when CDN domain is not configured', () => {
      delete process.env.CDN_DOMAIN;

      const s3Key = 'media/tours/tour123/poster-123456.jpg';
      const result = ImageUploadService.generateCdnUrl(s3Key);

      expect(result).toContain('s3.us-east-1.amazonaws.com');
      expect(result).toContain(s3Key);
    });

    it('should handle CDN domain with or without https protocol', () => {
      process.env.CDN_DOMAIN = 'cdn.example.com'; // No protocol

      const s3Key = 'media/tours/tour123/poster-123456.jpg';
      const result = ImageUploadService.generateCdnUrl(s3Key);

      expect(result).toBe('https://cdn.example.com/media/tours/tour123/poster-123456.jpg');
      expect(result).not.toContain('https://https://');
    });
  });

  describe('deleteFromS3', () => {
    it('should delete file from S3 successfully', async () => {
      const mockSend = vi.fn().mockResolvedValue({});
      (S3Client as ReturnType<typeof vi.fn>).mockImplementation(function (this: unknown) {
        return {
          send: mockSend,
        };
      });

      const result = await ImageUploadService.deleteFromS3('media/tours/tour123/poster-123456.jpg');

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(expect.any(Object));
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'media/tours/tour123/poster-123456.jpg',
      });
    });

    it('should handle S3 deletion errors gracefully', async () => {
      const mockSend = vi.fn().mockRejectedValue(new Error('S3 delete failed'));
      (S3Client as ReturnType<typeof vi.fn>).mockImplementation(function (this: unknown) {
        return {
          send: mockSend,
        };
      });

      const result = await ImageUploadService.deleteFromS3('media/tours/tour123/poster-123456.jpg');

      const error = expectFailure(result);

      expect(error).toContain('Failed to delete file from S3');
    });

    it('should return error when S3 bucket is not configured', async () => {
      delete process.env.S3_BUCKET;

      const result = await ImageUploadService.deleteFromS3('media/tours/tour123/poster-123456.jpg');

      const error = expectFailure(result);

      expect(error).toContain('S3 bucket not configured');
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

  describe('generateS3Key', () => {
    it('should generate unique S3 keys for the same tour and filename', () => {
      const key1 = ImageUploadService.generateS3Key('tour123', 'poster.jpg');
      const key2 = ImageUploadService.generateS3Key('tour123', 'poster.jpg');

      expect(key1).not.toBe(key2);
      expect(key1).toContain('media/tours/tour123/');
      expect(key2).toContain('media/tours/tour123/');
    });

    it('should preserve file extensions', () => {
      const extensions = ['jpg', 'png', 'gif', 'webp'];

      extensions.forEach((ext) => {
        const key = ImageUploadService.generateS3Key('tour123', `poster.${ext}`);
        expect(key).toMatch(new RegExp(`\\.${ext}$`));
      });
    });

    it('should handle files without extensions', () => {
      const key = ImageUploadService.generateS3Key('tour123', 'poster');
      expect(key).toContain('media/tours/tour123/');
      // Should have a default extension or handle gracefully
    });

    it('should sanitize filenames with special characters', () => {
      const unsafeFilename = 'My Tour Poster! @#$%^&*().jpg';
      const key = ImageUploadService.generateS3Key('tour123', unsafeFilename);

      // Should not contain special characters except hyphens and dots
      expect(key).toMatch(/^media\/tours\/tour123\/[a-z0-9-]+\.jpg$/);
    });

    it('should truncate long filenames', () => {
      const longFilename = 'a'.repeat(200) + '.jpg';
      const key = ImageUploadService.generateS3Key('tour123', longFilename);

      // Key should be reasonable length (not exceed practical limits)
      expect(key.length).toBeLessThan(150);
      expect(key).toContain('media/tours/tour123/');
      expect(key).toMatch(/\.jpg$/);
    });
  });

  describe('generateTourDatePresignedUploadUrl', () => {
    it('should generate a presigned URL for a valid tour date image upload', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresignedUrl);

      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'tourdate123',
        fileName: 'flyer.jpg',
        fileSize: 1024 * 1024, // 1MB
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error);

      expect(result.data.uploadUrl).toBe(mockPresignedUrl);
      expect(result.data.s3Key).toContain('media/tour-dates/tourdate123/');
      expect(result.data.s3Key).toContain('.jpg');
      expect(result.data.expiresIn).toBe(900);
    });

    it('should return error when S3 bucket is not configured', async () => {
      delete process.env.S3_BUCKET;

      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'tourdate123',
        fileName: 'flyer.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toContain('S3 bucket not configured');
    });

    it('should reject files that are too large', async () => {
      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'tourdate123',
        fileName: 'large-flyer.jpg',
        fileSize: 15 * 1024 * 1024, // 15MB
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toContain('File size exceeds maximum');
    });

    it('should reject invalid file types', async () => {
      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'tourdate123',
        fileName: 'document.pdf',
        fileSize: 1024 * 1024,
        mimeType: 'application/pdf' as unknown as 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toContain('Invalid file type');
    });

    it('should return error when getSignedUrl throws', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('S3 connection error')
      );

      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'tourdate123',
        fileName: 'flyer.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toContain('Failed to generate upload URL');
    });

    it('should include tourDateId in s3Key path', async () => {
      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresignedUrl);

      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'specific-date-id',
        fileName: 'flyer.png',
        fileSize: 512 * 1024,
        mimeType: 'image/png',
      });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.error);
      expect(result.data.s3Key).toContain('media/tour-dates/specific-date-id/');
      expect(result.data.s3Key).toContain('.png');
    });
  });

  describe('generateTourDateS3Key', () => {
    it('should generate unique S3 keys for the same tour date and filename', () => {
      const key1 = ImageUploadService.generateTourDateS3Key('tourdate123', 'flyer.jpg');
      const key2 = ImageUploadService.generateTourDateS3Key('tourdate123', 'flyer.jpg');

      expect(key1).not.toBe(key2);
      expect(key1).toContain('media/tour-dates/tourdate123/');
      expect(key2).toContain('media/tour-dates/tourdate123/');
    });

    it('should preserve file extensions', () => {
      const extensions = ['jpg', 'png', 'gif', 'webp'];

      extensions.forEach((ext) => {
        const key = ImageUploadService.generateTourDateS3Key('tourdate123', `flyer.${ext}`);
        expect(key).toMatch(new RegExp(`\\.${ext}$`));
      });
    });

    it('should handle files without extensions', () => {
      const key = ImageUploadService.generateTourDateS3Key('tourdate123', 'flyer');
      expect(key).toContain('media/tour-dates/tourdate123/');
      // No dot separator in filename means the whole name becomes the "extension"
    });

    it('should sanitize filenames with special characters', () => {
      const unsafeFilename = 'Tour Date Flyer! @#$%^&*().jpg';
      const key = ImageUploadService.generateTourDateS3Key('tourdate123', unsafeFilename);

      expect(key).toMatch(/^media\/tour-dates\/tourdate123\/[a-z0-9-]+\.jpg$/);
    });

    it('should truncate long filenames', () => {
      const longFilename = 'b'.repeat(200) + '.jpg';
      const key = ImageUploadService.generateTourDateS3Key('tourdate123', longFilename);

      expect(key.length).toBeLessThan(150);
      expect(key).toContain('media/tour-dates/tourdate123/');
      expect(key).toMatch(/\.jpg$/);
    });

    it('should use tour-dates path prefix instead of tours', () => {
      const tourKey = ImageUploadService.generateS3Key('id123', 'file.jpg');
      const tourDateKey = ImageUploadService.generateTourDateS3Key('id123', 'file.jpg');

      expect(tourKey).toContain('media/tours/');
      expect(tourDateKey).toContain('media/tour-dates/');
      expect(tourDateKey).not.toContain('media/tours/');
    });
  });

  describe('generatePresignedUploadUrl - error branch', () => {
    it('should return error when getSignedUrl throws', async () => {
      (getSignedUrl as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('AWS credentials invalid')
      );

      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'poster.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toContain('Failed to generate upload URL');
    });
  });

  describe('getS3Client fallback branches', () => {
    it('should use fallback values when AWS env vars are missing', async () => {
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const mockPresignedUrl = 'https://s3.amazonaws.com/test-bucket/path?signature=abc123';
      (getSignedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(mockPresignedUrl);

      await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'poster.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: '',
          secretAccessKey: '',
        },
      });
    });
  });

  describe('generateS3Key - empty extension fallback', () => {
    it('should fall back to .jpg when extension is empty', () => {
      const key = ImageUploadService.generateS3Key('tour123', '.');

      expect(key).toMatch(/\.jpg$/);
    });
  });

  describe('generateTourDateS3Key - empty extension fallback', () => {
    it('should fall back to .jpg when extension is empty', () => {
      const key = ImageUploadService.generateTourDateS3Key('tourdate123', '.');

      expect(key).toMatch(/\.jpg$/);
    });
  });

  describe('generateCdnUrl - env var fallbacks', () => {
    it('should use fallback values when env vars are missing', () => {
      delete process.env.CDN_DOMAIN;
      delete process.env.S3_BUCKET;
      delete process.env.AWS_REGION;

      const result = ImageUploadService.generateCdnUrl('media/tours/tour123/poster.jpg');

      expect(result).toBe('https://.s3.us-east-1.amazonaws.com/media/tours/tour123/poster.jpg');
    });
  });

  describe('generatePresignedUploadUrl - validation.error fallback', () => {
    it('should return "Invalid file" when validation.error is undefined', async () => {
      const spy = vi
        .spyOn(ImageUploadService, 'validateImageFile')
        .mockReturnValueOnce({ valid: false });

      const result = await ImageUploadService.generatePresignedUploadUrl({
        tourId: 'tour123',
        fileName: 'poster.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Invalid file');

      spy.mockRestore();
    });
  });

  describe('generateTourDatePresignedUploadUrl - validation.error fallback', () => {
    it('should return "Invalid file" when validation.error is undefined', async () => {
      const spy = vi
        .spyOn(ImageUploadService, 'validateImageFile')
        .mockReturnValueOnce({ valid: false });

      const result = await ImageUploadService.generateTourDatePresignedUploadUrl({
        tourDateId: 'tourdate123',
        fileName: 'flyer.jpg',
        fileSize: 1024 * 1024,
        mimeType: 'image/jpeg',
      });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Invalid file');

      spy.mockRestore();
    });
  });
});
