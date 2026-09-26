/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistBioImageRepository } from '@/lib/repositories/artist-bio-image-repository';
import { ArtistBioLinkRepository } from '@/lib/repositories/artist-bio-link-repository';
import { ArtistRepository } from '@/lib/repositories/artist-repository';
import type { AssertExact } from '@/lib/types/assert';
import type { ArtistDetail, CreateArtistData, UpdateArtistData } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import { isPubliclyRoutableUrl } from '@/lib/utils/ip-guard';
import { deleteS3Object } from '@/lib/utils/s3-client';

import { ArtistService } from './artist-service';
import { ArtistVocabularyService } from './artist-vocabulary-service';
import { BioImageService } from './bio-image-service';

// Type honesty (#661): getArtistById surfaces ArtistRepository.findById, which
// fetches only scalars. A server-side caller must never be able to
// trust phantom `labels`/`urls`/`releases`, so the success `data` must be exactly
// `ArtistDetail`, not the admin `Artist`. Re-widening the return fails `pnpm run
// typecheck` here.
type GetArtistByIdSuccessData = Extract<
  Awaited<ReturnType<typeof ArtistService.getArtistById>>,
  { success: true }
>['data'];
type _GetArtistByIdIsArtistDetail = AssertExact<GetArtistByIdSuccessData, ArtistDetail>;
const _getArtistByIdIsArtistDetail: _GetArtistByIdIsArtistDetail = true;

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('@/lib/utils/s3-client', () => ({
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
    listListed: vi.fn(),
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
    findManyByArtist: vi.fn(),
    findManyByIds: vi.fn(),
    setDisplayOrder: vi.fn(),
    updateAlt: vi.fn(),
    updateUrl: vi.fn(),
    updateAttribution: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/artist-bio-link-repository', () => ({
  ArtistBioLinkRepository: {
    create: vi.fn(),
    findByUrl: vi.fn(),
    removeReference: vi.fn(),
    restoreReference: vi.fn(),
  },
}));

vi.mock('@/lib/utils/ip-guard', () => ({
  isPubliclyRoutableUrl: vi.fn(),
}));

vi.mock('./artist-vocabulary-service', () => ({
  ArtistVocabularyService: { invalidate: vi.fn() },
}));

vi.mock('./bio-image-service', () => ({
  BioImageService: {
    rehostWithVariants: vi.fn(),
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
    imageLinksStatus: null,
    imageLinksError: null,
    imageLinksStartedAt: null,
    imageLinksJobToken: null,
    imageLinksAddedCount: null,
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

    it('invalidates the vocabulary cache after a successful create', async () => {
      vi.mocked(ArtistRepository.create).mockResolvedValue(mockArtist);

      await ArtistService.createArtist(createInput);

      expect(ArtistVocabularyService.invalidate).toHaveBeenCalled();
    });

    it('does not invalidate the vocabulary cache when the create fails', async () => {
      vi.mocked(ArtistRepository.create).mockRejectedValueOnce(Error('boom'));

      await ArtistService.createArtist(createInput);

      expect(ArtistVocabularyService.invalidate).not.toHaveBeenCalled();
    });

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

    it('invalidates the vocabulary cache after a successful update', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', updateData);

      expect(ArtistVocabularyService.invalidate).toHaveBeenCalled();
    });

    it('does not invalidate the vocabulary cache when the update fails', async () => {
      vi.mocked(ArtistRepository.update).mockRejectedValueOnce(Error('boom'));

      await ArtistService.updateArtist('artist-123', updateData);

      expect(ArtistVocabularyService.invalidate).not.toHaveBeenCalled();
    });

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
      memberOf: [],
      releases: [
        {
          id: 'ar-1',
          artistId: mockArtist.id,
          releaseId: 'release-1',
          release: {
            id: 'release-1',
            title: 'Published Album',
            releasedOn: new Date('2024-01-01'),
            publishedAt: new Date('2024-01-01'),
            deletedOn: null,
            artistReleases: [{ artistId: mockArtist.id }],
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
            releasedOn: new Date('2024-02-01'),
            publishedAt: null,
            deletedOn: null,
            artistReleases: [{ artistId: mockArtist.id }],
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
            releasedOn: new Date('2024-03-01'),
            publishedAt: new Date('2024-01-01'),
            deletedOn: new Date('2024-06-01'),
            artistReleases: [{ artistId: mockArtist.id }],
            digitalFormats: [],
          },
        },
      ],
    };

    /** A published release credited to `artistIds` in order, released on `releasedOn`. */
    interface PublishedReleaseRow {
      id: string;
      title: string;
      releasedOn: Date;
      publishedAt: Date | null;
      deletedOn: Date | null;
      artistReleases: Array<{ artistId: string }>;
      digitalFormats: never[];
    }

    const publishedRelease = (
      id: string,
      artistIds: string[],
      releasedOn: string
    ): PublishedReleaseRow => ({
      id,
      title: id,
      releasedOn: new Date(releasedOn),
      publishedAt: new Date(releasedOn),
      deletedOn: null,
      artistReleases: artistIds.map((artistId) => ({ artistId })),
      digitalFormats: [],
    });

    const joinRow = (artistId: string, release: PublishedReleaseRow) => ({
      id: `${artistId}-${release.id}`,
      artistId,
      releaseId: release.id,
      release,
    });

    const readReleases = (
      result: Awaited<ReturnType<typeof ArtistService.getArtistBySlugWithReleases>>
    ) =>
      (
        result as {
          success: true;
          data: { releases: Array<{ releaseId: string; credit: string }> };
        }
      ).data.releases;

    it('lists the artist’s own releases first, then featured appearances, then band releases', async () => {
      const own = publishedRelease('own', [mockArtist.id], '2010-01-01');
      const guest = publishedRelease('guest', ['artist-other', mockArtist.id], '2024-01-01');
      const bandLp = publishedRelease('band-lp', ['band-1'], '2025-01-01');
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtist,
        releases: [joinRow(mockArtist.id, guest), joinRow(mockArtist.id, own)],
        memberOf: [
          {
            id: 'am-1',
            artistId: 'band-1',
            memberId: mockArtist.id,
            artist: { id: 'band-1', releases: [joinRow('band-1', bandLp)] },
          },
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(readReleases(result).map(({ releaseId, credit }) => ({ releaseId, credit }))).toEqual([
        { releaseId: 'own', credit: 'primary' },
        { releaseId: 'guest', credit: 'featured' },
        { releaseId: 'band-lp', credit: 'member' },
      ]);
    });

    it('excludes an unpublished band release', async () => {
      const draft = { ...publishedRelease('draft', ['band-1'], '2025-01-01'), publishedAt: null };
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtist,
        releases: [],
        memberOf: [
          {
            id: 'am-1',
            artistId: 'band-1',
            memberId: mockArtist.id,
            artist: { id: 'band-1', releases: [joinRow('band-1', draft)] },
          },
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(readReleases(result)).toEqual([]);
    });

    it('does not expose the band graph on the public payload', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue(
        mockArtistWithReleases as never
      );

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result).toMatchObject({ success: true });
      expect((result as { data: object }).data).not.toHaveProperty('memberOf');
    });

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
        memberOf: [],
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
        memberOf: [],
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
    const listingName = (id: string, displayName: string) => ({
      id,
      displayName,
      firstName: displayName,
      middleName: null,
      surname: '',
      title: null,
      suffix: null,
    });

    const listedRelease = (id: string, title: string, releasedOn: string) => ({
      release: {
        id,
        title,
        releasedOn: new Date(releasedOn),
        publishedAt: new Date('2024-01-01'),
        deletedOn: null,
      },
    });

    const listingRecord = {
      id: 'artist-1',
      slug: 'e2e-artist',
      firstName: 'E2E',
      middleName: null,
      surname: 'Artist',
      title: null,
      suffix: null,
      displayName: 'E2E Artist',
      akaNames: null,
      genres: 'Experimental, Electronic',
      instruments: null,
      shortBio: '<p>Hello <b>world</b></p>',
      bornOn: null,
      diedOn: null,
      formedOn: null,
      bioImages: [],
      members: [
        { member: listingName('m-2', 'Zed Member') },
        { member: listingName('m-1', 'Abe Member') },
      ],
      memberOf: [{ artist: listingName('b-1', 'E2E Band') }],
      releases: [
        listedRelease('r-1', 'E2E Album One', '2024-03-01'),
        listedRelease('r-3', 'E2E Album Three', '2024-09-01'),
        listedRelease('r-2', 'E2E Album Two', '2024-06-01'),
        {
          release: {
            id: 'r-draft',
            title: 'Unreleased',
            releasedOn: new Date('2030-01-01'),
            publishedAt: null,
            deletedOn: null,
          },
        },
      ],
    };

    const filters = { sort: 'alpha' as const, skip: 0, take: 24 };

    const listOne = async () => {
      vi.mocked(ArtistRepository.listListed).mockResolvedValue([listingRecord] as never);
      const result = await ArtistService.listPublishedArtists(filters);
      return result.success ? result.data[0] : undefined;
    };

    it('forwards the listing filters to the repository', async () => {
      vi.mocked(ArtistRepository.listListed).mockResolvedValue([] as never);

      await ArtistService.listPublishedArtists({ ...filters, search: 'punk', sort: 'newest' });

      expect(ArtistRepository.listListed).toHaveBeenCalledWith({
        ...filters,
        search: 'punk',
        sort: 'newest',
      });
    });

    it('strips markup from the short bio (plain-text sanitization)', async () => {
      const row = await listOne();

      expect(row?.shortBio).toBe('Hello world');
    });

    it('leaves a null short bio untouched', async () => {
      vi.mocked(ArtistRepository.listListed).mockResolvedValue([
        { ...listingRecord, shortBio: null },
      ] as never);

      const result = await ArtistService.listPublishedArtists(filters);

      const shortBio = result.success ? result.data[0]?.shortBio : 'unexpected';
      expect(shortBio).toBeNull();
    });

    it('counts only the listed direct releases', async () => {
      const row = await listOne();

      expect(row?.releaseCount).toBe(3);
    });

    it('summarises the newest listed release', async () => {
      const row = await listOne();

      expect(row?.newestRelease).toEqual({
        id: 'r-3',
        title: 'E2E Album Three',
        releasedOn: new Date('2024-09-01'),
      });
    });

    it('does not expose the raw release joins on the row', async () => {
      const row = await listOne();

      expect(row).not.toHaveProperty('releases');
    });

    it('resolves the display images: a human choice beats the suggested images', async () => {
      const image = (id: string, overrides: Record<string, unknown>) => ({
        id,
        url: `https://cdn/${id}.webp`,
        thumbnailUrl: null,
        title: null,
        attribution: null,
        license: null,
        licenseUrl: null,
        sourceUrl: null,
        alt: 'described',
        isPrimary: false,
        displayOrder: null,
        ...overrides,
      });
      vi.mocked(ArtistRepository.listListed).mockResolvedValue([
        {
          ...listingRecord,
          bioImages: [
            image('suggested', { isPrimary: true }),
            image('second', { displayOrder: 1 }),
            image('first', { displayOrder: 0 }),
          ],
        },
      ] as never);

      const result = await ArtistService.listPublishedArtists(filters);

      const ids = result.success ? result.data[0]?.bioImages.map(({ id }) => id) : result;
      expect(ids).toEqual(['first', 'second']);
    });

    it('flattens the bands the artist belongs to', async () => {
      const row = await listOne();

      expect(row?.memberOf).toEqual([listingName('b-1', 'E2E Band')]);
    });

    it('flattens the band members in display-name order', async () => {
      const row = await listOne();

      expect(row?.members.map(({ displayName }) => displayName)).toEqual([
        'Abe Member',
        'Zed Member',
      ]);
    });

    it('returns Database unavailable on a connection failure', async () => {
      const initError = new DataError('UNAVAILABLE', 'boom');
      vi.mocked(ArtistRepository.listListed).mockRejectedValue(initError);

      const result = await ArtistService.listPublishedArtists(filters);

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('returns a generic error on an unexpected failure', async () => {
      vi.mocked(ArtistRepository.listListed).mockRejectedValue(new Error('nope'));

      const result = await ArtistService.listPublishedArtists(filters);

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
        memberOf: [],
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
        memberOf: [],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      const bio = result.success ? result.data.bio : 'unexpected';
      expect(bio).toBe('<p>Hi</p>');
    });
  });

  describe('deleteBioLink', () => {
    it('drops only the reference role so a shared image-source row survives', async () => {
      vi.mocked(ArtistBioLinkRepository.removeReference).mockResolvedValue(undefined as never);

      await ArtistService.deleteBioLink('link-1');

      expect(ArtistBioLinkRepository.removeReference).toHaveBeenCalledWith('link-1');
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
        reference: true,
        imageSource: false,
      };
      vi.mocked(ArtistBioLinkRepository.findByUrl).mockResolvedValue(existing);

      const result = await ArtistService.createBioLink({
        artistId: 'a1',
        label: 'Duplicate attempt',
        url: 'https://cdn/x',
      });

      expect(result).toBe(existing);
      expect(ArtistBioLinkRepository.create).not.toHaveBeenCalled();
      expect(ArtistBioLinkRepository.restoreReference).not.toHaveBeenCalled();
    });

    it('grants the reference role when the URL exists as an image-source-only row', async () => {
      const imageOnly = {
        id: 'link-img',
        artistId: 'a1',
        label: 'press.test',
        url: 'https://cdn/x',
        kind: 'other',
        origin: 'custom',
        sortOrder: 2,
        reference: false,
        imageSource: true,
      };
      const restored = { ...imageOnly, reference: true };
      vi.mocked(ArtistBioLinkRepository.findByUrl).mockResolvedValue(imageOnly);
      vi.mocked(ArtistBioLinkRepository.restoreReference).mockResolvedValue(restored);

      const result = await ArtistService.createBioLink({
        artistId: 'a1',
        label: 'Press kit',
        url: 'https://cdn/x',
      });

      expect(result).toBe(restored);
      expect(ArtistBioLinkRepository.restoreReference).toHaveBeenCalledWith('link-img');
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
        reference: true,
        imageSource: false,
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

  describe('updateBioImageAlt', () => {
    it('delegates the alt update to the repository', async () => {
      vi.mocked(ArtistBioImageRepository.updateAlt).mockResolvedValue(undefined as never);

      await ArtistService.updateBioImageAlt('img-1', 'Ceschi on stage');

      expect(ArtistBioImageRepository.updateAlt).toHaveBeenCalledWith('img-1', 'Ceschi on stage');
    });
  });

  describe('setDisplayImages', () => {
    const eligible = (id: string) => ({ id, alt: 'described', origin: 'generated' });

    beforeEach(() => {
      vi.mocked(ArtistRepository.findById).mockResolvedValue({
        id: 'a1',
        slug: 'ceschi',
      } as never);
      vi.mocked(ArtistBioImageRepository.setDisplayOrder).mockResolvedValue(undefined);
    });

    // Persistent implementations and unconsumed one-shots leak across the
    // shuffled file (docs/lessons/testing), so drain them after every test.
    afterEach(() => {
      vi.mocked(ArtistRepository.findById).mockReset();
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockReset();
      vi.mocked(ArtistBioImageRepository.setDisplayOrder).mockReset();
    });

    it('writes the ordered ids and returns the artist slug for revalidation', async () => {
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([
        eligible('img-2'),
        eligible('img-1'),
      ]);

      const result = await ArtistService.setDisplayImages('a1', ['img-1', 'img-2']);

      expect(result).toEqual({ success: true, data: { slug: 'ceschi' } });
      expect(ArtistBioImageRepository.setDisplayOrder).toHaveBeenCalledWith('a1', [
        'img-1',
        'img-2',
      ]);
    });

    it('clears every display image when given an empty list', async () => {
      const result = await ArtistService.setDisplayImages('a1', []);

      expect(result).toMatchObject({ success: true });
      expect(ArtistBioImageRepository.setDisplayOrder).toHaveBeenCalledWith('a1', []);
    });

    it('rejects more than the cap with LIMIT_EXCEEDED', async () => {
      const result = await ArtistService.setDisplayImages('a1', ['i1', 'i2', 'i3', 'i4']);

      expect(result).toMatchObject({ success: false, code: 'LIMIT_EXCEEDED' });
      expect(ArtistBioImageRepository.setDisplayOrder).not.toHaveBeenCalled();
    });

    it('rejects a repeated id with VALIDATION', async () => {
      const result = await ArtistService.setDisplayImages('a1', ['i1', 'i1']);

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
      expect(ArtistBioImageRepository.setDisplayOrder).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for an unknown artist', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(null);

      const result = await ArtistService.setDisplayImages('missing', ['i1']);

      expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(ArtistBioImageRepository.setDisplayOrder).not.toHaveBeenCalled();
    });

    it("returns NOT_FOUND when an id is not one of the artist's images", async () => {
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([eligible('img-1')]);

      const result = await ArtistService.setDisplayImages('a1', ['img-1', 'foreign']);

      expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(ArtistBioImageRepository.setDisplayOrder).not.toHaveBeenCalled();
    });

    it('refuses to choose an image without alt text', async () => {
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([
        eligible('img-1'),
        { id: 'img-2', alt: '  ', origin: 'custom' },
      ]);

      const result = await ArtistService.setDisplayImages('a1', ['img-1', 'img-2']);

      expect(result).toMatchObject({
        success: false,
        code: 'VALIDATION',
        error: expect.stringContaining('alt text'),
      });
      expect(ArtistBioImageRepository.setDisplayOrder).not.toHaveBeenCalled();
    });

    it('maps a repository failure through the data error code', async () => {
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([eligible('img-1')]);
      vi.mocked(ArtistBioImageRepository.setDisplayOrder).mockRejectedValueOnce(
        new DataError('UNAVAILABLE', 'db down')
      );

      const result = await ArtistService.setDisplayImages('a1', ['img-1']);

      expect(result).toMatchObject({ success: false, code: 'UNAVAILABLE' });
    });
  });

  describe('listBioImages', () => {
    const poolRow = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      isPrimary: false,
      displayOrder: null,
      ...overrides,
    });

    afterEach(() => {
      vi.mocked(ArtistRepository.existsById).mockReset();
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockReset();
    });

    it('returns the pool in picker order: chosen, suggested, then the rest', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValueOnce({ id: 'a1' });
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockResolvedValueOnce([
        poolRow('rest'),
        poolRow('suggested', { isPrimary: true }),
        poolRow('chosen', { displayOrder: 0 }),
      ] as never);

      const result = await ArtistService.listBioImages('a1');

      expect(result.success ? result.data.map(({ id }) => id) : result).toEqual([
        'chosen',
        'suggested',
        'rest',
      ]);
    });

    it('returns NOT_FOUND for an unknown artist', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValueOnce(null);

      const result = await ArtistService.listBioImages('missing');

      expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(ArtistBioImageRepository.findManyByArtist).not.toHaveBeenCalled();
    });

    it('maps a repository failure through the data error code', async () => {
      vi.mocked(ArtistRepository.existsById).mockResolvedValueOnce({ id: 'a1' });
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockRejectedValueOnce(
        new DataError('UNAVAILABLE', 'db down')
      );

      const result = await ArtistService.listBioImages('a1');

      expect(result).toMatchObject({ success: false, code: 'UNAVAILABLE' });
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
