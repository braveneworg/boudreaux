// Mock server-only first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { S3Client } from '@aws-sdk/client-s3';

import {
  deleteReleaseImageAction,
  getReleaseImagesAction,
  updateReleaseImageAction,
  reorderReleaseImagesAction,
} from './release-image-actions';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));

// Mock all dependencies
vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../prisma', () => ({
  prisma: {
    image: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  DeleteObjectCommand: vi.fn().mockImplementation((args) => args),
}));

describe('release-image-actions', () => {
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
    vi.mocked(revalidatePath).mockImplementation(() => {});

    // Set environment variables
    process.env.S3_BUCKET = 'test-bucket';
    process.env.CDN_DOMAIN = 'https://cdn.example.com';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
  });

  describe('deleteReleaseImageAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(deleteReleaseImageAction('image-123')).rejects.toThrow('Unauthorized');

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const result = await deleteReleaseImageAction('image-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when user is not admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', role: 'user' },
      } as never);

      const result = await deleteReleaseImageAction('image-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when image not found', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue(null);

      const result = await deleteReleaseImageAction('nonexistent-image');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Image not found');
    });

    it('should delete image from S3 and database', async () => {
      const mockImage = {
        id: 'image-123',
        src: 'https://cdn.example.com/images/release-cover.jpg',
        releaseId: 'release-123',
      };

      vi.mocked(prisma.image.findUnique).mockResolvedValue(mockImage as never);
      vi.mocked(prisma.image.delete).mockResolvedValue(mockImage as never);

      const result = await deleteReleaseImageAction('image-123');

      expect(result.success).toBe(true);
      expect(prisma.image.delete).toHaveBeenCalledWith({
        where: { id: 'image-123' },
      });
      // Verify S3Client was instantiated (S3 operations are attempted)
      expect(S3Client).toHaveBeenCalled();
    });

    it('should delete from S3 with S3 URL format', async () => {
      const mockImage = {
        id: 'image-123',
        src: 'https://test-bucket.s3.us-east-1.amazonaws.com/images/release-cover.jpg',
        releaseId: 'release-123',
      };

      vi.mocked(prisma.image.findUnique).mockResolvedValue(mockImage as never);
      vi.mocked(prisma.image.delete).mockResolvedValue(mockImage as never);

      const result = await deleteReleaseImageAction('image-123');

      expect(result.success).toBe(true);
      expect(S3Client).toHaveBeenCalled();
    });

    it('should continue with DB delete even if S3 delete fails', async () => {
      const mockImage = {
        id: 'image-123',
        src: 'https://cdn.example.com/images/release-cover.jpg',
        releaseId: 'release-123',
      };

      vi.mocked(prisma.image.findUnique).mockResolvedValue(mockImage as never);
      vi.mocked(prisma.image.delete).mockResolvedValue(mockImage as never);
      vi.mocked(S3Client).mockImplementation(
        () =>
          ({
            send: vi.fn().mockRejectedValue(Error('S3 error')),
          }) as never
      );

      const result = await deleteReleaseImageAction('image-123');

      expect(result.success).toBe(true);
      expect(prisma.image.delete).toHaveBeenCalled();
    });

    it('should log security event on successful deletion', async () => {
      const mockImage = {
        id: 'image-123',
        src: 'https://cdn.example.com/images/release-cover.jpg',
        releaseId: 'release-123',
      };

      vi.mocked(prisma.image.findUnique).mockResolvedValue(mockImage as never);
      vi.mocked(prisma.image.delete).mockResolvedValue(mockImage as never);

      await deleteReleaseImageAction('image-123');

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.image.deleted',
        userId: 'user-123',
        metadata: {
          imageId: 'image-123',
          releaseId: 'release-123',
          success: true,
        },
      });
    });

    it('should revalidate paths on successful deletion', async () => {
      const mockImage = {
        id: 'image-123',
        src: 'https://cdn.example.com/images/release-cover.jpg',
        releaseId: 'release-123',
      };

      vi.mocked(prisma.image.findUnique).mockResolvedValue(mockImage as never);
      vi.mocked(prisma.image.delete).mockResolvedValue(mockImage as never);

      await deleteReleaseImageAction('image-123');

      expect(revalidatePath).toHaveBeenCalledWith('/releases/[slug]', 'page');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/releases');
    });

    it('should return error on unexpected failure', async () => {
      vi.mocked(prisma.image.findUnique).mockRejectedValue(Error('Database error'));

      const result = await deleteReleaseImageAction('image-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete image');
    });
  });

  describe('getReleaseImagesAction', () => {
    it('should return images for a release', async () => {
      const mockImages = [
        {
          id: 'image-1',
          src: 'https://cdn.example.com/image1.jpg',
          caption: 'Caption 1',
          altText: 'Alt 1',
          sortOrder: 0,
        },
        {
          id: 'image-2',
          src: 'https://cdn.example.com/image2.jpg',
          caption: 'Caption 2',
          altText: 'Alt 2',
          sortOrder: 1,
        },
      ];

      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await getReleaseImagesAction('release-123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].id).toBe('image-1');
      expect(result.data?.[1].id).toBe('image-2');
    });

    it('should return empty array when no images found', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      const result = await getReleaseImagesAction('release-123');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle null values in image data', async () => {
      const mockImages = [
        {
          id: 'image-1',
          src: null,
          caption: null,
          altText: null,
          sortOrder: null,
        },
      ];

      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await getReleaseImagesAction('release-123');

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual({
        id: 'image-1',
        src: '',
        caption: undefined,
        altText: undefined,
        sortOrder: 0,
      });
    });

    it('should return error on database failure', async () => {
      vi.mocked(prisma.image.findMany).mockRejectedValue(Error('Database error'));

      const result = await getReleaseImagesAction('release-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve images');
    });

    it('should order images by sortOrder ascending', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      await getReleaseImagesAction('release-123');

      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { releaseId: 'release-123' },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          src: true,
          caption: true,
          altText: true,
          sortOrder: true,
        },
      });
    });
  });

  describe('updateReleaseImageAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(
        updateReleaseImageAction('image-123', { caption: 'New caption' })
      ).rejects.toThrow('Unauthorized');

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const result = await updateReleaseImageAction('image-123', { caption: 'New caption' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should update image caption', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({ id: 'image-123' } as never);

      const result = await updateReleaseImageAction('image-123', { caption: 'New caption' });

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: {
          caption: 'New caption',
          altText: undefined,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update image altText', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({ id: 'image-123' } as never);

      const result = await updateReleaseImageAction('image-123', { altText: 'New alt text' });

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: {
          caption: undefined,
          altText: 'New alt text',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update both caption and altText', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({ id: 'image-123' } as never);

      const result = await updateReleaseImageAction('image-123', {
        caption: 'New caption',
        altText: 'New alt text',
      });

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: 'image-123' },
        data: {
          caption: 'New caption',
          altText: 'New alt text',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should revalidate path on successful update', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({ id: 'image-123' } as never);

      await updateReleaseImageAction('image-123', { caption: 'New caption' });

      expect(revalidatePath).toHaveBeenCalledWith('/releases/[slug]', 'page');
    });

    it('should return error on database failure', async () => {
      vi.mocked(prisma.image.update).mockRejectedValue(Error('Database error'));

      const result = await updateReleaseImageAction('image-123', { caption: 'New caption' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update image');
    });
  });

  describe('reorderReleaseImagesAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(
        reorderReleaseImagesAction('release-123', ['image-1', 'image-2'])
      ).rejects.toThrow('Unauthorized');

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const result = await reorderReleaseImagesAction('release-123', ['image-1', 'image-2']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when no image IDs provided', async () => {
      const result = await reorderReleaseImagesAction('release-123', []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No image IDs provided');
    });

    it('should reorder images in a transaction', async () => {
      const mockImages = [
        { id: 'image-2', src: 'https://cdn.example.com/image2.jpg', sortOrder: 0 },
        { id: 'image-1', src: 'https://cdn.example.com/image1.jpg', sortOrder: 1 },
      ];

      vi.mocked(prisma.$transaction).mockResolvedValue([]);
      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await reorderReleaseImagesAction('release-123', ['image-2', 'image-1']);

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should log security event on successful reorder', async () => {
      vi.mocked(prisma.$transaction).mockResolvedValue([]);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      await reorderReleaseImagesAction('release-123', ['image-1', 'image-2', 'image-3']);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.release.images.reordered',
        userId: 'user-123',
        metadata: {
          releaseId: 'release-123',
          imageCount: 3,
          success: true,
        },
      });
    });

    it('should revalidate paths on successful reorder', async () => {
      vi.mocked(prisma.$transaction).mockResolvedValue([]);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      await reorderReleaseImagesAction('release-123', ['image-1', 'image-2']);

      expect(revalidatePath).toHaveBeenCalledWith('/releases/[slug]', 'page');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/releases');
    });

    it('should return updated images after reorder', async () => {
      const mockImages = [
        {
          id: 'image-2',
          src: 'https://cdn.example.com/image2.jpg',
          caption: 'Caption 2',
          altText: 'Alt 2',
          sortOrder: 0,
        },
        {
          id: 'image-1',
          src: 'https://cdn.example.com/image1.jpg',
          caption: 'Caption 1',
          altText: 'Alt 1',
          sortOrder: 1,
        },
      ];

      vi.mocked(prisma.$transaction).mockResolvedValue([]);
      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await reorderReleaseImagesAction('release-123', ['image-2', 'image-1']);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].id).toBe('image-2');
      expect(result.data?.[1].id).toBe('image-1');
    });

    it('should return error on database failure', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(Error('Database error'));

      const result = await reorderReleaseImagesAction('release-123', ['image-1', 'image-2']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to reorder images');
    });
  });
});
