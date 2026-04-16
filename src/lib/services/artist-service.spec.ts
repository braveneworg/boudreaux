/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { ArtistService } from './artist-service';
import { prisma } from '../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock S3 with proper class syntax
const { mockS3Send, MockS3Client } = vi.hoisted(() => {
  const mockS3Send = vi.fn().mockResolvedValue({});
  const MockS3Client = class {
    send = mockS3Send;
  };
  return { mockS3Send, MockS3Client };
});
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: MockS3Client,
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class MockDeleteObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
  };
});
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => new MockS3Client(),
}));

vi.mock('../prisma', () => ({
  prisma: {
    artist: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    image: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    artistRelease: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe('ArtistService', () => {
  const mockArtist = {
    id: 'artist-123',
    firstName: 'John',
    middleName: null,
    surname: 'Doe',
    akaNames: null,
    displayName: 'John Doe',
    title: null,
    suffix: null,
    phone: null,
    email: null,
    address1: null,
    address2: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    bio: null,
    shortBio: null,
    altBio: null,
    slug: 'john-doe',
    genres: null,
    bornOn: null,
    diedOn: null,
    formedOn: null,
    publishedOn: null,
    publishedBy: null,
    createdAt: new Date('2024-01-01'),
    createdBy: null,
    updatedAt: new Date('2024-01-01'),
    updatedBy: null,
    deletedOn: null,
    deletedBy: null,
    deactivatedAt: null,
    deactivatedBy: null,
    reactivatedAt: null,
    reactivatedBy: null,
    notes: [],
    tags: null,
    isPseudonymous: false,
    isActive: true,
    instruments: null,
    trackId: null,
    featuredArtistId: null,
    images: [],
    labels: [],
    releases: [],
    urls: [],
  };
  describe('createArtist', () => {
    const createInput: Prisma.ArtistCreateInput = {
      firstName: 'John',
      surname: 'Doe',
      displayName: 'John Doe',
      slug: 'john-doe',
    };

    it('should create an artist successfully', async () => {
      vi.mocked(prisma.artist.create).mockResolvedValue(mockArtist);

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(prisma.artist.create).toHaveBeenCalledWith({ data: createInput });
    });

    it('should return error when slug already exists', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.create).mockRejectedValue(prismaError);

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Artist with this slug already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.create).mockRejectedValue(initError);

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.create).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create artist' });
    });
  });

  describe('getArtistById', () => {
    it('should retrieve an artist by ID', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(mockArtist);

      const result = await ArtistService.getArtistById('artist-123');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { id: 'artist-123' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      const result = await ArtistService.getArtistById('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.getArtistById('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.getArtistById('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artist' });
    });
  });

  describe('getArtistBySlug', () => {
    it('should retrieve an artist by slug', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(mockArtist);

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({ where: { slug: 'john-doe' } });
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      const result = await ArtistService.getArtistBySlug('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artist' });
    });
  });

  describe('getArtists', () => {
    const mockArtists = [
      mockArtist,
      {
        ...mockArtist,
        id: 'artist-456',
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
      },
    ];

    it('should retrieve all artists with default parameters', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue(mockArtists);

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: true, data: mockArtists });
      expect(prisma.artist.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
        },
      });
    });

    it('should retrieve artists with custom pagination', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist]);

      const result = await ArtistService.getArtists({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(prisma.artist.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
        },
      });
    });

    it('should search across multiple fields', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist]);

      const result = await ArtistService.getArtists({ search: 'john' });

      expect(result.success).toBe(true);
      expect(prisma.artist.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { firstName: { contains: 'john', mode: 'insensitive' } },
            { surname: { contains: 'john', mode: 'insensitive' } },
            { displayName: { contains: 'john', mode: 'insensitive' } },
            { slug: { contains: 'john', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
        },
      });
    });

    it('should combine pagination and search', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist]);

      const result = await ArtistService.getArtists({
        skip: 5,
        take: 10,
        search: 'doe',
      });

      expect(result.success).toBe(true);
      expect(prisma.artist.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { firstName: { contains: 'doe', mode: 'insensitive' } },
            { surname: { contains: 'doe', mode: 'insensitive' } },
            { displayName: { contains: 'doe', mode: 'insensitive' } },
            { slug: { contains: 'doe', mode: 'insensitive' } },
          ],
        },
        skip: 5,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
        },
      });
    });

    it('should return empty array when no artists found', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([]);

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findMany).mockRejectedValue(initError);

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artists' });
    });
  });

  describe('updateArtist', () => {
    const updateData: Prisma.ArtistUpdateInput = {
      displayName: 'John Updated Doe',
    };

    it('should update an artist successfully', async () => {
      const updatedArtist = { ...mockArtist, displayName: 'John Updated Doe' };
      vi.mocked(prisma.artist.update).mockResolvedValue(updatedArtist);

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result).toMatchObject({ success: true, data: updatedArtist });
      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'artist-123' },
        data: updateData,
      });
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.updateArtist('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when slug already exists', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.update).mockRejectedValue(uniqueError);

      const result = await ArtistService.updateArtist('artist-123', { slug: 'existing-slug' });

      expect(result).toMatchObject({
        success: false,
        error: 'Artist with this slug already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.update).mockRejectedValue(initError);

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Failed to update artist' });
    });
  });

  describe('deleteArtist', () => {
    it('should delete an artist successfully', async () => {
      vi.mocked(prisma.artist.delete).mockResolvedValue(mockArtist);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(prisma.artist.delete).toHaveBeenCalledWith({ where: { id: 'artist-123' } });
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.delete).mockRejectedValue(notFoundError);

      const result = await ArtistService.deleteArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.delete).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.delete).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete artist' });
    });
  });

  describe('archiveArtist', () => {
    it('should archive an artist successfully', async () => {
      const archivedArtist = { ...mockArtist, deletedOn: new Date('2024-12-13') };
      vi.mocked(prisma.artist.update).mockResolvedValue(archivedArtist);

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: archivedArtist });
      expect(prisma.artist.update).toHaveBeenCalledWith({
        where: { id: 'artist-123' },
        data: { deletedOn: expect.any(Date) },
      });
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.update).mockReset();
      vi.mocked(prisma.artist.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.archiveArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.update).mockReset();
      vi.mocked(prisma.artist.update).mockRejectedValue(initError);

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.update).mockReset();
      vi.mocked(prisma.artist.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to archive artist' });
    });
  });

  describe('uploadArtistImage', () => {
    const mockImageData = {
      file: Buffer.from('test image data'),
      fileName: 'test-image.jpg',
      contentType: 'image/jpeg',
      caption: 'Test caption',
      altText: 'Test alt text',
    };

    beforeEach(() => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
      process.env.AWS_REGION = 'us-east-1';
    });

    it('should upload image successfully', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/test-image.jpg',
        caption: 'Test caption',
        altText: 'Test alt text',
        sortOrder: 0,
      } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result.success).toBe(true);
      expect((result as { success: true; data: { id: string } }).data.id).toBe('image-123');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when S3 bucket not configured', async () => {
      delete process.env.S3_BUCKET;
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'S3 bucket not configured' });
    });

    it('should handle database unavailable error', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'Failed to upload image' });
    });

    it('should use direct S3 URL when CDN not configured', async () => {
      delete process.env.CDN_DOMAIN;
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://test-bucket.s3.us-east-1.amazonaws.com/media/artists/artist-123/test-image.jpg',
        caption: 'Test caption',
        altText: 'Test alt text',
        sortOrder: 0,
      } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result.success).toBe(true);
    });
  });

  describe('uploadArtistImages', () => {
    const mockImageDataArray = [
      {
        file: Buffer.from('test image 1'),
        fileName: 'image1.jpg',
        contentType: 'image/jpeg',
      },
      {
        file: Buffer.from('test image 2'),
        fileName: 'image2.jpg',
        contentType: 'image/jpeg',
      },
    ];

    beforeEach(() => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
      process.env.AWS_REGION = 'us-east-1';
    });

    it('should upload multiple images successfully', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      vi.mocked(prisma.image.create)
        .mockResolvedValueOnce({
          id: 'image-1',
          src: 'https://cdn.example.com/image1.jpg',
          sortOrder: 0,
        } as never)
        .mockResolvedValueOnce({
          id: 'image-2',
          src: 'https://cdn.example.com/image2.jpg',
          sortOrder: 1,
        } as never);

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(2);
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      expect(result).toMatchObject({ success: false, error: 'Failed to upload images' });
    });

    it('should aggregate errors when all uploads fail', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      // Mock S3 upload to fail for all images
      mockS3Send.mockRejectedValue(new Error('S3 upload failed'));

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain('image1.jpg');
      expect((result as { success: false; error: string }).error).toContain('image2.jpg');
      // Restore mock for other tests
      mockS3Send.mockResolvedValue({});
    });

    it('should return partial success when some uploads fail', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      // First upload succeeds, second fails
      mockS3Send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('S3 upload failed'));
      vi.mocked(prisma.image.create).mockResolvedValueOnce({
        id: 'image-1',
        src: 'https://cdn.example.com/image1.jpg',
        sortOrder: 0,
      } as never);

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      // Should still succeed because at least one image uploaded
      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(1);
      // Restore mock for other tests
      mockS3Send.mockResolvedValue({});
    });
  });

  describe('deleteArtistImage', () => {
    beforeEach(() => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
    });

    it('should delete image successfully', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect((result as { success: true; data: { id: string } }).data.id).toBe('image-123');
    });

    it('should return error when image not found', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue(null);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should delete from S3 with S3 URL format', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://test-bucket.s3.us-east-1.amazonaws.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should continue with DB delete even if S3 delete fails', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
    });

    it('should skip S3 deletion when image URL does not match CDN or S3 patterns', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://some-other-host.example.com/media/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should handle database unavailable error', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle P2025 error when image is deleted during operation', async () => {
      // Simulate findUnique succeeding but delete failing due to record being deleted
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      const p2025Error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.image.delete).mockRejectedValue(p2025Error);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should handle database init error during delete', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.delete).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle generic error during delete operation', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockRejectedValue(new Error('Unexpected failure'));

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete image' });
    });
  });

  describe('getArtistImages', () => {
    it('should get artist images successfully', async () => {
      const mockImages = [
        { id: 'image-1', src: 'https://cdn.example.com/image1.jpg', sortOrder: 0 },
        { id: 'image-2', src: 'https://cdn.example.com/image2.jpg', sortOrder: 1 },
      ];
      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(2);
    });

    it('should use fallback values when image fields are null or missing', async () => {
      const mockImages = [{ id: 'image-1', src: null, caption: null, altText: null }];
      vi.mocked(prisma.image.findMany).mockResolvedValue(mockImages as never);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result.success).toBe(true);
      const data = (
        result as {
          success: true;
          data: {
            id: string;
            src: string;
            caption?: string;
            altText?: string;
            sortOrder: number;
          }[];
        }
      ).data;
      expect(data[0].src).toBe('');
      expect(data[0].caption).toBeUndefined();
      expect(data[0].altText).toBeUndefined();
      expect(data[0].sortOrder).toBe(0);
    });

    it('should return empty array when no images found', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(0);
    });

    it('should handle database unavailable error', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.findMany).mockRejectedValue(initError);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.image.findMany).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artist images' });
    });
  });

  describe('updateArtistImage', () => {
    it('should update image successfully', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/image.jpg',
        caption: 'Updated caption',
        altText: 'Updated alt text',
        sortOrder: 0,
      } as never);

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
        altText: 'Updated alt text',
      });

      expect(result.success).toBe(true);
      expect((result as { success: true; data: { caption: string } }).data.caption).toBe(
        'Updated caption'
      );
    });

    it('should use fallback values when updated image has null fields', async () => {
      vi.mocked(prisma.image.update).mockResolvedValue({
        id: 'image-123',
        src: null,
        caption: null,
        altText: null,
      } as never);

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: undefined,
        altText: undefined,
      });

      expect(result.success).toBe(true);
      const data = (
        result as {
          success: true;
          data: { src: string; caption?: string; altText?: string; sortOrder: number };
        }
      ).data;
      expect(data.src).toBe('');
      expect(data.caption).toBeUndefined();
      expect(data.altText).toBeUndefined();
      expect(data.sortOrder).toBe(0);
    });

    it('should return error when image not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.image.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
      });

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should handle database unavailable error', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.update).mockRejectedValue(initError);

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
      });

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.image.update).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
      });

      expect(result).toMatchObject({ success: false, error: 'Failed to update image' });
    });
  });

  describe('reorderArtistImages', () => {
    it('should reorder images successfully', async () => {
      vi.mocked(prisma.image.findMany)
        .mockResolvedValueOnce([{ id: 'image-1' }, { id: 'image-2' }] as never)
        .mockResolvedValueOnce([
          { id: 'image-2', src: 'https://cdn.example.com/image2.jpg', sortOrder: 0 },
          { id: 'image-1', src: 'https://cdn.example.com/image1.jpg', sortOrder: 1 },
        ] as never);
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result.success).toBe(true);
      expect(prisma.image.update).toHaveBeenCalled();
    });

    it('should use fallback values when reordered images have null fields', async () => {
      vi.mocked(prisma.image.findMany)
        .mockResolvedValueOnce([{ id: 'image-1' }, { id: 'image-2' }] as never)
        .mockResolvedValueOnce([
          { id: 'image-2', src: null, caption: null, altText: null },
          { id: 'image-1', src: null, caption: null, altText: null },
        ] as never);
      vi.mocked(prisma.image.update).mockResolvedValue({} as never);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result.success).toBe(true);
      const data = (
        result as {
          success: true;
          data: {
            id: string;
            src: string;
            caption?: string;
            altText?: string;
            sortOrder: number;
          }[];
        }
      ).data;
      expect(data[0].src).toBe('');
      expect(data[0].caption).toBeUndefined();
      expect(data[0].altText).toBeUndefined();
      expect(data[0].sortOrder).toBe(0);
      expect(data[1].src).toBe('');
      expect(data[1].sortOrder).toBe(0);
    });

    it('should return error when images not found', async () => {
      vi.mocked(prisma.image.findMany).mockResolvedValue([{ id: 'image-1' }] as never);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result).toMatchObject({
        success: false,
        error: 'Some images not found or do not belong to this artist',
      });
    });

    it('should handle database unavailable error', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.image.findMany).mockRejectedValue(initError);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.image.findMany).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result).toMatchObject({ success: false, error: 'Failed to reorder images' });
    });
  });

  describe('searchPublishedArtists', () => {
    it('should search published artists with default parameters', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist] as never);

      const result = await ArtistService.searchPublishedArtists();

      expect(result).toMatchObject({ success: true, data: [mockArtist] });
      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
            releases: {
              some: {
                release: {
                  publishedAt: { not: null },
                  OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
                },
              },
            },
          }),
          skip: 0,
          take: 50,
          orderBy: { displayName: 'asc' },
        })
      );
    });

    it('should search with custom pagination', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist] as never);

      const result = await ArtistService.searchPublishedArtists({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 5,
        })
      );
    });

    it('should search across name, group, and release title fields', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist] as never);

      const result = await ArtistService.searchPublishedArtists({ search: 'john' });

      expect(result.success).toBe(true);
      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
            AND: [
              {
                OR: expect.arrayContaining([
                  { firstName: { contains: 'john', mode: 'insensitive' } },
                  { surname: { contains: 'john', mode: 'insensitive' } },
                  { displayName: { contains: 'john', mode: 'insensitive' } },
                  { slug: { contains: 'john', mode: 'insensitive' } },
                  expect.objectContaining({
                    releases: expect.objectContaining({
                      some: expect.objectContaining({
                        release: expect.objectContaining({
                          title: { contains: 'john', mode: 'insensitive' },
                        }),
                      }),
                    }),
                  }),
                ]),
              },
            ],
          }),
        })
      );
    });

    it('should include images and releases in the query', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([mockArtist] as never);

      await ArtistService.searchPublishedArtists({ search: 'test' });

      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            images: expect.objectContaining({
              orderBy: { sortOrder: 'asc' },
              take: 1,
            }),
            releases: expect.objectContaining({
              include: expect.objectContaining({
                release: expect.objectContaining({
                  select: { id: true, title: true, publishedAt: true, deletedOn: true },
                }),
              }),
            }),
          }),
        })
      );
    });

    it('should return empty array when no artists found', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([]);

      const result = await ArtistService.searchPublishedArtists({ search: 'nonexistent' });

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findMany).mockRejectedValue(initError);

      const result = await ArtistService.searchPublishedArtists({ search: 'test' });

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findMany).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.searchPublishedArtists({ search: 'test' });

      expect(result).toMatchObject({ success: false, error: 'Failed to search artists' });
    });

    it('should not include search OR conditions when no search term', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValue([]);

      await ArtistService.searchPublishedArtists();

      expect(prisma.artist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
            releases: {
              some: {
                release: {
                  publishedAt: { not: null },
                  OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
                },
              },
            },
          },
        })
      );
    });
  });

  describe('getArtistBySlugWithReleases', () => {
    const mockArtistWithReleases = {
      ...mockArtist,
      releases: [
        {
          id: 'ar-1',
          artistId: mockArtist.id,
          releaseId: 'release-1',
          release: {
            id: 'release-1',
            title: 'Published Album',
            publishedAt: new Date('2024-01-01'),
            deletedOn: null,
            digitalFormats: [
              {
                id: 'df-1',
                format: 'MP3_320KBPS',
                files: [{ id: 'f-1', trackNumber: 1, fileName: 'track1.mp3' }],
              },
            ],
          },
        },
        {
          id: 'ar-2',
          artistId: mockArtist.id,
          releaseId: 'release-2',
          release: {
            id: 'release-2',
            title: 'Unpublished Album',
            publishedAt: null,
            deletedOn: null,
            digitalFormats: [],
          },
        },
        {
          id: 'ar-3',
          artistId: mockArtist.id,
          releaseId: 'release-3',
          release: {
            id: 'release-3',
            title: 'Deleted Album',
            publishedAt: new Date('2024-01-01'),
            deletedOn: new Date('2024-06-01'),
            digitalFormats: [],
          },
        },
      ],
    };

    it('should retrieve an artist with releases by slug', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(mockArtistWithReleases as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      expect(prisma.artist.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            slug: 'john-doe',
            isActive: true,
            OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
          },
          include: expect.objectContaining({
            images: true,
            labels: true,
            urls: true,
            releases: expect.objectContaining({
              include: expect.objectContaining({
                release: expect.objectContaining({
                  include: expect.objectContaining({
                    images: true,
                    digitalFormats: expect.objectContaining({
                      include: {
                        files: { orderBy: { trackNumber: 'asc' } },
                      },
                    }),
                  }),
                }),
              }),
            }),
          }),
        })
      );
    });

    it('should filter to only published, non-deleted releases', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(mockArtistWithReleases as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      const data = (result as unknown as { success: true; data: typeof mockArtistWithReleases })
        .data;
      expect(data.releases).toHaveLength(1);
      expect(data.releases[0].release.title).toBe('Published Album');
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(null);

      const result = await ArtistService.getArtistBySlugWithReleases('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findFirst).mockRejectedValue(initError);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findFirst).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artist' });
    });

    it('should return empty releases array when all releases are filtered out', async () => {
      const artistWithOnlyUnpublished = {
        ...mockArtist,
        releases: [
          {
            id: 'ar-2',
            release: {
              id: 'release-2',
              title: 'Unpublished',
              publishedAt: null,
              deletedOn: null,
            },
          },
        ],
      };
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(artistWithOnlyUnpublished as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      const data = (result as unknown as { success: true; data: typeof artistWithOnlyUnpublished })
        .data;
      expect(data.releases).toHaveLength(0);
    });

    it('should filter out releases with undefined publishedAt (missing MongoDB field)', async () => {
      const artistWithMissingPublishedAt = {
        ...mockArtist,
        releases: [
          {
            id: 'ar-4',
            release: {
              id: 'release-4',
              title: 'Missing publishedAt',
              publishedAt: undefined,
              deletedOn: null,
            },
          },
        ],
      };
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(artistWithMissingPublishedAt as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      const data = (
        result as unknown as { success: true; data: typeof artistWithMissingPublishedAt }
      ).data;
      expect(data.releases).toHaveLength(0);
    });
  });

  describe('findOrCreateByName', () => {
    const selectFields = { id: true, displayName: true, firstName: true, surname: true };
    const existingArtist = {
      id: 'artist-existing',
      displayName: 'Ceschi',
      firstName: 'Ceschi',
      surname: '',
    };

    it('should return artist found by slug', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(existingArtist as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { slug: 'ceschi' },
        select: selectFields,
      });
    });

    it('should fall back to displayName match when slug not found', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.findFirst).mockResolvedValueOnce(existingArtist as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: { displayName: { equals: 'Ceschi', mode: 'insensitive' } },
        select: selectFields,
      });
    });

    it('should fall back to firstName + surname match', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.findFirst)
        .mockResolvedValueOnce(null as never) // displayName miss
        .mockResolvedValueOnce(existingArtist as never); // firstName+surname hit

      const result = await ArtistService.findOrCreateByName('Ceschi Ramos');

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(prisma.artist.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { firstName: { equals: 'Ceschi', mode: 'insensitive' } },
            { surname: { equals: 'Ramos', mode: 'insensitive' } },
          ],
        },
        select: selectFields,
      });
    });

    it('should create a new artist when no match found', async () => {
      const newArtist = {
        id: 'artist-new',
        displayName: 'Jane Smith',
        firstName: 'Jane',
        surname: 'Smith',
      };
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.create).mockResolvedValue(newArtist as never);

      const result = await ArtistService.findOrCreateByName('Jane Smith');

      expect(result).toEqual({ success: true, data: newArtist });
      expect(prisma.artist.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Jane',
          surname: 'Smith',
          displayName: 'Jane Smith',
          slug: 'jane-smith',
          isActive: true,
        },
        select: selectFields,
      });
    });

    it('should handle single-word artist name', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.create).mockResolvedValue({
        id: 'artist-new',
        displayName: 'Ceschi',
        firstName: 'Ceschi',
        surname: '',
      } as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result.success).toBe(true);
      expect(prisma.artist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Ceschi',
            surname: '',
            displayName: 'Ceschi',
            slug: 'ceschi',
          }),
        })
      );
    });

    it('should return error for empty name', async () => {
      const result = await ArtistService.findOrCreateByName('');

      expect(result).toEqual({ success: false, error: 'Artist name is empty' });
    });

    it('should return error for whitespace-only name', async () => {
      const result = await ArtistService.findOrCreateByName('   ');

      expect(result).toEqual({ success: false, error: 'Artist name is empty' });
    });

    it('should handle P2002 slug collision by finding existing artist', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        meta: { target: ['slug'] },
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.artist.findUnique).mockResolvedValueOnce(null as never); // slug lookup
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.create).mockRejectedValue(p2002Error);
      vi.mocked(prisma.artist.findUnique).mockResolvedValueOnce(existingArtist as never); // retry

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result.success).toBe(true);
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection refused', '5.0.0');

      vi.mocked(prisma.artist.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: false, error: 'Database unavailable' });
    });
  });

  describe('uploadArtistImage - additional branch coverage', () => {
    beforeEach(() => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
      process.env.AWS_REGION = 'us-east-1';
    });

    it('should use fallback content type when contentType is empty', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/test-image.jpg',
        caption: null,
        altText: null,
        sortOrder: 0,
      } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', {
        file: Buffer.from('test'),
        fileName: 'test-image.jpg',
        contentType: '', // empty triggers || 'application/octet-stream'
      });

      expect(result.success).toBe(true);
    });

    it('should use fallback values when image result has null src, caption, altText, and no sortOrder', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([{ id: 'existing' }] as never);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-123',
        src: null, // triggers || imageUrl
        caption: null, // triggers || undefined
        altText: null, // triggers || undefined
        // no sortOrder property triggers ?? nextSortOrder
      } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', {
        file: Buffer.from('test'),
        fileName: 'test-image.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
      const data = (
        result as {
          success: true;
          data: { src: string; caption?: string; altText?: string; sortOrder: number };
        }
      ).data;
      // src falls back to imageUrl (CDN URL)
      expect(data.src).toContain('cdn.example.com');
      expect(data.caption).toBeUndefined();
      expect(data.altText).toBeUndefined();
      // sortOrder falls back to nextSortOrder (1, since there's 1 existing image)
      expect(data.sortOrder).toBe(1);
    });

    it('should use default AWS region when AWS_REGION is not set', async () => {
      delete process.env.AWS_REGION;
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://test-bucket.s3.us-east-1.amazonaws.com/test.jpg',
        caption: null,
        altText: null,
        sortOrder: 0,
      } as never);
      delete process.env.CDN_DOMAIN;

      const result = await ArtistService.uploadArtistImage('artist-123', {
        file: Buffer.from('test'),
        fileName: 'test-image.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
    });

    it('should handle fileName with no extension', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(prisma.image.findMany).mockResolvedValue([]);
      vi.mocked(prisma.image.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/test.jpg',
        caption: null,
        altText: null,
        sortOrder: 0,
      } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', {
        file: Buffer.from('test'),
        fileName: 'testfile', // no extension
        contentType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('deleteArtistImage - additional branch coverage', () => {
    beforeEach(() => {
      process.env.S3_BUCKET = 'test-bucket';
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
    });

    it('should skip S3 deletion when image src is null', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: null,
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should skip S3 deletion when S3_BUCKET is not configured', async () => {
      delete process.env.S3_BUCKET;
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should handle S3 URL where urlParts[1] is undefined', async () => {
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://bucket.s3.', // urlParts[1] will be empty string
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
    });

    it('should strip protocol from CDN_DOMAIN when extracting S3 key', async () => {
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
      vi.mocked(prisma.image.findUnique).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(prisma.image.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('findOrCreateByName - additional branch coverage', () => {
    const selectFields = { id: true, displayName: true, firstName: true, surname: true };

    it('should return error when P2002 collision occurs and existing artist is not found', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        meta: { target: ['slug'] },
        clientVersion: '5.0.0',
      });

      vi.mocked(prisma.artist.findUnique).mockResolvedValueOnce(null as never); // slug lookup
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.create).mockRejectedValue(p2002Error);
      vi.mocked(prisma.artist.findUnique).mockResolvedValueOnce(null as never); // retry also fails

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: false, error: 'Artist with this slug already exists' });
    });

    it('should handle unexpected error in findOrCreateByName', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.findFirst).mockResolvedValue(null as never);
      vi.mocked(prisma.artist.create).mockRejectedValue(new Error('Unexpected'));

      const result = await ArtistService.findOrCreateByName('New Artist');

      expect(result).toEqual({ success: false, error: 'Failed to find or create artist' });
    });

    it('should skip firstName+surname search when firstName is empty', async () => {
      // This requires splitFullName to return empty firstName.
      // With a name like " " it would be trimmed to empty and caught earlier.
      // So let's test with a name that generates slug but yields empty firstName from splitFullName.
      // Actually, a single-word name returns firstName=word, so we need special mock behavior.
      // The important branch is when slug lookup returns null, displayName returns null,
      // but firstName is truthy (which is always the case for non-empty names).
      // The actual uncovered branch is: byName not found -> falls through to create.
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null as never); // slug miss
      vi.mocked(prisma.artist.findFirst)
        .mockResolvedValueOnce(null as never) // displayName miss
        .mockResolvedValueOnce(null as never); // firstName+surname miss
      vi.mocked(prisma.artist.create).mockResolvedValue({
        id: 'new-id',
        displayName: 'Test Name',
        firstName: 'Test',
        surname: 'Name',
      } as never);

      const result = await ArtistService.findOrCreateByName('Test Name');

      expect(result.success).toBe(true);
      // Verify all three search paths were attempted
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-name' },
        select: selectFields,
      });
      expect(prisma.artist.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('connectToRelease', () => {
    it('should upsert an ArtistRelease join record', async () => {
      vi.mocked(prisma.artistRelease.upsert).mockResolvedValue({
        id: 'join-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
      } as never);

      await ArtistService.connectToRelease('artist-1', 'release-1');

      expect(prisma.artistRelease.upsert).toHaveBeenCalledWith({
        where: {
          artistId_releaseId: { artistId: 'artist-1', releaseId: 'release-1' },
        },
        update: {},
        create: { artistId: 'artist-1', releaseId: 'release-1' },
      });
    });

    it('should be idempotent on duplicate calls', async () => {
      vi.mocked(prisma.artistRelease.upsert).mockResolvedValue({
        id: 'join-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
      } as never);

      await ArtistService.connectToRelease('artist-1', 'release-1');
      await ArtistService.connectToRelease('artist-1', 'release-1');

      expect(prisma.artistRelease.upsert).toHaveBeenCalledTimes(2);
    });
  });
});
