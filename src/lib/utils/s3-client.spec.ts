/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  getS3Client,
  getS3BucketName,
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  verifyS3ObjectExists,
  deleteS3Object,
} from './s3-client';

vi.mock('server-only', () => ({}));

const mockSend = vi.fn();
const s3ClientCalls: Record<string, unknown>[] = [];
const putCommandCalls: Record<string, unknown>[] = [];
const getCommandCalls: Record<string, unknown>[] = [];

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
      constructor(config: Record<string, unknown>) {
        s3ClientCalls.push(config);
      }
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(params: Record<string, unknown>) {
        putCommandCalls.push(params);
      }
    },
    GetObjectCommand: class MockGetObjectCommand {
      constructor(params: Record<string, unknown>) {
        getCommandCalls.push(params);
      }
    },
    HeadObjectCommand: class MockHeadObjectCommand {
      constructor(_params: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class MockDeleteObjectCommand {
      constructor(_params: Record<string, unknown>) {}
    },
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('s3-client', () => {
  beforeEach(() => {
    s3ClientCalls.length = 0;
    putCommandCalls.length = 0;
    getCommandCalls.length = 0;
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key-id');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
    vi.stubEnv('AWS_S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('AWS_REGION', 'us-west-2');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getS3Client', () => {
    it('should create S3Client with configured credentials', () => {
      const client = getS3Client();
      expect(client).toBeDefined();
      expect(s3ClientCalls).toHaveLength(1);
      expect(s3ClientCalls[0]).toEqual(
        expect.objectContaining({
          region: 'us-west-2',
          credentials: {
            accessKeyId: 'test-key-id',
            secretAccessKey: 'test-secret-key',
          },
        })
      );
    });

    it('should throw error when AWS credentials are not configured', () => {
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      expect(() => getS3Client()).toThrow('AWS credentials not configured');
    });

    it('should throw when only access key is missing', () => {
      delete process.env.AWS_ACCESS_KEY_ID;

      expect(() => getS3Client()).toThrow('AWS credentials not configured');
    });

    it('should throw when only secret key is missing', () => {
      delete process.env.AWS_SECRET_ACCESS_KEY;

      expect(() => getS3Client()).toThrow('AWS credentials not configured');
    });

    it('should default to us-east-1 when AWS_REGION is not set', () => {
      delete process.env.AWS_REGION;

      getS3Client();

      expect(s3ClientCalls).toHaveLength(1);
      expect(s3ClientCalls[0]).toEqual(expect.objectContaining({ region: 'us-east-1' }));
    });
  });

  describe('getS3BucketName', () => {
    it('should return AWS_S3_BUCKET_NAME when set', () => {
      expect(getS3BucketName()).toBe('test-bucket');
    });

    it('should fall back to S3_BUCKET when AWS_S3_BUCKET_NAME is not set', () => {
      delete process.env.AWS_S3_BUCKET_NAME;
      vi.stubEnv('S3_BUCKET', 'fallback-bucket');

      expect(getS3BucketName()).toBe('fallback-bucket');
    });

    it('should throw when neither bucket env var is set', () => {
      delete process.env.AWS_S3_BUCKET_NAME;
      delete process.env.S3_BUCKET;

      expect(() => getS3BucketName()).toThrow('S3 bucket not configured');
    });
  });

  describe('generatePresignedUploadUrl', () => {
    it('should generate presigned upload URL with correct params', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/upload?signed=true');

      const result = await generatePresignedUploadUrl(
        'releases/123/digital-formats/MP3_320KBPS/file.mp3',
        'MP3_320KBPS',
        'audio/mpeg'
      );

      expect(result.uploadUrl).toBe('https://s3.example.com/upload?signed=true');
      expect(result.s3Key).toBe('releases/123/digital-formats/MP3_320KBPS/file.mp3');
      expect(result.contentType).toBe('audio/mpeg');
      expect(putCommandCalls).toHaveLength(1);
      expect(putCommandCalls[0]).toEqual(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'releases/123/digital-formats/MP3_320KBPS/file.mp3',
          ContentType: 'audio/mpeg',
        })
      );
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 900 })
      );
    });

    it('should use default MIME type when empty mimeType is provided', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/upload');

      const result = await generatePresignedUploadUrl(
        'releases/123/digital-formats/MP3_320KBPS/file.mp3',
        'MP3_320KBPS',
        ''
      );

      // When mimeType is empty string (falsy), it falls back to getDefaultMimeType
      expect(result.contentType).toBe('audio/mpeg');
    });
  });

  describe('generatePresignedDownloadUrl', () => {
    it('should generate presigned download URL with correct params', async () => {
      vi.mocked(getSignedUrl).mockResolvedValue('https://s3.example.com/download?signed=true');

      const result = await generatePresignedDownloadUrl(
        'releases/123/digital-formats/MP3_320KBPS/file.mp3',
        'Artist - Album.mp3'
      );

      expect(result).toBe('https://s3.example.com/download?signed=true');
      expect(getCommandCalls).toHaveLength(1);
      expect(getCommandCalls[0]).toEqual(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'releases/123/digital-formats/MP3_320KBPS/file.mp3',
          ResponseContentType: 'application/octet-stream',
        })
      );
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 86400 })
      );
    });
  });

  describe('verifyS3ObjectExists', () => {
    it('should return true when object exists', async () => {
      mockSend.mockResolvedValue({});

      const exists = await verifyS3ObjectExists('releases/123/file.mp3');

      expect(exists).toBe(true);
    });

    it('should return false when object does not exist', async () => {
      mockSend.mockRejectedValue(new Error('NotFound'));

      const exists = await verifyS3ObjectExists('releases/123/missing.mp3');

      expect(exists).toBe(false);
    });
  });

  describe('deleteS3Object', () => {
    it('should return true on successful deletion', async () => {
      mockSend.mockResolvedValue({});

      const result = await deleteS3Object('releases/123/file.mp3');

      expect(result).toBe(true);
    });

    it('should return false on deletion failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSend.mockRejectedValue(new Error('AccessDenied'));

      const result = await deleteS3Object('releases/123/file.mp3');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to delete S3 object:', expect.any(Error));

      consoleSpy.mockRestore();
    });
  });
});
