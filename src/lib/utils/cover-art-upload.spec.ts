import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';

import { uploadCoverArtToS3, uploadCoverArtsToS3 } from './cover-art-upload';

// Mock the dependencies
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));

vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFileToS3: vi.fn(),
}));

const mockGetPresignedUploadUrlsAction = vi.mocked(getPresignedUploadUrlsAction);
const mockUploadFileToS3 = vi.mocked(uploadFileToS3);

describe('cover-art-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadCoverArtToS3', () => {
    const sampleBase64Jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';
    const sampleBase64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

    it('should upload base64 cover art to S3 and return CDN URL', async () => {
      const mockCdnUrl = 'https://cdn.example.com/media/releases/coverart/test-cover.jpg';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'media/releases/coverart/test-cover.jpg',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'media/releases/coverart/test-cover.jpg',
        cdnUrl: mockCdnUrl,
      });

      const result = await uploadCoverArtToS3(sampleBase64Jpeg, 'Test Album');

      expect(result.success).toBe(true);
      expect(result.cdnUrl).toBe(mockCdnUrl);

      // Verify getPresignedUploadUrlsAction was called with correct params
      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'releases',
        'coverart',
        expect.arrayContaining([
          expect.objectContaining({
            fileName: 'test-album-cover.jpg',
            contentType: 'image/jpeg',
          }),
        ])
      );

      // Verify uploadFileToS3 was called
      expect(mockUploadFileToS3).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({
          cdnUrl: mockCdnUrl,
        })
      );
    });

    it('should handle PNG images correctly', async () => {
      const mockCdnUrl = 'https://cdn.example.com/media/releases/coverart/test-cover.png';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'media/releases/coverart/test-cover.png',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'media/releases/coverart/test-cover.png',
        cdnUrl: mockCdnUrl,
      });

      const result = await uploadCoverArtToS3(sampleBase64Png, 'Test Album');

      expect(result.success).toBe(true);

      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'releases',
        'coverart',
        expect.arrayContaining([
          expect.objectContaining({
            contentType: 'image/png',
          }),
        ])
      );
    });

    it('should return error when presigned URL fetch fails', async () => {
      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: false,
        error: 'Failed to get presigned URL',
      });

      const result = await uploadCoverArtToS3(sampleBase64Jpeg, 'Test Album');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get presigned URL');
      expect(mockUploadFileToS3).not.toHaveBeenCalled();
    });

    it('should return error when S3 upload fails', async () => {
      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'media/releases/coverart/test-cover.jpg',
            cdnUrl: 'https://cdn.example.com/test.jpg',
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: false,
        s3Key: 'media/releases/coverart/test-cover.jpg',
        cdnUrl: 'https://cdn.example.com/test.jpg',
        error: 'Network error',
      });

      const result = await uploadCoverArtToS3(sampleBase64Jpeg, 'Test Album');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle missing album name gracefully', async () => {
      const mockCdnUrl = 'https://cdn.example.com/test.jpg';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'test-key',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'test-key',
        cdnUrl: mockCdnUrl,
      });

      const result = await uploadCoverArtToS3(sampleBase64Jpeg);

      expect(result.success).toBe(true);

      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'releases',
        'coverart',
        expect.arrayContaining([
          expect.objectContaining({
            fileName: 'cover-cover.jpg',
          }),
        ])
      );
    });

    it('should sanitize special characters in album name', async () => {
      const mockCdnUrl = 'https://cdn.example.com/test.jpg';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'test-key',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'test-key',
        cdnUrl: mockCdnUrl,
      });

      await uploadCoverArtToS3(sampleBase64Jpeg, 'Test Album! @#$%');

      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'releases',
        'coverart',
        expect.arrayContaining([
          expect.objectContaining({
            fileName: 'test-album-------cover.jpg',
          }),
        ])
      );
    });

    it('should handle exceptions gracefully', async () => {
      mockGetPresignedUploadUrlsAction.mockRejectedValue(new Error('Network failure'));

      const result = await uploadCoverArtToS3(sampleBase64Jpeg, 'Test Album');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    it('should handle webp image format', async () => {
      const mockCdnUrl = 'https://cdn.example.com/test.webp';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'test-key',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'test-key',
        cdnUrl: mockCdnUrl,
      });

      // Minimal valid base64 for webp
      const webpBase64 =
        'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=';
      const result = await uploadCoverArtToS3(webpBase64, 'Test');

      expect(result.success).toBe(true);
      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'releases',
        'coverart',
        expect.arrayContaining([
          expect.objectContaining({
            contentType: 'image/webp',
            fileName: 'test-cover.webp',
          }),
        ])
      );
    });

    it('should handle unknown image format with default extension', async () => {
      const mockCdnUrl = 'https://cdn.example.com/test.jpg';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'test-key',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'test-key',
        cdnUrl: mockCdnUrl,
      });

      // Unknown format should default to jpg
      const unknownBase64 = 'data:image/xyz;base64,abc123';
      await uploadCoverArtToS3(unknownBase64, 'Test');

      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledWith(
        'releases',
        'coverart',
        expect.arrayContaining([
          expect.objectContaining({
            fileName: 'test-cover.jpg',
          }),
        ])
      );
    });

    it('should return error when presigned data is empty', async () => {
      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await uploadCoverArtToS3(sampleBase64Jpeg, 'Test Album');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get upload URL');
      expect(mockUploadFileToS3).not.toHaveBeenCalled();
    });
  });

  describe('uploadCoverArtsToS3', () => {
    const sampleBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD';

    it('should deduplicate cover arts by album name', async () => {
      const mockCdnUrl = 'https://cdn.example.com/test.jpg';

      mockGetPresignedUploadUrlsAction.mockResolvedValue({
        success: true,
        data: [
          {
            uploadUrl: 'https://s3.example.com/presigned-url',
            s3Key: 'test-key',
            cdnUrl: mockCdnUrl,
          },
        ],
      });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'test-key',
        cdnUrl: mockCdnUrl,
      });

      const coverArts = [
        { base64: sampleBase64, albumName: 'Album A' },
        { base64: sampleBase64, albumName: 'Album A' }, // Duplicate
        { base64: sampleBase64, albumName: 'album a' }, // Same album, different case
      ];

      const result = await uploadCoverArtsToS3(coverArts);

      // Should only upload once for the same album
      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledTimes(1);
      expect(result.get('album a')).toBe(mockCdnUrl);
    });

    it('should handle tracks without album names', async () => {
      const mockCdnUrl1 = 'https://cdn.example.com/test1.jpg';
      const mockCdnUrl2 = 'https://cdn.example.com/test2.jpg';

      mockGetPresignedUploadUrlsAction
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              uploadUrl: 'https://s3.example.com/presigned-url',
              s3Key: 'test-key-1',
              cdnUrl: mockCdnUrl1,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              uploadUrl: 'https://s3.example.com/presigned-url',
              s3Key: 'test-key-2',
              cdnUrl: mockCdnUrl2,
            },
          ],
        });

      mockUploadFileToS3
        .mockResolvedValueOnce({
          success: true,
          s3Key: 'test-key-1',
          cdnUrl: mockCdnUrl1,
        })
        .mockResolvedValueOnce({
          success: true,
          s3Key: 'test-key-2',
          cdnUrl: mockCdnUrl2,
        });

      const coverArts = [
        { base64: sampleBase64, albumName: undefined },
        { base64: sampleBase64, albumName: '' },
      ];

      const result = await uploadCoverArtsToS3(coverArts);

      // Each track without album gets its own upload
      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
    });

    it('should handle album names with only whitespace', async () => {
      const mockCdnUrl1 = 'https://cdn.example.com/test1.jpg';
      const mockCdnUrl2 = 'https://cdn.example.com/test2.jpg';

      mockGetPresignedUploadUrlsAction
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              uploadUrl: 'https://s3.example.com/presigned-url',
              s3Key: 'test-key-1',
              cdnUrl: mockCdnUrl1,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              uploadUrl: 'https://s3.example.com/presigned-url',
              s3Key: 'test-key-2',
              cdnUrl: mockCdnUrl2,
            },
          ],
        });

      mockUploadFileToS3
        .mockResolvedValueOnce({
          success: true,
          s3Key: 'test-key-1',
          cdnUrl: mockCdnUrl1,
        })
        .mockResolvedValueOnce({
          success: true,
          s3Key: 'test-key-2',
          cdnUrl: mockCdnUrl2,
        });

      const coverArts = [
        { base64: sampleBase64, albumName: '   ' },
        { base64: sampleBase64, albumName: '\t\n' },
      ];

      const result = await uploadCoverArtsToS3(coverArts);

      // Each track with whitespace-only album gets its own upload with "unknown" key
      expect(mockGetPresignedUploadUrlsAction).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
      expect(result.has('unknown-0')).toBe(true);
      expect(result.has('unknown-1')).toBe(true);
    });

    it('should return partial results when some uploads fail', async () => {
      const mockCdnUrl = 'https://cdn.example.com/test.jpg';

      mockGetPresignedUploadUrlsAction
        .mockResolvedValueOnce({
          success: true,
          data: [
            {
              uploadUrl: 'https://s3.example.com/presigned-url',
              s3Key: 'test-key',
              cdnUrl: mockCdnUrl,
            },
          ],
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Upload failed',
        });

      mockUploadFileToS3.mockResolvedValue({
        success: true,
        s3Key: 'test-key',
        cdnUrl: mockCdnUrl,
      });

      const coverArts = [
        { base64: sampleBase64, albumName: 'Album A' },
        { base64: sampleBase64, albumName: 'Album B' },
      ];

      const result = await uploadCoverArtsToS3(coverArts);

      // Only successful uploads should be in the map
      expect(result.size).toBe(1);
      expect(result.get('album a')).toBe(mockCdnUrl);
      expect(result.has('album b')).toBe(false);
    });

    it('should return empty map for empty input', async () => {
      const result = await uploadCoverArtsToS3([]);

      expect(result.size).toBe(0);
      expect(mockGetPresignedUploadUrlsAction).not.toHaveBeenCalled();
    });
  });
});
