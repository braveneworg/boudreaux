/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { applyCacheHeaders, parseArgs } from './s3-apply-cache-headers';

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = mockSend;
  },
  ListObjectsV2Command: class MockListObjectsV2Command {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  HeadObjectCommand: class MockHeadObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
  CopyObjectCommand: class MockCopyObjectCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

describe('s3-apply-cache-headers', () => {
  describe('parseArgs', () => {
    it('should default to dry run with media/ prefix', () => {
      const result = parseArgs([]);
      expect(result).toEqual({ apply: false, force: false, prefix: 'media/' });
    });

    it('should parse --apply flag', () => {
      const result = parseArgs(['--apply']);
      expect(result.apply).toBe(true);
    });

    it('should parse --force flag', () => {
      const result = parseArgs(['--force']);
      expect(result.force).toBe(true);
    });

    it('should parse --prefix option', () => {
      const result = parseArgs(['--prefix', 'media/audio/']);
      expect(result.prefix).toBe('media/audio/');
    });

    it('should parse all flags together', () => {
      const result = parseArgs(['--apply', '--force', '--prefix', 'media/artists/']);
      expect(result).toEqual({ apply: true, force: true, prefix: 'media/artists/' });
    });
  });

  describe('applyCacheHeaders', () => {
    const defaultOptions = { apply: false, force: false, prefix: 'media/' };

    it('should handle empty bucket gracefully', async () => {
      mockSend.mockResolvedValueOnce({ Contents: [] });

      const result = await applyCacheHeaders('test-bucket', defaultOptions);

      expect(result.totalObjects).toBe(0);
      expect(result.mediaObjects).toBe(0);
    });

    it('should skip non-media files', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'media/data.json', Size: 100 },
          { Key: 'media/readme.txt', Size: 200 },
        ],
      });

      const result = await applyCacheHeaders('test-bucket', defaultOptions);

      expect(result.totalObjects).toBe(2);
      expect(result.mediaObjects).toBe(0);
      expect(result.needsUpdate).toBe(0);
    });

    it('should detect media files that need cache headers (dry run)', async () => {
      mockSend
        // ListObjectsV2
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'media/artists/photo.jpg', Size: 1024 },
            { Key: 'media/tracks/song.mp3', Size: 5000000 },
          ],
        })
        // HeadObject for photo.jpg — no Cache-Control
        .mockResolvedValueOnce({
          ContentType: 'image/jpeg',
          CacheControl: undefined,
        })
        // HeadObject for song.mp3 — no Cache-Control
        .mockResolvedValueOnce({
          ContentType: 'audio/mpeg',
          CacheControl: undefined,
        });

      const result = await applyCacheHeaders('test-bucket', defaultOptions);

      expect(result.mediaObjects).toBe(2);
      expect(result.needsUpdate).toBe(2);
      expect(result.updated).toBe(0); // dry run
      expect(result.totalSize).toBe(5001024);
    });

    it('should skip objects that already have the correct header', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'media/artists/photo.jpg', Size: 1024 }],
        })
        .mockResolvedValueOnce({
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000, immutable',
        });

      const result = await applyCacheHeaders('test-bucket', defaultOptions);

      expect(result.alreadyCached).toBe(1);
      expect(result.needsUpdate).toBe(0);
    });

    it('should apply headers when --apply is set', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'media/artists/photo.jpg', Size: 1024 }],
        })
        // HeadObject
        .mockResolvedValueOnce({
          ContentType: 'image/jpeg',
          CacheControl: undefined,
          Metadata: { entityType: 'artists' },
        })
        // CopyObject
        .mockResolvedValueOnce({});

      const options = { apply: true, force: false, prefix: 'media/' };
      const result = await applyCacheHeaders('test-bucket', options);

      expect(result.updated).toBe(1);
      expect(result.needsUpdate).toBe(1);
      // Verify CopyObject was called with correct params
      const copyCall = mockSend.mock.calls[2][0];
      expect(copyCall.input).toEqual(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'media/artists/photo.jpg',
          CacheControl: 'public, max-age=31536000, immutable',
          ContentType: 'image/jpeg',
          MetadataDirective: 'REPLACE',
          Metadata: { entityType: 'artists' },
        })
      );
    });

    it('should force-update objects that already have headers when --force is set', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'media/artists/photo.jpg', Size: 1024 }],
        })
        .mockResolvedValueOnce({
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=3600',
        })
        .mockResolvedValueOnce({});

      const options = { apply: true, force: true, prefix: 'media/' };
      const result = await applyCacheHeaders('test-bucket', options);

      expect(result.alreadyCached).toBe(0);
      expect(result.needsUpdate).toBe(1);
      expect(result.updated).toBe(1);
    });

    it('should handle CopyObject errors gracefully', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'media/artists/photo.jpg', Size: 1024 }],
        })
        .mockResolvedValueOnce({
          ContentType: 'image/jpeg',
          CacheControl: undefined,
        })
        .mockRejectedValueOnce(new Error('AccessDenied'));

      const options = { apply: true, force: false, prefix: 'media/' };
      const result = await applyCacheHeaders('test-bucket', options);

      expect(result.needsUpdate).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.updated).toBe(0);
    });

    it('should handle pagination with ContinuationToken', async () => {
      mockSend
        // First page
        .mockResolvedValueOnce({
          Contents: [{ Key: 'media/artists/photo1.jpg', Size: 1024 }],
          NextContinuationToken: 'token-123',
        })
        // HeadObject for photo1
        .mockResolvedValueOnce({ ContentType: 'image/jpeg', CacheControl: undefined })
        // Second page
        .mockResolvedValueOnce({
          Contents: [{ Key: 'media/artists/photo2.png', Size: 2048 }],
        })
        // HeadObject for photo2
        .mockResolvedValueOnce({ ContentType: 'image/png', CacheControl: undefined });

      const result = await applyCacheHeaders('test-bucket', defaultOptions);

      expect(result.mediaObjects).toBe(2);
      expect(result.needsUpdate).toBe(2);
      // ListObjectsV2 called twice (page 1 + page 2), HeadObject twice
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it('should recognize all supported media extensions', async () => {
      const mediaFiles = [
        'media/test.jpg',
        'media/test.png',
        'media/test.gif',
        'media/test.webp',
        'media/test.mp3',
        'media/test.flac',
        'media/test.wav',
        'media/test.aac',
        'media/test.ogg',
      ];

      mockSend.mockResolvedValueOnce({
        Contents: mediaFiles.map((Key) => ({ Key, Size: 100 })),
      });

      // HeadObject for each
      for (let i = 0; i < mediaFiles.length; i++) {
        mockSend.mockResolvedValueOnce({ ContentType: 'audio/mpeg', CacheControl: undefined });
      }

      const result = await applyCacheHeaders('test-bucket', defaultOptions);

      expect(result.mediaObjects).toBe(mediaFiles.length);
    });
  });
});
