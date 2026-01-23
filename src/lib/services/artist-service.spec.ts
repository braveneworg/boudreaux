import { Prisma } from '@prisma/client';

import { ArtistService } from './artist-service';
import { prisma } from '../prisma';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../prisma', () => ({
  prisma: {
    artist: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockArtist);
      }
      expect(prisma.artist.create).toHaveBeenCalledWith({ data: createInput });
    });

    it('should return error when slug already exists', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.create).mockRejectedValue(prismaError);

      const result = await ArtistService.createArtist(createInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist with this slug already exists');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.create).mockRejectedValue(initError);

      const result = await ArtistService.createArtist(createInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.create).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.createArtist(createInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to create artist');
      }
    });
  });

  describe('getArtistById', () => {
    it('should retrieve an artist by ID', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(mockArtist);

      const result = await ArtistService.getArtistById('artist-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockArtist);
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.getArtistById('artist-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.getArtistById('artist-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to retrieve artist');
      }
    });
  });

  describe('getArtistBySlug', () => {
    it('should retrieve an artist by slug', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(mockArtist);

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockArtist);
      }
      expect(prisma.artist.findUnique).toHaveBeenCalledWith({ where: { slug: 'john-doe' } });
    });

    it('should return error when artist not found', async () => {
      vi.mocked(prisma.artist.findUnique).mockResolvedValue(null);

      const result = await ArtistService.getArtistBySlug('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(initError);

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findUnique).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to retrieve artist');
      }
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockArtists);
      }
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.findMany).mockRejectedValue(initError);

      const result = await ArtistService.getArtists();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.findMany).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.getArtists();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to retrieve artists');
      }
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

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updatedArtist);
      }
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

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist not found');
      }
    });

    it('should return error when slug already exists', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.update).mockRejectedValue(uniqueError);

      const result = await ArtistService.updateArtist('artist-123', { slug: 'existing-slug' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist with this slug already exists');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.update).mockRejectedValue(initError);

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.update).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to update artist');
      }
    });
  });

  describe('deleteArtist', () => {
    it('should delete an artist successfully', async () => {
      vi.mocked(prisma.artist.delete).mockResolvedValue(mockArtist);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockArtist);
      }
      expect(prisma.artist.delete).toHaveBeenCalledWith({ where: { id: 'artist-123' } });
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      vi.mocked(prisma.artist.delete).mockRejectedValue(notFoundError);

      const result = await ArtistService.deleteArtist('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.delete).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.delete).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to delete artist');
      }
    });
  });

  describe('archiveArtist', () => {
    it('should archive an artist successfully', async () => {
      const archivedArtist = { ...mockArtist, deletedOn: new Date('2024-12-13') };
      vi.mocked(prisma.artist.update).mockResolvedValue(archivedArtist);

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(archivedArtist);
      }
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
      vi.mocked(prisma.artist.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.archiveArtist('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Artist not found');
      }
    });

    it('should return error when database is unavailable', async () => {
      const initError = new Prisma.PrismaClientInitializationError('Connection failed', '5.0.0');
      vi.mocked(prisma.artist.update).mockRejectedValue(initError);

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database unavailable');
      }
    });

    it('should handle unknown errors', async () => {
      vi.mocked(prisma.artist.update).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to archive artist');
      }
    });
  });
});
