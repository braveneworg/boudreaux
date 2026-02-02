// Mock server-only first to prevent errors from imported modules
import { getPresignedUploadUrlsAction } from './presigned-upload-actions';
import { auth } from '../../../auth';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('../../../auth');
vi.mock('../utils/auth/require-role');
vi.mock('../utils/logger', () => ({
  loggers: {
    presignedUrls: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      operationStart: vi.fn(),
      operationComplete: vi.fn(),
      operationFailed: vi.fn(),
    },
  },
}));

// Mock AWS SDK with class-style S3Client
const mockGetSignedUrl = vi.fn();
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      constructor() {}
      send() {
        return Promise.resolve({});
      }
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
  };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

describe('presigned-upload-actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockGetSignedUrl.mockResolvedValue('https://s3.amazonaws.com/presigned-url?signature=abc');

    // Set environment variables
    process.env.S3_BUCKET = 'test-bucket';
    process.env.CDN_DOMAIN = 'https://cdn.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
  });

  describe('getPresignedUploadUrlsAction', () => {
    describe('authorization', () => {
      it('should require admin role', async () => {
        vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

        await expect(
          getPresignedUploadUrlsAction('artists', 'artist-123', [
            { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
          ])
        ).rejects.toThrow('Unauthorized');

        expect(requireRole).toHaveBeenCalledWith('admin');
      });

      it('should return error when user is not logged in', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
      });

      it('should return error when user is not admin', async () => {
        vi.mocked(auth).mockResolvedValue({
          user: { id: 'user-123', role: 'user' },
        } as never);

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
      });

      it('should return error when user session has no id', async () => {
        vi.mocked(auth).mockResolvedValue({
          user: { role: 'admin' },
        } as never);

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unauthorized');
      });
    });

    describe('input validation', () => {
      it('should return error when no files provided', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', []);

        expect(result.success).toBe(false);
        expect(result.error).toBe('No files provided');
      });

      it('should return error for invalid content type', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.exe', contentType: 'application/octet-stream', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid file type');
      });

      it('should return error for file exceeding size limit', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          {
            fileName: 'large-image.jpg',
            contentType: 'image/jpeg',
            fileSize: 100 * 1024 * 1024,
          }, // 100MB, exceeds 50MB limit
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('exceeds maximum size');
      });

      it('should accept valid image files', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(1);
      });

      it('should accept PNG images', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.png', contentType: 'image/png', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should accept WebP images', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.webp', contentType: 'image/webp', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should accept GIF images', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.gif', contentType: 'image/gif', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should accept TIFF images', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.tiff', contentType: 'image/tiff', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should accept FLAC audio files', async () => {
        const result = await getPresignedUploadUrlsAction('tracks', 'track-123', [
          { fileName: 'test.flac', contentType: 'audio/flac', fileSize: 50 * 1024 * 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should accept WAV audio files', async () => {
        const result = await getPresignedUploadUrlsAction('tracks', 'track-123', [
          { fileName: 'test.wav', contentType: 'audio/wav', fileSize: 50 * 1024 * 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should accept MP3 audio files', async () => {
        const result = await getPresignedUploadUrlsAction('tracks', 'track-123', [
          { fileName: 'test.mp3', contentType: 'audio/mpeg', fileSize: 10 * 1024 * 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should allow larger audio files up to 1GB', async () => {
        const result = await getPresignedUploadUrlsAction('tracks', 'track-123', [
          { fileName: 'test.flac', contentType: 'audio/flac', fileSize: 500 * 1024 * 1024 },
        ]);

        expect(result.success).toBe(true);
      });

      it('should reject audio files over 1GB', async () => {
        const result = await getPresignedUploadUrlsAction('tracks', 'track-123', [
          { fileName: 'test.flac', contentType: 'audio/flac', fileSize: 2 * 1024 * 1024 * 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('exceeds maximum size');
      });
    });

    describe('S3 configuration', () => {
      it('should return error when S3_BUCKET is not configured', async () => {
        delete process.env.S3_BUCKET;

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('S3 storage is not configured');
      });
    });

    describe('presigned URL generation', () => {
      it('should generate presigned URLs for multiple files', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'image1.jpg', contentType: 'image/jpeg', fileSize: 1024 },
          { fileName: 'image2.jpg', contentType: 'image/jpeg', fileSize: 2048 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data).toHaveLength(2);
        expect(mockGetSignedUrl).toHaveBeenCalledTimes(2);
      });

      it('should include s3Key and cdnUrl in result', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0]).toHaveProperty('uploadUrl');
        expect(result.data?.[0]).toHaveProperty('s3Key');
        expect(result.data?.[0]).toHaveProperty('cdnUrl');
      });

      it('should generate S3 key with correct entity type and ID', async () => {
        const result = await getPresignedUploadUrlsAction('releases', 'release-123', [
          { fileName: 'cover.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/^media\/releases\/release-123\//);
      });

      it('should generate CDN URL using CDN_DOMAIN when configured', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].cdnUrl).toMatch(/^https:\/\/cdn\.example\.com\//);
      });

      it('should use direct S3 URL when CDN_DOMAIN is not configured', async () => {
        delete process.env.CDN_DOMAIN;

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].cdnUrl).toMatch(/^https:\/\/test-bucket\.s3\./);
      });

      it('should handle CDN_DOMAIN with https:// prefix', async () => {
        process.env.CDN_DOMAIN = 'https://cdn.example.com';

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        // Should not have double https://
        expect(result.data?.[0].cdnUrl).not.toMatch(/^https:\/\/https:\/\//);
      });
    });

    describe('entity types', () => {
      it('should work with artists entity type', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/^media\/artists\//);
      });

      it('should work with groups entity type', async () => {
        const result = await getPresignedUploadUrlsAction('groups', 'group-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/^media\/groups\//);
      });

      it('should work with releases entity type', async () => {
        const result = await getPresignedUploadUrlsAction('releases', 'release-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/^media\/releases\//);
      });

      it('should work with tracks entity type', async () => {
        const result = await getPresignedUploadUrlsAction('tracks', 'track-123', [
          { fileName: 'test.mp3', contentType: 'audio/mpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/^media\/tracks\//);
      });

      it('should work with notifications entity type', async () => {
        const result = await getPresignedUploadUrlsAction('notifications', 'notification-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/^media\/notifications\//);
      });
    });

    describe('error handling', () => {
      it('should handle S3 signing errors', async () => {
        mockGetSignedUrl.mockRejectedValueOnce(new Error('S3 signing failed'));

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to generate upload URLs');
        expect(result.error).toContain('S3 signing failed');
      });

      it('should handle unknown errors', async () => {
        mockGetSignedUrl.mockRejectedValueOnce('Unknown error string');

        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unknown error');
      });
    });

    describe('file name handling', () => {
      it('should sanitize file names with special characters', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'My Photo @ Beach!.jpg', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).not.toContain('@');
        expect(result.data?.[0].s3Key).not.toContain('!');
        expect(result.data?.[0].s3Key).not.toContain(' ');
      });

      it('should preserve file extension', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'test.PNG', contentType: 'image/png', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        expect(result.data?.[0].s3Key).toMatch(/\.png$/);
      });

      it('should handle file names without extension', async () => {
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: 'testfile', contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        // When there's no extension, the full filename is treated as extension
        // The implementation uses fileName.split('.').pop() which returns 'testfile'
        expect(result.data?.[0].s3Key).toMatch(/\.testfile$/);
      });

      it('should truncate long file names', async () => {
        const longFileName = 'a'.repeat(100) + '.jpg';
        const result = await getPresignedUploadUrlsAction('artists', 'artist-123', [
          { fileName: longFileName, contentType: 'image/jpeg', fileSize: 1024 },
        ]);

        expect(result.success).toBe(true);
        // File name part should be truncated to 50 chars (before timestamp/random suffix)
        const s3Key = result.data?.[0].s3Key || '';
        // s3Key format: media/entityType/entityId/sanitizedName-timestamp-randomSuffix.extension
        const parts = s3Key.split('/');
        const filenamePart = parts[parts.length - 1]; // e.g., aaa...-12345678-abc123.jpg
        const namePart = filenamePart.split('-')[0]; // Get the sanitized name before timestamp
        expect(namePart.length).toBeLessThanOrEqual(50);
      });
    });
  });
});
