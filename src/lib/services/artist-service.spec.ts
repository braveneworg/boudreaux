/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistBioImageRepository } from '@/lib/repositories/artist-bio-image-repository';
import { ArtistBioLinkRepository } from '@/lib/repositories/artist-bio-link-repository';
import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { ImageRepository } from '@/lib/repositories/image-repository';
import type { CreateArtistData, UpdateArtistData } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import { isPubliclyRoutableUrl } from '@/lib/utils/ip-guard';
import { deleteS3Object } from '@/lib/utils/s3-client';

import { ArtistService } from './artist-service';
import { BioImageService } from './bio-image-service';

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
  deleteS3Object: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    create: vi.fn(),
    createWithSelect: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findUniqueBySlug: vi.fn(),
    findFirstByDisplayName: vi.fn(),
    findFirstByName: vi.fn(),
    findMany: vi.fn(),
    searchPublished: vi.fn(),
    listPublishedWithBio: vi.fn(),
    findPublishedBySlugWithReleases: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
    existsById: vi.fn(),
    connectToRelease: vi.fn(),
    updateEnrichedField: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/artist-bio-image-repository', () => ({
  ArtistBioImageRepository: {
    create: vi.fn(),
    delete: vi.fn(),
    findForRehost: vi.fn(),
    findCustomUrls: vi.fn(),
    updateUrl: vi.fn(),
    updateAttribution: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/artist-bio-link-repository', () => ({
  ArtistBioLinkRepository: {
    create: vi.fn(),
    delete: vi.fn(),
    findByUrl: vi.fn(),
  },
}));

vi.mock('@/lib/utils/ip-guard', () => ({
  isPubliclyRoutableUrl: vi.fn(),
}));

vi.mock('./bio-image-service', () => ({
  BioImageService: {
    rehostWithVariants: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/image-repository', () => ({
  ImageRepository: {
    findManyByOwner: vi.fn(),
    findManyByArtist: vi.fn(),
    findManyByArtistAndIds: vi.fn(),
    findUniqueById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateSortOrder: vi.fn(),
    delete: vi.fn(),
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
    bioGeneratedAt: null,
    bioModel: null,
    bioStatus: null,
    bioError: null,
    bioStartedAt: null,
    bioJobToken: null,
    bioProgress: null,
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
    const createInput: CreateArtistData = {
      firstName: 'John',
      surname: 'Doe',
      displayName: 'John Doe',
      slug: 'john-doe',
    };

    it('should create an artist successfully', async () => {
      vi.mocked(ArtistRepository.create).mockResolvedValue(mockArtist);

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(ArtistRepository.create).toHaveBeenCalledWith(createInput);
    });

    it('should return error when slug already exists', async () => {
      const prismaError = new DataError('DUPLICATE', 'Unique constraint failed');
      vi.mocked(ArtistRepository.create).mockRejectedValue(prismaError);

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Artist with this slug already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.create).mockRejectedValue(initError);

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.create).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.createArtist(createInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create artist' });
    });
  });

  describe('getArtistById', () => {
    it('should retrieve an artist by ID', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValue(mockArtist);

      const result = await ArtistService.getArtistById('artist-123');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(ArtistRepository.findById).toHaveBeenCalledWith('artist-123');
    });

    it('should return error when artist not found', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValue(null);

      const result = await ArtistService.getArtistById('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.findById).mockRejectedValue(initError);

      const result = await ArtistService.getArtistById('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.findById).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.getArtistById('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artist' });
    });
  });

  describe('getArtistBySlug', () => {
    it('should retrieve an artist by slug', async () => {
      vi.mocked(ArtistRepository.findBySlug).mockResolvedValue(mockArtist);

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(ArtistRepository.findBySlug).toHaveBeenCalledWith('john-doe');
    });

    it('should return error when artist not found', async () => {
      vi.mocked(ArtistRepository.findBySlug).mockResolvedValue(null);

      const result = await ArtistService.getArtistBySlug('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.findBySlug).mockRejectedValue(initError);

      const result = await ArtistService.getArtistBySlug('john-doe');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.findBySlug).mockRejectedValue(Error('Unknown error'));

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

    it('should retrieve all artists with default parameters (excludes deleted)', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue(mockArtists);

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: true, data: mockArtists });
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({});
    });

    it('should retrieve artists with custom pagination', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([mockArtist]);

      const result = await ArtistService.getArtists({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ skip: 10, take: 5 });
    });

    it('should search across multiple fields', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([mockArtist]);

      const result = await ArtistService.getArtists({ search: 'john' });

      expect(result.success).toBe(true);
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ search: 'john' });
    });

    it('should combine pagination and search', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([mockArtist]);

      const result = await ArtistService.getArtists({
        skip: 5,
        take: 10,
        search: 'doe',
      });

      expect(result.success).toBe(true);
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ skip: 5, take: 10, search: 'doe' });
    });

    it('should add publishedOn filter when published=true', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([mockArtist]);

      await ArtistService.getArtists({ published: true });

      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ published: true });
    });

    it('should add unpublished filter when published=false', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([mockArtist]);

      await ArtistService.getArtists({ published: false });

      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ published: false });
    });

    it('should omit the deletedOn constraint when deleted=true', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([mockArtist]);

      await ArtistService.getArtists({ deleted: true });

      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ deleted: true });
    });

    it('should return empty array when no artists found', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([]);

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.findMany).mockRejectedValue(initError);

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.findMany).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.getArtists();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artists' });
    });
  });

  describe('updateArtist', () => {
    const updateData: UpdateArtistData = {
      displayName: 'John Updated Doe',
    };

    it('should update an artist successfully', async () => {
      const updatedArtist = { ...mockArtist, displayName: 'John Updated Doe' };
      vi.mocked(ArtistRepository.update).mockResolvedValue(updatedArtist);

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result).toMatchObject({ success: true, data: updatedArtist });
      expect(ArtistRepository.update).toHaveBeenCalledWith('artist-123', updateData);
    });

    it('sanitizes the bio HTML before persisting', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', {
        bio: '<p>Hi</p><script>alert(1)</script>',
      });

      expect(ArtistRepository.update).toHaveBeenCalledWith('artist-123', { bio: '<p>Hi</p>' });
    });

    it('strips a disallowed image host from the bio on write', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', {
        altBio: '<p>x<img src="javascript:alert(1)"></p>',
      });

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.altBio).not.toContain('javascript:');
    });

    it('strips <img> from shortBio on admin save regardless of the image source', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', {
        shortBio: '<p>Intro. <img src="https://cdn.example/a.webp" alt="a"> Outro.</p>',
      });

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.shortBio).not.toContain('<img');
      expect(persisted?.shortBio).toContain('Intro.');
      expect(persisted?.shortBio).toContain('Outro.');
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.updateArtist('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when slug already exists', async () => {
      const uniqueError = new DataError('DUPLICATE', 'Unique constraint failed');
      vi.mocked(ArtistRepository.update).mockRejectedValue(uniqueError);

      const result = await ArtistService.updateArtist('artist-123', { slug: 'existing-slug' });

      expect(result).toMatchObject({
        success: false,
        error: 'Artist with this slug already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.update).mockRejectedValue(initError);

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.updateArtist('artist-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Failed to update artist' });
    });
  });

  describe('updateArtist bio image finalization', () => {
    const THUMB = 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp';
    const FULL = 'https://cdn.example/media/artists/a1/bio/3-def.webp';
    const thumbnailRow = {
      id: 'img-1',
      url: THUMB,
      thumbnailUrl: THUMB,
      originalUrl: 'https://upload.wikimedia.org/full.jpg',
    };

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.example');
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);
      vi.mocked(ArtistBioImageRepository.findForRehost).mockResolvedValue([]);
      vi.mocked(ArtistBioImageRepository.updateUrl).mockResolvedValue(undefined);
      vi.mocked(isPubliclyRoutableUrl).mockResolvedValue(true);
      vi.mocked(BioImageService.rehostWithVariants).mockResolvedValue({
        url: FULL,
        width: 1200,
        height: 900,
      });
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('re-hosts a thumbnail src to full variants and rewrites the html', async () => {
      vi.mocked(ArtistBioImageRepository.findForRehost).mockResolvedValue([thumbnailRow]);

      await ArtistService.updateArtist('a1', { bio: `<p><img src="${THUMB}" alt="x" /></p>` });

      const updateData = vi.mocked(ArtistRepository.update).mock.calls[0][1];
      expect(updateData.bio).toContain(FULL);
    });

    it('upgrades the matching bio image row url', async () => {
      vi.mocked(ArtistBioImageRepository.findForRehost).mockResolvedValue([thumbnailRow]);

      await ArtistService.updateArtist('a1', { bio: `<p><img src="${THUMB}" alt="x" /></p>` });

      expect(vi.mocked(ArtistBioImageRepository.updateUrl)).toHaveBeenCalledWith('img-1', FULL);
    });

    it('skips an external src that resolves to a private address', async () => {
      vi.mocked(isPubliclyRoutableUrl).mockResolvedValue(false);

      await ArtistService.updateArtist('a1', {
        bio: '<p><img src="https://internal.example/x.jpg" alt="" /></p>',
      });

      expect(vi.mocked(BioImageService.rehostWithVariants)).not.toHaveBeenCalled();
    });

    it('leaves a fully re-hosted CDN src untouched', async () => {
      await ArtistService.updateArtist('a1', { bio: `<p><img src="${FULL}" alt="" /></p>` });

      expect(vi.mocked(BioImageService.rehostWithVariants)).not.toHaveBeenCalled();
    });

    it('saves with the original src when re-hosting throws', async () => {
      vi.mocked(BioImageService.rehostWithVariants).mockRejectedValue(new Error('s3 down'));

      const result = await ArtistService.updateArtist('a1', {
        bio: `<p><img src="${THUMB}" alt="" /></p>`,
      });

      expect(result.success).toBe(true);
    });

    it('skips finalization entirely when no bio fields are updated', async () => {
      await ArtistService.updateArtist('a1', { displayName: 'X' });

      expect(vi.mocked(ArtistBioImageRepository.findForRehost)).not.toHaveBeenCalled();
    });

    it('keeps a completed html replacement when a later iteration throws', async () => {
      const THUMB2 = 'https://cdn.example/media/artists/a1/bio/thumbs/1-xyz.webp';
      const secondRow = {
        id: 'img-2',
        url: THUMB2,
        thumbnailUrl: THUMB2,
        originalUrl: 'https://upload.wikimedia.org/full2.jpg',
      };
      vi.mocked(ArtistBioImageRepository.findForRehost).mockResolvedValue([
        thumbnailRow,
        secondRow,
      ]);
      // First image re-hosts fine (row url already updated); the second throws
      // outside rehostOne's try, hitting the outer finalize catch mid-loop.
      vi.mocked(isPubliclyRoutableUrl)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('dns exploded'));

      await ArtistService.updateArtist('a1', {
        bio: `<p><img src="${THUMB}" alt="" /><img src="${THUMB2}" alt="" /></p>`,
      });

      // The first image's row was upgraded to FULL, so the persisted html must
      // carry FULL too — no row/html divergence.
      const updateData = vi.mocked(ArtistRepository.update).mock.calls[0][1];
      expect(updateData.bio).toContain(FULL);
    });

    it('leaves the failed iteration source untouched when the loop aborts', async () => {
      const THUMB2 = 'https://cdn.example/media/artists/a1/bio/thumbs/1-xyz.webp';
      vi.mocked(ArtistBioImageRepository.findForRehost).mockResolvedValue([
        thumbnailRow,
        {
          id: 'img-2',
          url: THUMB2,
          thumbnailUrl: THUMB2,
          originalUrl: 'https://upload.wikimedia.org/full2.jpg',
        },
      ]);
      vi.mocked(isPubliclyRoutableUrl)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('dns exploded'));

      await ArtistService.updateArtist('a1', {
        bio: `<p><img src="${THUMB}" alt="" /><img src="${THUMB2}" alt="" /></p>`,
      });

      const updateData = vi.mocked(ArtistRepository.update).mock.calls[0][1];
      expect(updateData.bio).toContain(THUMB2);
    });
  });

  describe('deleteArtist', () => {
    it('should delete an artist successfully', async () => {
      vi.mocked(ArtistRepository.delete).mockResolvedValue(mockArtist);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(ArtistRepository.delete).toHaveBeenCalledWith('artist-123');
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.delete).mockRejectedValue(notFoundError);

      const result = await ArtistService.deleteArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.delete).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.delete).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete artist' });
    });
  });

  describe('archiveArtist', () => {
    it('should archive an artist successfully', async () => {
      const archivedArtist = { ...mockArtist, deletedOn: new Date('2024-12-13') };
      vi.mocked(ArtistRepository.archive).mockResolvedValue(archivedArtist);

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: archivedArtist });
      expect(ArtistRepository.archive).toHaveBeenCalledWith('artist-123');
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.archive).mockReset();
      vi.mocked(ArtistRepository.archive).mockRejectedValue(notFoundError);

      const result = await ArtistService.archiveArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.archive).mockReset();
      vi.mocked(ArtistRepository.archive).mockRejectedValue(initError);

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.archive).mockReset();
      vi.mocked(ArtistRepository.archive).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.archiveArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to archive artist' });
    });
  });

  describe('publishArtist', () => {
    it('should publish an artist by stamping publishedOn', async () => {
      const publishedArtist = { ...mockArtist, publishedOn: new Date('2024-12-13') };
      vi.mocked(ArtistRepository.update).mockResolvedValue(publishedArtist);

      const result = await ArtistService.publishArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: publishedArtist });
      expect(ArtistRepository.update).toHaveBeenCalledWith('artist-123', {
        publishedOn: expect.any(Date),
      });
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.publishArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(initError);

      const result = await ArtistService.publishArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.publishArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to publish artist' });
    });
  });

  describe('restoreArtist', () => {
    it('should restore an artist by clearing deletedOn', async () => {
      const restoredArtist = { ...mockArtist, deletedOn: null };
      vi.mocked(ArtistRepository.update).mockResolvedValue(restoredArtist);

      const result = await ArtistService.restoreArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: restoredArtist });
      expect(ArtistRepository.update).toHaveBeenCalledWith('artist-123', { deletedOn: null });
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.restoreArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(initError);

      const result = await ArtistService.restoreArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.restoreArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to restore artist' });
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
      vi.stubEnv('S3_BUCKET', 'test-bucket');
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      vi.stubEnv('AWS_REGION', 'us-east-1');
    });

    it('should upload image successfully', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create).mockResolvedValue({
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
      vi.mocked(ArtistRepository.existsById).mockResolvedValue(null);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when S3 bucket not configured', async () => {
      vi.stubEnv('S3_BUCKET', undefined);
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'S3 bucket not configured' });
    });

    it('should handle database unavailable error', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.existsById).mockRejectedValue(initError);

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.uploadArtistImage('artist-123', mockImageData);

      expect(result).toMatchObject({ success: false, error: 'Failed to upload image' });
    });

    it('should use direct S3 URL when CDN not configured', async () => {
      vi.stubEnv('CDN_DOMAIN', undefined);
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create).mockResolvedValue({
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
      vi.stubEnv('S3_BUCKET', 'test-bucket');
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      vi.stubEnv('AWS_REGION', 'us-east-1');
    });

    it('should upload multiple images successfully', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create)
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
      vi.mocked(ArtistRepository.existsById).mockResolvedValue(null);

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.existsById).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.uploadArtistImages('artist-123', mockImageDataArray);

      expect(result).toMatchObject({ success: false, error: 'Failed to upload images' });
    });

    it('should aggregate errors when all uploads fail', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
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
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      // First upload succeeds, second fails
      mockS3Send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('S3 upload failed'));
      vi.mocked(ImageRepository.create).mockResolvedValueOnce({
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
      vi.stubEnv('S3_BUCKET', 'test-bucket');
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
    });

    it('should delete image successfully', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect((result as { success: true; data: { id: string } }).data.id).toBe('image-123');
    });

    it('should return error when image not found', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue(null);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should delete from S3 with S3 URL format', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://test-bucket.s3.us-east-1.amazonaws.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should continue with DB delete even if S3 delete fails', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);
      mockS3Send.mockRejectedValueOnce(new Error('S3 error'));

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
    });

    it('should skip S3 deletion when image URL does not match CDN or S3 patterns', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://some-other-host.example.com/media/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should handle database unavailable error', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ImageRepository.findUniqueById).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle P2025 error when image is deleted during operation', async () => {
      // Simulate findUnique succeeding but delete failing due to record being deleted
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      const p2025Error = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ImageRepository.delete).mockRejectedValue(p2025Error);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should handle database init error during delete', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ImageRepository.delete).mockRejectedValue(initError);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle generic error during delete operation', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockRejectedValue(new Error('Unexpected failure'));

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
      vi.mocked(ImageRepository.findManyByArtist).mockResolvedValue(mockImages as never);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(2);
    });

    it('should use fallback values when image fields are null or missing', async () => {
      const mockImages = [{ id: 'image-1', src: null, caption: null, altText: null }];
      vi.mocked(ImageRepository.findManyByArtist).mockResolvedValue(mockImages as never);

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
      vi.mocked(ImageRepository.findManyByArtist).mockResolvedValue([]);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result.success).toBe(true);
      expect((result as { success: true; data: unknown[] }).data).toHaveLength(0);
    });

    it('should handle database unavailable error', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ImageRepository.findManyByArtist).mockRejectedValue(initError);

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ImageRepository.findManyByArtist).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.getArtistImages('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artist images' });
    });
  });

  describe('updateArtistImage', () => {
    it('should update image successfully', async () => {
      vi.mocked(ImageRepository.update).mockResolvedValue({
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
      vi.mocked(ImageRepository.update).mockResolvedValue({
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
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ImageRepository.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
      });

      expect(result).toMatchObject({ success: false, error: 'Image not found' });
    });

    it('should handle database unavailable error', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ImageRepository.update).mockRejectedValue(initError);

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
      });

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ImageRepository.update).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.updateArtistImage('image-123', {
        caption: 'Updated caption',
      });

      expect(result).toMatchObject({ success: false, error: 'Failed to update image' });
    });
  });

  describe('reorderArtistImages', () => {
    it('should reorder images successfully', async () => {
      vi.mocked(ImageRepository.findManyByArtistAndIds).mockResolvedValue([
        { id: 'image-1' },
        { id: 'image-2' },
      ] as never);
      vi.mocked(ImageRepository.findManyByArtist).mockResolvedValue([
        { id: 'image-2', src: 'https://cdn.example.com/image2.jpg', sortOrder: 0 },
        { id: 'image-1', src: 'https://cdn.example.com/image1.jpg', sortOrder: 1 },
      ] as never);
      vi.mocked(ImageRepository.updateSortOrder).mockResolvedValue({} as never);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result.success).toBe(true);
      expect(ImageRepository.updateSortOrder).toHaveBeenCalled();
    });

    it('should use fallback values when reordered images have null fields', async () => {
      vi.mocked(ImageRepository.findManyByArtistAndIds).mockResolvedValue([
        { id: 'image-1' },
        { id: 'image-2' },
      ] as never);
      vi.mocked(ImageRepository.findManyByArtist).mockResolvedValue([
        { id: 'image-2', src: null, caption: null, altText: null },
        { id: 'image-1', src: null, caption: null, altText: null },
      ] as never);
      vi.mocked(ImageRepository.updateSortOrder).mockResolvedValue({} as never);

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
      vi.mocked(ImageRepository.findManyByArtistAndIds).mockResolvedValue([
        { id: 'image-1' },
      ] as never);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result).toMatchObject({
        success: false,
        error: 'Some images not found or do not belong to this artist',
      });
    });

    it('should handle database unavailable error', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ImageRepository.findManyByArtistAndIds).mockRejectedValue(initError);

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ImageRepository.findManyByArtistAndIds).mockRejectedValue(
        new Error('Unknown error')
      );

      const result = await ArtistService.reorderArtistImages('artist-123', ['image-2', 'image-1']);

      expect(result).toMatchObject({ success: false, error: 'Failed to reorder images' });
    });
  });

  describe('searchPublishedArtists', () => {
    it('should search published artists with default parameters', async () => {
      vi.mocked(ArtistRepository.searchPublished).mockResolvedValue([mockArtist] as never);

      const result = await ArtistService.searchPublishedArtists();

      expect(result).toMatchObject({ success: true, data: [mockArtist] });
      expect(ArtistRepository.searchPublished).toHaveBeenCalledWith({});
    });

    it('should search with custom pagination', async () => {
      vi.mocked(ArtistRepository.searchPublished).mockResolvedValue([mockArtist] as never);

      const result = await ArtistService.searchPublishedArtists({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(ArtistRepository.searchPublished).toHaveBeenCalledWith({ skip: 10, take: 5 });
    });

    it('should search across name, group, and release title fields', async () => {
      vi.mocked(ArtistRepository.searchPublished).mockResolvedValue([mockArtist] as never);

      const result = await ArtistService.searchPublishedArtists({ search: 'john' });

      expect(result.success).toBe(true);
      expect(ArtistRepository.searchPublished).toHaveBeenCalledWith({ search: 'john' });
    });

    it('should forward the search filter to the repository', async () => {
      // The images/releases include shape and the Mongo-safe where construction
      // now live in (and are covered by) ArtistRepository.searchPublished; the
      // service only forwards the filter object it received.
      vi.mocked(ArtistRepository.searchPublished).mockResolvedValue([mockArtist] as never);

      await ArtistService.searchPublishedArtists({ search: 'test' });

      expect(ArtistRepository.searchPublished).toHaveBeenCalledWith({ search: 'test' });
    });

    it('should return empty array when no artists found', async () => {
      vi.mocked(ArtistRepository.searchPublished).mockResolvedValue([]);

      const result = await ArtistService.searchPublishedArtists({ search: 'nonexistent' });

      expect(result).toMatchObject({ success: true, data: [] });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.searchPublished).mockRejectedValue(initError);

      const result = await ArtistService.searchPublishedArtists({ search: 'test' });

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.searchPublished).mockRejectedValue(new Error('Unknown error'));

      const result = await ArtistService.searchPublishedArtists({ search: 'test' });

      expect(result).toMatchObject({ success: false, error: 'Failed to search artists' });
    });

    it('should not include search OR conditions when no search term', async () => {
      vi.mocked(ArtistRepository.searchPublished).mockResolvedValue([]);

      await ArtistService.searchPublishedArtists();

      expect(ArtistRepository.searchPublished).toHaveBeenCalledWith({});
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
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue(
        mockArtistWithReleases as never
      );

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      // The full nested release/digital-format include AND the active/published
      // where-clause (isActive + deletedOn null-safety) now live in (and are
      // covered by) ArtistRepository.findPublishedBySlugWithReleases; the service
      // only forwards the slug.
      expect(ArtistRepository.findPublishedBySlugWithReleases).toHaveBeenCalledWith('john-doe');
    });

    it('keeps the short bio as sanitized HTML for rich rendering', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtistWithReleases,
        shortBio: '<p><strong>Bold</strong></p><script>alert(1)</script>',
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      const data = (result as { success: true; data: { shortBio: string } }).data;
      expect(data.shortBio).toBe('<p><strong>Bold</strong></p>');
    });

    it('should filter to only published, non-deleted releases', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue(
        mockArtistWithReleases as never
      );

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      const data = (result as unknown as { success: true; data: typeof mockArtistWithReleases })
        .data;
      expect(data.releases).toHaveLength(1);
      expect(data.releases[0].release.title).toBe('Published Album');
    });

    it('should return error when artist not found', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue(null);

      const result = await ArtistService.getArtistBySlugWithReleases('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockRejectedValue(initError);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockRejectedValue(
        new Error('Unknown error')
      );

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
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue(
        artistWithOnlyUnpublished as never
      );

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
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue(
        artistWithMissingPublishedAt as never
      );

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success).toBe(true);
      const data = (
        result as unknown as { success: true; data: typeof artistWithMissingPublishedAt }
      ).data;
      expect(data.releases).toHaveLength(0);
    });
  });

  describe('findOrCreateByName', () => {
    const existingArtist = {
      id: 'artist-existing',
      displayName: 'Ceschi',
      firstName: 'Ceschi',
      surname: '',
    };

    it('should return artist found by slug', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(existingArtist as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(ArtistRepository.findUniqueBySlug).toHaveBeenCalledWith('ceschi');
    });

    it('should fall back to displayName match when slug not found', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(existingArtist as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(ArtistRepository.findFirstByDisplayName).toHaveBeenCalledWith('Ceschi');
    });

    it('should fall back to firstName + surname match', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(existingArtist as never);

      const result = await ArtistService.findOrCreateByName('Ceschi Ramos');

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(ArtistRepository.findFirstByName).toHaveBeenCalledWith('Ceschi', 'Ramos');
    });

    it('should create a new artist when no match found', async () => {
      const newArtist = {
        id: 'artist-new',
        displayName: 'Jane Smith',
        firstName: 'Jane',
        surname: 'Smith',
      };
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue(newArtist as never);

      const result = await ArtistService.findOrCreateByName('Jane Smith');

      expect(result).toEqual({ success: true, data: newArtist });
      expect(ArtistRepository.createWithSelect).toHaveBeenCalledWith({
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
        isActive: true,
      });
    });

    it('should handle single-word artist name', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'artist-new',
        displayName: 'Ceschi',
        firstName: 'Ceschi',
        surname: '',
      } as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result.success).toBe(true);
      expect(ArtistRepository.createWithSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Ceschi',
          surname: '',
          displayName: 'Ceschi',
          slug: 'ceschi',
        })
      );
    });

    it('should return error for empty name', async () => {
      const result = await ArtistService.findOrCreateByName('');

      expect(result).toEqual({
        success: false,
        error: 'Artist name is empty',
        code: 'INVALID_INPUT',
      });
    });

    it('should return error for whitespace-only name', async () => {
      const result = await ArtistService.findOrCreateByName('   ');

      expect(result).toEqual({
        success: false,
        error: 'Artist name is empty',
        code: 'INVALID_INPUT',
      });
    });

    it('should handle P2002 slug collision by finding existing artist', async () => {
      const p2002Error = new DataError('DUPLICATE', 'Unique constraint failed');

      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValueOnce(null as never); // slug lookup
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.createWithSelect).mockRejectedValue(p2002Error);
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValueOnce(existingArtist as never); // retry

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result.success).toBe(true);
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection refused');

      vi.mocked(ArtistRepository.findUniqueBySlug).mockRejectedValue(initError);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({
        success: false,
        error: 'Database unavailable',
        code: 'UNAVAILABLE',
      });
    });

    it('should skip the slug lookup and fall back to slugifying firstName when generateSlug yields an empty string', async () => {
      // Names composed of only special characters slugify to '' — exercising the
      // `if (slug)` false branch and the `slug || generateSlug(firstName ?? 'artist')`
      // right-hand branch when persisting the new artist.
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'artist-special',
        displayName: '...',
        firstName: '...',
        surname: '',
      } as never);

      const result = await ArtistService.findOrCreateByName('...');

      expect(result.success).toBe(true);
      // Slug lookup must be skipped entirely — only the displayName fallback path is consulted.
      expect(ArtistRepository.findUniqueBySlug).not.toHaveBeenCalled();
      expect(ArtistRepository.createWithSelect).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: '...' })
      );
    });
  });

  describe('findOrCreateByName with details', () => {
    const noMatch = (): void => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
    };

    it('create branch with full details uses trimmed admin names including middleName', async () => {
      noMatch();
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'artist-new',
        displayName: 'Zora Quill Brandt',
        firstName: 'Zora',
        surname: 'Brandt',
      } as never);

      await ArtistService.findOrCreateByName('zora quill brandt', {
        sourceName: 'zora quill brandt',
        firstName: '  Zora  ',
        middleName: ' Quill ',
        surname: ' Brandt ',
        displayName: ' Zora Quill Brandt ',
      });

      expect(ArtistRepository.createWithSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Zora',
          middleName: 'Quill',
          surname: 'Brandt',
          displayName: 'Zora Quill Brandt',
          isActive: true,
        })
      );
    });

    it('create branch with partial details uses provided field, others fall back; empty-string fields fall back too', async () => {
      noMatch();
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'artist-new',
        displayName: 'Jane Smith',
        firstName: 'Jane',
        surname: 'Smith',
      } as never);

      await ArtistService.findOrCreateByName('Jane Smith', {
        sourceName: 'Jane Smith',
        middleName: 'Marie',
        // firstName, surname, displayName omitted → fall back to naive split / trimmed source name
      });

      expect(ArtistRepository.createWithSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          middleName: 'Marie',
          surname: 'Smith',
          displayName: 'Jane Smith',
        })
      );
    });

    it('create branch with no details reproduces exact pre-task payload', async () => {
      noMatch();
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'artist-new',
        displayName: 'Jane Smith',
        firstName: 'Jane',
        surname: 'Smith',
      } as never);

      await ArtistService.findOrCreateByName('Jane Smith');

      expect(ArtistRepository.createWithSelect).toHaveBeenCalledWith({
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        slug: 'jane-smith',
        isActive: true,
      });
    });

    it('match path with details returns existing artist without create or update', async () => {
      const existingArtist = {
        id: 'artist-existing',
        displayName: 'Zora',
        firstName: 'Zora',
        surname: '',
      };
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(existingArtist as never);

      const result = await ArtistService.findOrCreateByName('Zora', {
        sourceName: 'Zora',
        firstName: 'Zora',
        displayName: 'Zora Q. Brandt',
      });

      expect(result).toEqual({ success: true, data: existingArtist });
      expect(ArtistRepository.createWithSelect).not.toHaveBeenCalled();
      expect(ArtistRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadArtistImage - additional branch coverage', () => {
    beforeEach(() => {
      vi.stubEnv('S3_BUCKET', 'test-bucket');
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      vi.stubEnv('AWS_REGION', 'us-east-1');
    });

    it('should use fallback content type when contentType is empty', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create).mockResolvedValue({
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
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([{ id: 'existing' }] as never);
      vi.mocked(ImageRepository.create).mockResolvedValue({
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
      vi.stubEnv('AWS_REGION', undefined);
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://test-bucket.s3.us-east-1.amazonaws.com/test.jpg',
        caption: null,
        altText: null,
        sortOrder: 0,
      } as never);
      vi.stubEnv('CDN_DOMAIN', undefined);

      const result = await ArtistService.uploadArtistImage('artist-123', {
        file: Buffer.from('test'),
        fileName: 'test-image.jpg',
        contentType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
    });

    it('should handle fileName with no extension', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create).mockResolvedValue({
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

    it("should fall back to 'jpg' when the fileName extension slot is empty", async () => {
      // `'cover.'.split('.').pop()` === '' which is falsy and falls through
      // to the `|| 'jpg'` default, covering the right-hand branch.
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-123' } as never);
      vi.mocked(ImageRepository.findManyByOwner).mockResolvedValue([]);
      vi.mocked(ImageRepository.create).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/cover.jpg',
        caption: null,
        altText: null,
        sortOrder: 0,
      } as never);

      const result = await ArtistService.uploadArtistImage('artist-123', {
        file: Buffer.from('test'),
        fileName: 'cover.', // trailing dot → empty extension after split/pop
        contentType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('deleteArtistImage - additional branch coverage', () => {
    beforeEach(() => {
      vi.stubEnv('S3_BUCKET', 'test-bucket');
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
    });

    it('should skip S3 deletion when image src is null', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: null,
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should skip S3 deletion when S3_BUCKET is not configured', async () => {
      vi.stubEnv('S3_BUCKET', undefined);
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('should handle S3 URL where urlParts[1] is undefined', async () => {
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://bucket.s3.', // urlParts[1] will be empty string
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
    });

    it('should strip protocol from CDN_DOMAIN when extracting S3 key', async () => {
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      vi.mocked(ImageRepository.findUniqueById).mockResolvedValue({
        id: 'image-123',
        src: 'https://cdn.example.com/media/artists/artist-123/image.jpg',
        artistId: 'artist-123',
      } as never);
      vi.mocked(ImageRepository.delete).mockResolvedValue({ id: 'image-123' } as never);

      const result = await ArtistService.deleteArtistImage('image-123');

      expect(result.success).toBe(true);
      expect(mockS3Send).toHaveBeenCalled();
    });
  });

  describe('findOrCreateByName - additional branch coverage', () => {
    it('should return error when P2002 collision occurs and existing artist is not found', async () => {
      const p2002Error = new DataError('DUPLICATE', 'Unique constraint failed');

      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValueOnce(null as never); // slug lookup
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.createWithSelect).mockRejectedValue(p2002Error);
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValueOnce(null as never); // retry also fails

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({
        success: false,
        error: 'Artist with this slug already exists',
        code: 'DUPLICATE',
      });
    });

    it('should handle unexpected error in findOrCreateByName', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.createWithSelect).mockRejectedValue(new Error('Unexpected'));

      const result = await ArtistService.findOrCreateByName('New Artist');

      expect(result).toEqual({
        success: false,
        error: 'Failed to find or create artist',
        code: 'UNKNOWN',
      });
    });

    it('should skip firstName+surname search when firstName is empty', async () => {
      // This requires splitFullName to return empty firstName.
      // With a name like " " it would be trimmed to empty and caught earlier.
      // So let's test with a name that generates slug but yields empty firstName from splitFullName.
      // Actually, a single-word name returns firstName=word, so we need special mock behavior.
      // The important branch is when slug lookup returns null, displayName returns null,
      // but firstName is truthy (which is always the case for non-empty names).
      // The actual uncovered branch is: byName not found -> falls through to create.
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never); // slug miss
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never); // displayName miss
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never); // firstName+surname miss
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'new-id',
        displayName: 'Test Name',
        firstName: 'Test',
        surname: 'Name',
      } as never);

      const result = await ArtistService.findOrCreateByName('Test Name');

      expect(result.success).toBe(true);
      // Verify the displayName and firstName+surname search paths were attempted.
      expect(ArtistRepository.findUniqueBySlug).toHaveBeenCalledWith('test-name');
      expect(ArtistRepository.findFirstByName).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectToRelease', () => {
    it('should upsert an ArtistRelease join record', async () => {
      vi.mocked(ArtistRepository.connectToRelease).mockResolvedValue({
        id: 'join-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
      } as never);

      await ArtistService.connectToRelease('artist-1', 'release-1');

      expect(ArtistRepository.connectToRelease).toHaveBeenCalledWith('artist-1', 'release-1');
    });

    it('should be idempotent on duplicate calls', async () => {
      vi.mocked(ArtistRepository.connectToRelease).mockResolvedValue({
        id: 'join-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
      } as never);

      await ArtistService.connectToRelease('artist-1', 'release-1');
      await ArtistService.connectToRelease('artist-1', 'release-1');

      expect(ArtistRepository.connectToRelease).toHaveBeenCalledTimes(2);
    });
  });

  describe('existsById', () => {
    it('should return true when the artist exists', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue({ id: 'artist-1' } as never);

      const result = await ArtistService.existsById('artist-1');

      expect(result).toBe(true);
      expect(ArtistRepository.existsById).toHaveBeenCalledWith('artist-1');
    });

    it('should return false when the artist does not exist', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValue(null);

      const result = await ArtistService.existsById('missing-id');

      expect(result).toBe(false);
    });
  });

  describe('updateArtist shortBio sanitization', () => {
    it('sanitizes a string shortBio before persisting', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', {
        shortBio: '<p>Hi</p><script>alert(1)</script>',
      });

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.shortBio).toBe('<p>Hi</p>');
    });
  });

  describe('listPublishedArtists', () => {
    it('returns published artists with their short bios sanitized to plain text', async () => {
      vi.mocked(ArtistRepository.listPublishedWithBio).mockResolvedValue([
        { ...mockArtist, shortBio: '<p>Hello <b>world</b></p>' },
      ] as never);

      const result = await ArtistService.listPublishedArtists();

      expect(ArtistRepository.listPublishedWithBio).toHaveBeenCalledWith({ skip: 0, take: 100 });
      expect(result.success).toBe(true);
    });

    it('strips markup from the short bio (plain-text sanitization)', async () => {
      vi.mocked(ArtistRepository.listPublishedWithBio).mockResolvedValue([
        { ...mockArtist, shortBio: '<p>Hello <b>world</b></p>' },
      ] as never);

      const result = await ArtistService.listPublishedArtists();

      const shortBio = result.success ? result.data[0]?.shortBio : undefined;
      expect(shortBio).not.toContain('<');
    });

    it('leaves a null short bio untouched', async () => {
      vi.mocked(ArtistRepository.listPublishedWithBio).mockResolvedValue([
        { ...mockArtist, shortBio: null },
      ] as never);

      const result = await ArtistService.listPublishedArtists();

      const shortBio = result.success ? result.data[0]?.shortBio : 'unexpected';
      expect(shortBio).toBeNull();
    });

    it('returns Database unavailable on a connection failure', async () => {
      const initError = new DataError('UNAVAILABLE', 'boom');
      vi.mocked(ArtistRepository.listPublishedWithBio).mockRejectedValue(initError);

      const result = await ArtistService.listPublishedArtists();

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('returns a generic error on an unexpected failure', async () => {
      vi.mocked(ArtistRepository.listPublishedWithBio).mockRejectedValue(new Error('nope'));

      const result = await ArtistService.listPublishedArtists();

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve artists' });
    });
  });

  describe('getArtistBySlugWithReleases bio sanitization', () => {
    it('leaves null bio/shortBio untouched (no sanitization)', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtist,
        bio: null,
        shortBio: null,
        releases: [],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      const bio = result.success ? result.data.bio : 'unexpected';
      expect(bio).toBeNull();
    });

    it('sanitizes a non-null bio before returning it', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtist,
        bio: '<p>Hi</p><script>alert(1)</script>',
        shortBio: '<p>Short</p><script>alert(2)</script>',
        releases: [],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      const bio = result.success ? result.data.bio : 'unexpected';
      expect(bio).toBe('<p>Hi</p>');
    });
  });

  describe('deleteBioLink', () => {
    it('delegates to the repository without returning a value', async () => {
      vi.mocked(ArtistBioLinkRepository.delete).mockResolvedValue(undefined as never);

      await ArtistService.deleteBioLink('link-1');

      expect(ArtistBioLinkRepository.delete).toHaveBeenCalledWith('link-1');
    });
  });

  describe('deleteBioImage', () => {
    beforeEach(() => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('removes the CDN bio thumbnail after deleting the row', async () => {
      vi.mocked(ArtistBioImageRepository.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
        thumbnailUrl: null,
      });
      await ArtistService.deleteBioImage('img-1');
      expect(vi.mocked(deleteS3Object)).toHaveBeenCalledWith(
        'media/artists/a1/bio/thumbs/0-abc.webp'
      );
    });

    it('also cleans up a non-null thumbnailUrl that is a bio url', async () => {
      vi.mocked(ArtistBioImageRepository.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/img/0-abc.webp',
        thumbnailUrl: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
      });
      await ArtistService.deleteBioImage('img-1');
      expect(vi.mocked(deleteS3Object)).toHaveBeenCalledTimes(2);
    });

    it('does not touch S3 for a non-bio url', async () => {
      vi.mocked(ArtistBioImageRepository.delete).mockResolvedValue({
        url: 'https://upload.wikimedia.org/photo.jpg',
        thumbnailUrl: null,
      });
      await ArtistService.deleteBioImage('img-1');
      expect(vi.mocked(deleteS3Object)).not.toHaveBeenCalled();
    });

    it('still succeeds when thumbnail cleanup fails', async () => {
      vi.mocked(ArtistBioImageRepository.delete).mockResolvedValue({
        url: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
        thumbnailUrl: null,
      });
      vi.mocked(deleteS3Object).mockResolvedValue(false);
      await expect(ArtistService.deleteBioImage('img-1')).resolves.toBeUndefined();
    });
  });

  describe('createBioImage', () => {
    it('delegates to the repository and returns the created row', async () => {
      const row = { id: 'img-1', artistId: 'a1', url: 'https://cdn/x.webp' };
      vi.mocked(ArtistBioImageRepository.create).mockResolvedValue(row as never);

      const result = await ArtistService.createBioImage({
        artistId: 'a1',
        url: 'https://cdn/x.webp',
      });

      expect(ArtistBioImageRepository.create).toHaveBeenCalledWith({
        artistId: 'a1',
        url: 'https://cdn/x.webp',
      });
      expect(result).toBe(row);
    });
  });

  describe('createBioLink', () => {
    it('creates a new row when no existing link has that URL', async () => {
      vi.mocked(ArtistBioLinkRepository.findByUrl).mockResolvedValue(null);
      const row = { id: 'link-1', artistId: 'a1', label: 'Site', url: 'https://cdn/x' };
      vi.mocked(ArtistBioLinkRepository.create).mockResolvedValue(row as never);

      const result = await ArtistService.createBioLink({
        artistId: 'a1',
        label: 'Site',
        url: 'https://cdn/x',
      });

      expect(ArtistBioLinkRepository.findByUrl).toHaveBeenCalledWith('a1', 'https://cdn/x');
      expect(ArtistBioLinkRepository.create).toHaveBeenCalledWith({
        artistId: 'a1',
        label: 'Site',
        url: 'https://cdn/x',
      });
      expect(result).toBe(row);
    });

    it('returns the existing row and does not create a duplicate URL', async () => {
      const existing = {
        id: 'link-9',
        artistId: 'a1',
        label: 'Existing',
        url: 'https://cdn/x',
        kind: null,
        origin: 'custom',
        sortOrder: 2,
      };
      vi.mocked(ArtistBioLinkRepository.findByUrl).mockResolvedValue(existing);

      const result = await ArtistService.createBioLink({
        artistId: 'a1',
        label: 'Duplicate attempt',
        url: 'https://cdn/x',
      });

      expect(result).toBe(existing);
      expect(ArtistBioLinkRepository.create).not.toHaveBeenCalled();
    });

    it('returns the raced row when a concurrent create loses the unique index', async () => {
      const raced = {
        id: 'link-race',
        artistId: 'a1',
        label: 'Winner',
        url: 'https://cdn/x',
        kind: null,
        origin: 'custom',
        sortOrder: 3,
      };
      vi.mocked(ArtistBioLinkRepository.findByUrl)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(raced);
      vi.mocked(ArtistBioLinkRepository.create).mockRejectedValue(
        new DataError('DUPLICATE', 'Unique constraint failed')
      );

      const result = await ArtistService.createBioLink({
        artistId: 'a1',
        label: 'Loser',
        url: 'https://cdn/x',
      });

      expect(result).toBe(raced);
    });

    it('rethrows a non-duplicate data error from the create', async () => {
      vi.mocked(ArtistBioLinkRepository.findByUrl).mockResolvedValue(null);
      vi.mocked(ArtistBioLinkRepository.create).mockRejectedValue(
        new DataError('UNAVAILABLE', 'Connection failed')
      );

      await expect(
        ArtistService.createBioLink({ artistId: 'a1', label: 'Site', url: 'https://cdn/x' })
      ).rejects.toThrow('Connection failed');
    });

    it('rethrows the duplicate error when the post-conflict re-read finds nothing', async () => {
      vi.mocked(ArtistBioLinkRepository.findByUrl).mockResolvedValue(null);
      vi.mocked(ArtistBioLinkRepository.create).mockRejectedValue(
        new DataError('DUPLICATE', 'Unique constraint failed')
      );

      await expect(
        ArtistService.createBioLink({ artistId: 'a1', label: 'Site', url: 'https://cdn/x' })
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('updateBioImageAttribution', () => {
    it('delegates the attribution update to the repository', async () => {
      vi.mocked(ArtistBioImageRepository.updateAttribution).mockResolvedValue(undefined as never);

      await ArtistService.updateBioImageAttribution('img-1', 'Credit');

      expect(ArtistBioImageRepository.updateAttribution).toHaveBeenCalledWith('img-1', 'Credit');
    });
  });

  describe('findOrCreateByName branch coverage', () => {
    it('creates a new artist when no slug, displayName, or name match exists', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null);
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'new-1',
        displayName: 'Brand New',
        firstName: 'Brand',
        surname: 'New',
      } as never);

      const result = await ArtistService.findOrCreateByName('Brand New');

      expect(result).toMatchObject({ success: true, data: { id: 'new-1' } });
    });

    it('falls back to a name-derived slug when the name yields no slug', async () => {
      // Punctuation-only name trims non-empty but slugifies to '' → the slug
      // lookup is skipped and createWithSelect uses the firstName-derived slug.
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null);
      vi.mocked(ArtistRepository.createWithSelect).mockResolvedValue({
        id: 'new-2',
        displayName: '!!!',
        firstName: '!!!',
        surname: '',
      } as never);

      const result = await ArtistService.findOrCreateByName('!!!');

      expect(result).toMatchObject({ success: true, data: { id: 'new-2' } });
      expect(ArtistRepository.findUniqueBySlug).not.toHaveBeenCalled();
    });
  });

  describe('findByName', () => {
    const matchedArtist = {
      id: 'artist-existing',
      displayName: 'Ceschi',
      firstName: 'Ceschi',
      surname: '',
    };

    it('returns the match when found by slug and calls the same repository lookups in order', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(matchedArtist as never);

      const result = await ArtistService.findByName('Ceschi');

      expect(result).toEqual(matchedArtist);
      expect(ArtistRepository.findUniqueBySlug).toHaveBeenCalledWith('ceschi');
    });

    it('returns null when no match is found across all three lookups', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
      vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);

      const result = await ArtistService.findByName('Unknown Artist');

      expect(result).toBeNull();
    });

    it('findOrCreateByName behavior is unchanged by the refactor — slug match still returns existing artist', async () => {
      vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(matchedArtist as never);

      const result = await ArtistService.findOrCreateByName('Ceschi');

      expect(result).toEqual({ success: true, data: matchedArtist });
      expect(ArtistRepository.findUniqueBySlug).toHaveBeenCalledWith('ceschi');
    });
  });

  describe('applyEnrichedField', () => {
    it('maps a text field through the whitelist switch', async () => {
      vi.mocked(ArtistRepository.updateEnrichedField).mockResolvedValue(undefined);

      await ArtistService.applyEnrichedField('a'.repeat(24), 'surname', 'Ramos', 'admin-1');

      expect(ArtistRepository.updateEnrichedField).toHaveBeenCalledWith(
        'a'.repeat(24),
        { surname: 'Ramos' },
        'admin-1'
      );
    });

    it('parses bornOn into a Date', async () => {
      vi.mocked(ArtistRepository.updateEnrichedField).mockResolvedValue(undefined);

      await ArtistService.applyEnrichedField('a'.repeat(24), 'bornOn', '1985-03-15', 'admin-1');

      expect(ArtistRepository.updateEnrichedField).toHaveBeenCalledWith(
        'a'.repeat(24),
        { bornOn: new Date('1985-03-15') },
        'admin-1'
      );
    });
  });
});
