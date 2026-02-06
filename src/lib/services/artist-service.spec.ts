import { Prisma } from '@prisma/client';

import { ArtistService } from './artist-service';
import { prisma } from '../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock S3 with proper class syntax
const mockS3Send = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class MockS3Client {
      send = mockS3Send;
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
    DeleteObjectCommand: class MockDeleteObjectCommand {
      constructor(public params: Record<string, unknown>) {}
    },
  };
});

vi.mock('../prisma', () => ({
  prisma: {
    artist: {
      create: vi.fn(),
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
    groups: [],
    releases: [],
    urls: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
