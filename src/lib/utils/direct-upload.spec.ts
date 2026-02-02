import type { PresignedUrlResult } from '@/lib/actions/presigned-upload-actions';

import { uploadFileToS3, uploadFilesToS3 } from './direct-upload';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods to avoid cluttering test output
const mockConsoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('direct-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockFile = (name: string, type: string, size = 1024): File => {
    const content = new Uint8Array(size).fill(0);
    return new File([content], name, { type });
  };

  const createMockPresignedUrl = (key: string): PresignedUrlResult => ({
    uploadUrl: `https://s3.amazonaws.com/bucket/${key}?signature=abc123`,
    s3Key: key,
    cdnUrl: `https://cdn.example.com/${key}`,
  });

  describe('uploadFileToS3', () => {
    it('should upload file successfully', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      // Mock successful upload
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ ETag: '"abc123"' }),
        })
        // Mock CDN verification
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'Content-Type': 'image/jpeg',
            'Content-Length': '1024',
          }),
        });

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result.success).toBe(true);
      expect(result.s3Key).toBe('images/test.jpg');
      expect(result.cdnUrl).toBe('https://cdn.example.com/images/test.jpg');
      expect(result.error).toBeUndefined();

      // Verify upload call
      expect(mockFetch).toHaveBeenCalledWith(presignedUrl.uploadUrl, {
        method: 'PUT',
        body: file,
        mode: 'cors',
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      // Should have logged info
      expect(mockConsoleInfo).toHaveBeenCalled();
    });

    it('should handle upload failure with error response', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: vi.fn().mockResolvedValue('Access Denied'),
      });

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result.success).toBe(false);
      expect(result.s3Key).toBe('images/test.jpg');
      expect(result.cdnUrl).toBe('https://cdn.example.com/images/test.jpg');
      expect(result.error).toBe('Upload failed: 403 Forbidden - Access Denied');

      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should handle upload failure without error text', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed: 500 Internal Server Error');
    });

    it('should handle network errors', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result.success).toBe(false);
      expect(result.s3Key).toBe('images/test.jpg');
      expect(result.cdnUrl).toBe('https://cdn.example.com/images/test.jpg');
      expect(result.error).toBe('Network error');

      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should handle non-Error thrown objects', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch.mockRejectedValueOnce('Unknown error string');

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed');
    });

    it('should handle CDN verification failure gracefully', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      // Mock successful upload
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ ETag: '"abc123"' }),
        })
        // Mock CDN verification failure
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await uploadFileToS3(file, presignedUrl);

      // Should still return success since upload worked
      expect(result.success).toBe(true);
      expect(result.s3Key).toBe('images/test.jpg');
      expect(mockConsoleWarn).toHaveBeenCalled();
    });

    it('should handle CDN verification error gracefully', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      // Mock successful upload
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ ETag: '"abc123"' }),
        })
        // Mock CDN verification network error
        .mockRejectedValueOnce(new Error('CDN network error'));

      const result = await uploadFileToS3(file, presignedUrl);

      // Should still return success since upload worked
      expect(result.success).toBe(true);
      expect(mockConsoleWarn).toHaveBeenCalled();
    });

    it('should log upload details', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg', 2048);
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ ETag: '"abc123"' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({
            'Content-Type': 'image/jpeg',
            'Content-Length': '2048',
          }),
        });

      await uploadFileToS3(file, presignedUrl);

      // Verify starting upload log
      expect(mockConsoleInfo).toHaveBeenCalledWith(
        '[S3 Upload] Starting upload:',
        expect.objectContaining({
          fileName: 'test.jpg',
          fileSize: 2048,
          contentType: 'image/jpeg',
          s3Key: 'images/test.jpg',
          cdnUrl: 'https://cdn.example.com/images/test.jpg',
        })
      );
    });
  });

  describe('uploadFilesToS3', () => {
    it('should upload multiple files in parallel', async () => {
      const files = [
        createMockFile('file1.jpg', 'image/jpeg'),
        createMockFile('file2.png', 'image/png'),
        createMockFile('file3.gif', 'image/gif'),
      ];

      const presignedUrls = [
        createMockPresignedUrl('images/file1.jpg'),
        createMockPresignedUrl('images/file2.png'),
        createMockPresignedUrl('images/file3.gif'),
      ];

      // Mock successful uploads and CDN verifications
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('s3.amazonaws.com')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers({ ETag: '"abc123"' }),
          });
        }
        // CDN verification
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({
            'Content-Type': 'image/jpeg',
            'Content-Length': '1024',
          }),
        });
      });

      const results = await uploadFilesToS3(files, presignedUrls);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[0].s3Key).toBe('images/file1.jpg');
      expect(results[1].success).toBe(true);
      expect(results[1].s3Key).toBe('images/file2.png');
      expect(results[2].success).toBe(true);
      expect(results[2].s3Key).toBe('images/file3.gif');
    });

    it('should throw error when files and presigned URLs count mismatch', async () => {
      const files = [createMockFile('file1.jpg', 'image/jpeg')];
      const presignedUrls = [
        createMockPresignedUrl('images/file1.jpg'),
        createMockPresignedUrl('images/file2.jpg'),
      ];

      await expect(uploadFilesToS3(files, presignedUrls)).rejects.toThrow(
        'Files and presigned URLs count mismatch'
      );
    });

    it('should handle partial failures', async () => {
      const files = [
        createMockFile('file1.jpg', 'image/jpeg'),
        createMockFile('file2.png', 'image/png'),
      ];

      const presignedUrls = [
        createMockPresignedUrl('images/file1.jpg'),
        createMockPresignedUrl('images/file2.png'),
      ];

      // First file succeeds, second fails
      let callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        callCount++;
        if (url.includes('s3.amazonaws.com')) {
          if (callCount === 1) {
            // First upload succeeds
            return Promise.resolve({
              ok: true,
              status: 200,
              statusText: 'OK',
              headers: new Headers({ ETag: '"abc123"' }),
            });
          } else if (callCount === 2) {
            // Second upload fails
            return Promise.resolve({
              ok: false,
              status: 403,
              statusText: 'Forbidden',
              text: vi.fn().mockResolvedValue('Access Denied'),
            });
          }
        }
        // CDN verification
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({}),
        });
      });

      const results = await uploadFilesToS3(files, presignedUrls);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('403');
    });

    it('should handle empty arrays', async () => {
      const results = await uploadFilesToS3([], []);
      expect(results).toHaveLength(0);
    });
  });

  describe('DirectUploadResult interface', () => {
    it('should return correct structure on success', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers({ ETag: '"abc123"' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({}),
        });

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result).toEqual({
        success: true,
        s3Key: 'images/test.jpg',
        cdnUrl: 'https://cdn.example.com/images/test.jpg',
      });
    });

    it('should return correct structure on failure', async () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      const presignedUrl = createMockPresignedUrl('images/test.jpg');

      mockFetch.mockRejectedValueOnce(new Error('Failed'));

      const result = await uploadFileToS3(file, presignedUrl);

      expect(result).toEqual({
        success: false,
        s3Key: 'images/test.jpg',
        cdnUrl: 'https://cdn.example.com/images/test.jpg',
        error: 'Failed',
      });
    });
  });
});
