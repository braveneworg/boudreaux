// Mock server-only and prisma first to prevent errors from imported modules
import { revalidatePath } from 'next/cache';

import { S3Client } from '@aws-sdk/client-s3';

import {
  deleteTrackImageAction,
  getTrackImagesAction,
  updateTrackImageAction,
  reorderTrackImagesAction,
} from './track-image-actions';
import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

vi.mock('server-only', () => ({}));
vi.mock('../prisma', () => ({
  prisma: {
    image: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('@prisma/client', () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(message: string, options: { code: string; clientVersion: string }) {
        super(message);
        this.code = options.code;
      }
    },
    PrismaClientInitializationError: class PrismaClientInitializationError extends Error {
      constructor(message: string, _clientVersion: string) {
        super(message);
      }
    },
  },
}));

// Mock all dependencies
vi.mock('next/cache');
vi.mock('../../../auth');
vi.mock('../utils/audit-log');
vi.mock('../utils/auth/require-role');
vi.mock('@aws-sdk/client-s3');

describe('Track Image Actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      role: 'admin',
      email: 'admin@example.com',
    },
  };

  const mockTrackId = 'track-123';
  const mockImageId = 'image-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRole).mockResolvedValue(undefined);
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(revalidatePath).mockImplementation(() => {});
    vi.mocked(logSecurityEvent).mockImplementation(() => {});

    // Mock S3Client
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(S3Client).mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as unknown as S3Client
    );
  });

  describe('deleteTrackImageAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(deleteTrackImageAction(mockImageId)).rejects.toThrow('Unauthorized');

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const result = await deleteTrackImageAction(mockImageId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when user is not admin', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', role: 'user' },
      } as never);

      const result = await deleteTrackImageAction(mockImageId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when image is not found', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue(null);

      const result = await deleteTrackImageAction(mockImageId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Image not found');
    });

    it('should delete image successfully', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: mockImageId,
        src: 'https://cdn.example.com/media/tracks/track-123/image.jpg',
        trackId: mockTrackId,
      } as never);

      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      const result = await deleteTrackImageAction(mockImageId);

      expect(result.success).toBe(true);
      expect(prisma.image.delete).toHaveBeenCalledWith({
        where: { id: mockImageId },
      });
    });

    it('should attempt to delete from S3 when CDN URL matches', async () => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';

      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: mockImageId,
        src: 'https://cdn.example.com/media/tracks/track-123/image.jpg',
        trackId: mockTrackId,
      } as never);

      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      await deleteTrackImageAction(mockImageId);

      expect(S3Client).toHaveBeenCalled();
    });

    it('should log security event on successful deletion', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: mockImageId,
        src: 'https://example.com/image.jpg',
        trackId: mockTrackId,
      } as never);

      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      await deleteTrackImageAction(mockImageId);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.image.deleted',
        userId: 'user-123',
        metadata: {
          imageId: mockImageId,
          trackId: mockTrackId,
          success: true,
        },
      });
    });

    it('should revalidate paths on successful deletion', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: mockImageId,
        src: 'https://example.com/image.jpg',
        trackId: mockTrackId,
      } as never);

      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      await deleteTrackImageAction(mockImageId);

      expect(revalidatePath).toHaveBeenCalledWith('/tracks/[id]', 'page');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/tracks');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.image.findUnique).mockRejectedValue(Error('Database error'));

      const result = await deleteTrackImageAction(mockImageId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete image');
    });

    it('should continue with DB delete even if S3 delete fails', async () => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';

      const mockSend = vi.fn().mockRejectedValue(Error('S3 error'));
      vi.mocked(S3Client).mockImplementation(
        () =>
          ({
            send: mockSend,
          }) as unknown as S3Client
      );

      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: mockImageId,
        src: 'https://cdn.example.com/media/tracks/track-123/image.jpg',
        trackId: mockTrackId,
      } as never);

      vi.mocked(prisma.image.delete).mockResolvedValue({} as never);

      const result = await deleteTrackImageAction(mockImageId);

      expect(result.success).toBe(true);
      expect(prisma.image.delete).toHaveBeenCalled();
    });
  });

  describe('getTrackImagesAction', () => {
    it('should retrieve images for a track', async () => {
      const mockImages = [
        {
          id: 'img-1',
          src: 'https://example.com/1.jpg',
          caption: 'Caption 1',
          altText: 'Alt 1',
          sortOrder: 0,
        },
        {
          id: 'img-2',
          src: 'https://example.com/2.jpg',
          caption: 'Caption 2',
          altText: 'Alt 2',
          sortOrder: 1,
        },
      ];

      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await getTrackImagesAction(mockTrackId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0]).toEqual({
        id: 'img-1',
        src: 'https://example.com/1.jpg',
        caption: 'Caption 1',
        altText: 'Alt 1',
        sortOrder: 0,
      });
    });

    it('should return empty array when no images exist', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      const result = await getTrackImagesAction(mockTrackId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle null values in image fields', async () => {
      const mockImages = [{ id: 'img-1', src: null, caption: null, altText: null, sortOrder: 0 }];

      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await getTrackImagesAction(mockTrackId);

      expect(result.success).toBe(true);
      expect(result.data?.[0]).toEqual({
        id: 'img-1',
        src: '',
        caption: undefined,
        altText: undefined,
        sortOrder: 0,
      });
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.image.findMany).mockRejectedValue(Error('Database error'));

      const result = await getTrackImagesAction(mockTrackId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to retrieve images');
    });

    it('should order images by sortOrder ascending', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      await getTrackImagesAction(mockTrackId);

      expect(prisma.image.findMany).toHaveBeenCalledWith({
        where: { trackId: mockTrackId },
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

  describe('updateTrackImageAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(updateTrackImageAction(mockImageId, { caption: 'New caption' })).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const result = await updateTrackImageAction(mockImageId, { caption: 'New caption' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should update image caption successfully', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      const result = await updateTrackImageAction(mockImageId, { caption: 'New caption' });

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: mockImageId },
        data: {
          caption: 'New caption',
          altText: undefined,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update image altText successfully', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      const result = await updateTrackImageAction(mockImageId, { altText: 'New alt text' });

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: mockImageId },
        data: {
          caption: undefined,
          altText: 'New alt text',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should update both caption and altText', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      const result = await updateTrackImageAction(mockImageId, {
        caption: 'New caption',
        altText: 'New alt text',
      });

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalledWith({
        where: { id: mockImageId },
        data: {
          caption: 'New caption',
          altText: 'New alt text',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should revalidate path on success', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      await updateTrackImageAction(mockImageId, { caption: 'New caption' });

      expect(revalidatePath).toHaveBeenCalledWith('/tracks/[id]', 'page');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.image.update).mockRejectedValue(Error('Database error'));

      const result = await updateTrackImageAction(mockImageId, { caption: 'New caption' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to update image');
    });
  });

  describe('reorderTrackImagesAction', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(reorderTrackImagesAction(mockTrackId, ['img-1', 'img-2'])).rejects.toThrow(
        'Unauthorized'
      );

      expect(requireRole).toHaveBeenCalledWith('admin');
    });

    it('should return error when user is not logged in', async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const result = await reorderTrackImagesAction(mockTrackId, ['img-1', 'img-2']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('should return error when no image IDs provided', async () => {
      const result = await reorderTrackImagesAction(mockTrackId, []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No image IDs provided');
    });

    it('should reorder images successfully', async () => {
      const imageIds = ['img-2', 'img-1', 'img-3'];

      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}, {}] as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([
        {
          id: 'img-2',
          src: 'https://example.com/2.jpg',
          caption: null,
          altText: null,
          sortOrder: 0,
        },
        {
          id: 'img-1',
          src: 'https://example.com/1.jpg',
          caption: null,
          altText: null,
          sortOrder: 1,
        },
        {
          id: 'img-3',
          src: 'https://example.com/3.jpg',
          caption: null,
          altText: null,
          sortOrder: 2,
        },
      ] as never);

      const result = await reorderTrackImagesAction(mockTrackId, imageIds);

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should log security event on successful reorder', async () => {
      const imageIds = ['img-1', 'img-2'];

      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([
        {
          id: 'img-1',
          src: 'https://example.com/1.jpg',
          caption: null,
          altText: null,
          sortOrder: 0,
        },
        {
          id: 'img-2',
          src: 'https://example.com/2.jpg',
          caption: null,
          altText: null,
          sortOrder: 1,
        },
      ] as never);

      await reorderTrackImagesAction(mockTrackId, imageIds);

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.track.images.reordered',
        userId: 'user-123',
        metadata: {
          trackId: mockTrackId,
          imageCount: 2,
          success: true,
        },
      });
    });

    it('should revalidate paths on success', async () => {
      const imageIds = ['img-1', 'img-2'];

      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([
        {
          id: 'img-1',
          src: 'https://example.com/1.jpg',
          caption: null,
          altText: null,
          sortOrder: 0,
        },
        {
          id: 'img-2',
          src: 'https://example.com/2.jpg',
          caption: null,
          altText: null,
          sortOrder: 1,
        },
      ] as never);

      await reorderTrackImagesAction(mockTrackId, imageIds);

      expect(revalidatePath).toHaveBeenCalledWith('/tracks/[id]', 'page');
      expect(revalidatePath).toHaveBeenCalledWith('/admin/tracks');
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.$transaction).mockRejectedValue(Error('Database error'));

      const result = await reorderTrackImagesAction(mockTrackId, ['img-1', 'img-2']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to reorder images');
    });

    it('should return updated images in new order', async () => {
      const imageIds = ['img-2', 'img-1'];

      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([
        {
          id: 'img-2',
          src: 'https://example.com/2.jpg',
          caption: 'Caption 2',
          altText: 'Alt 2',
          sortOrder: 0,
        },
        {
          id: 'img-1',
          src: 'https://example.com/1.jpg',
          caption: 'Caption 1',
          altText: 'Alt 1',
          sortOrder: 1,
        },
      ] as never);

      const result = await reorderTrackImagesAction(mockTrackId, imageIds);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].id).toBe('img-2');
      expect(result.data?.[0].sortOrder).toBe(0);
      expect(result.data?.[1].id).toBe('img-1');
      expect(result.data?.[1].sortOrder).toBe(1);
    });
  });
});
