/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageRepository } from './image-repository';

// Mock Prisma Client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tourImage: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((callback) =>
      callback({
        tourImage: {
          findMany: vi.fn(),
          update: vi.fn(),
        },
      })
    ),
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ImageRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findByTourId', () => {
    it('should return all images for a tour sorted by displayOrder', async () => {
      const mockImages = [
        {
          id: 'img1',
          tourId: 'tour123',
          s3Key: 'media/tours/tour123/poster1.jpg',
          s3Url: 'https://cdn.example.com/poster1.jpg',
          s3Bucket: 'test-bucket',
          fileName: 'poster1.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
          displayOrder: 0,
          altText: 'Tour poster 1',
          createdAt: new Date('2026-01-01'),
          uploadedBy: 'user1',
        },
        {
          id: 'img2',
          tourId: 'tour123',
          s3Key: 'media/tours/tour123/poster2.jpg',
          s3Url: 'https://cdn.example.com/poster2.jpg',
          s3Bucket: 'test-bucket',
          fileName: 'poster2.jpg',
          fileSize: 2048000,
          mimeType: 'image/png',
          displayOrder: 1,
          altText: 'Tour poster 2',
          createdAt: new Date('2026-01-02'),
          uploadedBy: 'user1',
        },
      ];

      (prisma.tourImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockImages);

      const result = await ImageRepository.findByTourId('tour123');

      expect(result).toEqual(mockImages);
      expect(prisma.tourImage.findMany).toHaveBeenCalledWith({
        where: { tourId: 'tour123' },
        orderBy: { displayOrder: 'asc' },
      });
    });

    it('should return empty array when tour has no images', async () => {
      (prisma.tourImage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await ImageRepository.findByTourId('tour-no-images');

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      (prisma.tourImage.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(ImageRepository.findByTourId('tour123')).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return an image by ID', async () => {
      const mockImage = {
        id: 'img1',
        tourId: 'tour123',
        s3Key: 'media/tours/tour123/poster.jpg',
        s3Url: 'https://cdn.example.com/poster.jpg',
        s3Bucket: 'test-bucket',
        fileName: 'poster.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        displayOrder: 0,
        altText: 'Tour poster',
        createdAt: new Date('2026-01-01'),
        uploadedBy: 'user1',
      };

      (prisma.tourImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockImage);

      const result = await ImageRepository.findById('img1');

      expect(result).toEqual(mockImage);
      expect(prisma.tourImage.findUnique).toHaveBeenCalledWith({
        where: { id: 'img1' },
      });
    });

    it('should return null when image not found', async () => {
      (prisma.tourImage.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await ImageRepository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new tour image record', async () => {
      const input = {
        tourId: 'tour123',
        s3Key: 'media/tours/tour123/poster-123456.jpg',
        s3Url: 'https://cdn.example.com/poster-123456.jpg',
        s3Bucket: 'test-bucket',
        fileName: 'poster.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        displayOrder: 0,
        altText: 'Tour promotional poster',
        uploadedBy: 'user1',
      };

      const mockCreated = {
        id: 'img-new',
        ...input,
        createdAt: new Date(),
      };

      (prisma.tourImage.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreated);

      const result = await ImageRepository.create(input);

      expect(result).toEqual(mockCreated);
      expect(prisma.tourImage.create).toHaveBeenCalledWith({
        data: input,
      });
    });

    it('should handle optional fields correctly', async () => {
      const input = {
        tourId: 'tour123',
        s3Key: 'media/tours/tour123/poster.jpg',
        s3Url: 'https://cdn.example.com/poster.jpg',
        s3Bucket: 'test-bucket',
        fileName: 'poster.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        displayOrder: 0,
        // altText and uploadedBy are optional
      };

      const mockCreated = {
        id: 'img-new',
        ...input,
        altText: null,
        uploadedBy: null,
        createdAt: new Date(),
      };

      (prisma.tourImage.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCreated);

      const result = await ImageRepository.create(input);

      expect(result.altText).toBeNull();
      expect(result.uploadedBy).toBeNull();
    });

    it('should throw error on database constraint violation', async () => {
      const input = {
        tourId: 'tour123',
        s3Key: 'media/tours/tour123/poster.jpg',
        s3Url: 'https://cdn.example.com/poster.jpg',
        s3Bucket: 'test-bucket',
        fileName: 'poster.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        displayOrder: 0,
      };

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '5.0.0',
        }
      );

      (prisma.tourImage.create as ReturnType<typeof vi.fn>).mockRejectedValue(prismaError);

      await expect(ImageRepository.create(input)).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('should delete an image by ID and return deleted record', async () => {
      const mockDeleted = {
        id: 'img1',
        tourId: 'tour123',
        s3Key: 'media/tours/tour123/poster.jpg',
        s3Url: 'https://cdn.example.com/poster.jpg',
        s3Bucket: 'test-bucket',
        fileName: 'poster.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        displayOrder: 0,
        altText: 'Tour poster',
        createdAt: new Date(),
        uploadedBy: 'user1',
      };

      (prisma.tourImage.delete as ReturnType<typeof vi.fn>).mockResolvedValue(mockDeleted);

      const result = await ImageRepository.delete('img1');

      expect(result).toEqual(mockDeleted);
      expect(prisma.tourImage.delete).toHaveBeenCalledWith({
        where: { id: 'img1' },
      });
    });

    it('should throw error when image not found', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      (prisma.tourImage.delete as ReturnType<typeof vi.fn>).mockRejectedValue(prismaError);

      await expect(ImageRepository.delete('non-existent')).rejects.toThrow();
    });
  });

  describe('deleteByTourId', () => {
    it('should delete all images for a tour and return count', async () => {
      (prisma.tourImage.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5 });

      const result = await ImageRepository.deleteByTourId('tour123');

      expect(result).toBe(5);
      expect(prisma.tourImage.deleteMany).toHaveBeenCalledWith({
        where: { tourId: 'tour123' },
      });
    });

    it('should return 0 when tour has no images', async () => {
      (prisma.tourImage.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });

      const result = await ImageRepository.deleteByTourId('tour-no-images');

      expect(result).toBe(0);
    });
  });

  describe('updateDisplayOrder', () => {
    it('should update display order for an image', async () => {
      const mockUpdated = {
        id: 'img1',
        tourId: 'tour123',
        s3Key: 'media/tours/tour123/poster.jpg',
        s3Url: 'https://cdn.example.com/poster.jpg',
        s3Bucket: 'test-bucket',
        fileName: 'poster.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        displayOrder: 2,
        altText: 'Tour poster',
        createdAt: new Date(),
        uploadedBy: 'user1',
      };

      (prisma.tourImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

      const result = await ImageRepository.updateDisplayOrder('img1', 2);

      expect(result).toEqual(mockUpdated);
      expect(prisma.tourImage.update).toHaveBeenCalledWith({
        where: { id: 'img1' },
        data: { displayOrder: 2 },
      });
    });

    it('should handle negative display order', async () => {
      const mockUpdated = {
        id: 'img1',
        displayOrder: -1,
      };

      (prisma.tourImage.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

      const result = await ImageRepository.updateDisplayOrder('img1', -1);

      expect(result.displayOrder).toBe(-1);
    });
  });

  describe('reorderImages', () => {
    it('should update display order for multiple images in a transaction', async () => {
      const imageOrders = [
        { id: 'img1', displayOrder: 2 },
        { id: 'img2', displayOrder: 0 },
        { id: 'img3', displayOrder: 1 },
      ];

      const mockTransactionResult = [
        { id: 'img1', displayOrder: 2 },
        { id: 'img2', displayOrder: 0 },
        { id: 'img3', displayOrder: 1 },
      ];

      // Mock $transaction to resolve with the expected result array
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue(mockTransactionResult);

      const result = await ImageRepository.reorderImages(imageOrders);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('img1');
      expect(result[0].displayOrder).toBe(2);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should handle empty reorder array', async () => {
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await ImageRepository.reorderImages([]);

      expect(result).toEqual([]);
    });

    it('should rollback transaction on error', async () => {
      const imageOrders = [
        { id: 'img1', displayOrder: 0 },
        { id: 'img2', displayOrder: 1 },
      ];

      (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Transaction failed')
      );

      await expect(ImageRepository.reorderImages(imageOrders)).rejects.toThrow();
    });
  });

  describe('count', () => {
    it('should return count of images for a tour', async () => {
      (prisma.tourImage.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      const result = await ImageRepository.count('tour123');

      expect(result).toBe(5);
      expect(prisma.tourImage.count).toHaveBeenCalledWith({
        where: { tourId: 'tour123' },
      });
    });

    it('should return 0 when tour has no images', async () => {
      (prisma.tourImage.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await ImageRepository.count('tour-no-images');

      expect(result).toBe(0);
    });
  });
});
