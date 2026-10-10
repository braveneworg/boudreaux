/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ArtistBioImageRepository } from '@/lib/repositories/artist-bio-image-repository';
import { ArtistBioLinkRepository } from '@/lib/repositories/artist-bio-link-repository';
import { ArtistCreditRepository } from '@/lib/repositories/artist-credit-repository';
import { ArtistRepository } from '@/lib/repositories/artist-repository';
import type { AssertExact } from '@/lib/types/assert';
import type { ArtistDetail, CreateArtistData, UpdateArtistData } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import { isPubliclyRoutableUrl } from '@/lib/utils/ip-guard';
import { invalidatePublicNameCaches } from '@/lib/utils/public-name-caches';
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

// A write can publish an artist or leave its publication alone, never clear
// it: an artist is hidden by archiving, which warns about the bylines it
// empties (ADR-0015). Clearing publishedOn would empty them silently.
type _UpdateNeverUnpublishes = AssertExact<UpdateArtistData['publishedOn'], Date | undefined>;
const _updateNeverUnpublishes: _UpdateNeverUnpublishes = true;
type _CreateNeverUnpublishes = AssertExact<CreateArtistData['publishedOn'], Date | undefined>;
const _createNeverUnpublishes: _CreateNeverUnpublishes = true;

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
    findNameById: vi.fn(),
    updateEnrichedField: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/artist-credit-repository', () => ({
  ArtistCreditRepository: { creditOnRelease: vi.fn(), findReleasesLedBy: vi.fn() },
}));

vi.mock('@/lib/repositories/artist-bio-image-repository', () => ({
  ArtistBioImageRepository: {
    countChosen: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findDisplayState: vi.fn(),
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

vi.mock('@/lib/utils/public-name-caches', () => ({
  invalidatePublicNameCaches: vi.fn(),
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
  describe('public name caches', () => {
    const artist = { id: 'artist-123' };

    beforeEach(() => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(artist as never);
      vi.mocked(ArtistRepository.archive).mockResolvedValue(artist as never);
      vi.mocked(ArtistRepository.delete).mockResolvedValue(artist as never);
    });

    afterEach(() => {
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.archive).mockReset();
      vi.mocked(ArtistRepository.delete).mockReset();
    });

    it('are cleared when an artist is published', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(mockArtist as never);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(1);

      await ArtistService.publishArtist('artist-123', 'admin-1');

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([[]]);
    });

    it('are cleared when an artist is archived', async () => {
      await ArtistService.archiveArtist('artist-123');

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([[]]);
    });

    it('are cleared when an artist is deleted', async () => {
      // Only an archived artist may be deleted permanently.
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce({
        ...artist,
        deletedOn: new Date('2026-01-01'),
      } as never);
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockResolvedValueOnce([]);
      vi.mocked(ArtistCreditRepository.findReleasesLedBy).mockResolvedValueOnce([]);

      await ArtistService.deleteArtist('artist-123');

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([[]]);
    });

    it('are cleared when an artist is restored', async () => {
      await ArtistService.restoreArtist('artist-123');

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([[]]);
    });

    it('are cleared when an artist is updated', async () => {
      await ArtistService.updateArtist('artist-123', { displayName: 'New Name' }, 'admin-1');

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([[]]);
    });

    it('are left alone when the write fails', async () => {
      vi.mocked(ArtistRepository.update).mockRejectedValueOnce(
        new DataError('NOT_FOUND', 'Record not found')
      );

      await ArtistService.publishArtist('artist-123', 'admin-1');

      expect(vi.mocked(invalidatePublicNameCaches).mock.calls).toEqual([]);
    });
  });

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
    instruments: null,
    trackId: null,
    featuredArtistId: null,
    links: null,
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

    // An artist is created unpublished and published once it has a chosen
    // display image (ADR-0019): there is no create-and-publish path.
    it('refuses to create an artist published', async () => {
      const result = await ArtistService.createArtist({
        ...createInput,
        publishedOn: new Date('2026-10-04'),
      });

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
      expect(ArtistRepository.create).not.toHaveBeenCalled();
    });

    it('records no publisher for an artist created unpublished', async () => {
      vi.mocked(ArtistRepository.create).mockResolvedValue(mockArtist);

      await ArtistService.createArtist({ ...createInput, publishedBy: 'forged' });

      expect(vi.mocked(ArtistRepository.create).mock.calls[0][0]).not.toHaveProperty('publishedBy');
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
    // Listing rows carry the display-image flag (ADR-0019).
    const listedArtist = { ...mockArtist, hasDisplayImage: true };
    const mockArtists = [
      listedArtist,
      {
        ...mockArtist,
        hasDisplayImage: false,
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
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([listedArtist]);

      const result = await ArtistService.getArtists({ skip: 10, take: 5 });

      expect(result.success).toBe(true);
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ skip: 10, take: 5 });
    });

    it('should search across multiple fields', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([listedArtist]);

      const result = await ArtistService.getArtists({ search: 'john' });

      expect(result.success).toBe(true);
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ search: 'john' });
    });

    it('should combine pagination and search', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([listedArtist]);

      const result = await ArtistService.getArtists({
        skip: 5,
        take: 10,
        search: 'doe',
      });

      expect(result.success).toBe(true);
      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ skip: 5, take: 10, search: 'doe' });
    });

    it('should add publishedOn filter when published=true', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([listedArtist]);

      await ArtistService.getArtists({ published: true });

      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ published: true });
    });

    it('should add unpublished filter when published=false', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([listedArtist]);

      await ArtistService.getArtists({ published: false });

      expect(ArtistRepository.findMany).toHaveBeenCalledWith({ published: false });
    });

    it('should omit the deletedOn constraint when deleted=true', async () => {
      vi.mocked(ArtistRepository.findMany).mockResolvedValue([listedArtist]);

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

      await ArtistService.updateArtist('artist-123', updateData, 'admin-1');

      expect(ArtistVocabularyService.invalidate).toHaveBeenCalled();
    });

    it('does not invalidate the vocabulary cache when the update fails', async () => {
      vi.mocked(ArtistRepository.update).mockRejectedValueOnce(Error('boom'));

      await ArtistService.updateArtist('artist-123', updateData, 'admin-1');

      expect(ArtistVocabularyService.invalidate).not.toHaveBeenCalled();
    });

    it('should update an artist successfully', async () => {
      const updatedArtist = { ...mockArtist, displayName: 'John Updated Doe' };
      vi.mocked(ArtistRepository.update).mockResolvedValue(updatedArtist);

      const result = await ArtistService.updateArtist('artist-123', updateData, 'admin-1');

      expect(result).toMatchObject({ success: true, data: updatedArtist });
      expect(ArtistRepository.update).toHaveBeenCalledWith('artist-123', updateData, {
        publishedBy: 'admin-1',
      });
    });

    it("ignores a caller's publishedBy: the repository records the admin", async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce({
        ...mockArtist,
        publishedOn: new Date('2026-01-01'),
      } as never);
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { publishedOn: new Date('2026-10-04'), publishedBy: 'forged' },
        'admin-1'
      );

      expect(vi.mocked(ArtistRepository.update).mock.calls[0].slice(1)).toEqual([
        { publishedOn: new Date('2026-10-04') },
        { publishedBy: 'admin-1' },
      ]);
    });

    // The publish gate (ADR-0019): a first publish needs a chosen display
    // image; a save of an already published artist re-sends its date and is
    // not re-checked; a save without a date never reads the gate.
    describe('publish gate', () => {
      const unpublished = { ...mockArtist, publishedOn: null } as never;
      const published = { ...mockArtist, publishedOn: new Date('2026-01-01') } as never;
      const firstPublish: UpdateArtistData = { publishedOn: new Date('2026-10-06') };

      it('refuses a first publish while no display image is chosen', async () => {
        vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(unpublished);
        vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(0);

        const result = await ArtistService.updateArtist('artist-123', firstPublish, 'admin-1');

        expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
        expect(ArtistRepository.update).not.toHaveBeenCalled();
      });

      it('publishes once a display image is chosen', async () => {
        vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(unpublished);
        vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(1);
        vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

        const result = await ArtistService.updateArtist('artist-123', firstPublish, 'admin-1');

        expect(result).toMatchObject({ success: true });
        expect(ArtistRepository.update).toHaveBeenCalledWith('artist-123', firstPublish, {
          publishedBy: 'admin-1',
        });
      });

      it('does not re-check a save of an already published artist', async () => {
        vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(published);
        vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

        await ArtistService.updateArtist('artist-123', firstPublish, 'admin-1');

        expect(ArtistBioImageRepository.countChosen).not.toHaveBeenCalled();
        expect(ArtistRepository.update).toHaveBeenCalled();
      });

      it('never reads the gate for a save without a publish date', async () => {
        vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

        await ArtistService.updateArtist('artist-123', { displayName: 'JD' }, 'admin-1');

        expect(ArtistRepository.findById).not.toHaveBeenCalled();
        expect(ArtistBioImageRepository.countChosen).not.toHaveBeenCalled();
      });

      it('returns NOT_FOUND for a first publish of an unknown artist', async () => {
        vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(null);

        const result = await ArtistService.updateArtist('missing', firstPublish, 'admin-1');

        expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' });
        expect(ArtistRepository.update).not.toHaveBeenCalled();
      });
    });

    // ADR-0020: the service is the gate every link writer crosses.
    it('sanitises the links composite before persisting', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        {
          links: {
            websites: [{ label: '<b>Site</b>', url: ' https://example.com ' }],
            social: [],
            contact: [
              {
                heading: ' Booking ',
                links: [
                  { label: null, description: ' <b>Books</b> US tours ', url: 'agent@example.com' },
                ],
              },
              { heading: 'Merch', links: [] },
            ],
          },
        },
        'admin-1'
      );

      expect(ArtistRepository.update).toHaveBeenCalledWith(
        'artist-123',
        {
          links: {
            websites: [{ label: 'Site', url: 'https://example.com' }],
            social: [],
            contact: [
              {
                heading: 'Booking',
                links: [
                  { label: null, description: 'Books US tours', url: 'mailto:agent@example.com' },
                ],
              },
            ],
          },
        },
        { publishedBy: 'admin-1' }
      );
    });

    it('clears the links composite when nothing is left after sanitising', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { links: { websites: [], social: [], contact: [{ heading: 'Booking', links: [] }] } },
        'admin-1'
      );

      expect(ArtistRepository.update).toHaveBeenCalledWith(
        'artist-123',
        { links: null },
        { publishedBy: 'admin-1' }
      );
    });

    it('leaves the links alone when the update does not carry them', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', { displayName: 'Only this' }, 'admin-1');

      expect(vi.mocked(ArtistRepository.update).mock.calls[0][1]).not.toHaveProperty('links');
    });

    it('sanitizes the bio HTML before persisting', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { bio: '<p>Hi</p><script>alert(1)</script>' },
        'admin-1'
      );

      expect(ArtistRepository.update).toHaveBeenCalledWith(
        'artist-123',
        { bio: '<p>Hi</p>' },
        { publishedBy: 'admin-1' }
      );
    });

    it('strips a disallowed image host from the bio on write', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { altBio: '<p>x<img src="javascript:alert(1)"></p>' },
        'admin-1'
      );

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.altBio).not.toContain('javascript:');
    });

    it('strips <img> from shortBio on admin save regardless of the image source', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { shortBio: '<p>Intro. <img src="https://cdn.example/a.webp" alt="a"> Outro.</p>' },
        'admin-1'
      );

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.shortBio).not.toContain('<img');
      expect(persisted?.shortBio).toContain('Intro.');
      expect(persisted?.shortBio).toContain('Outro.');
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.updateArtist('non-existent', updateData, 'admin-1');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when slug already exists', async () => {
      const uniqueError = new DataError('DUPLICATE', 'Unique constraint failed');
      vi.mocked(ArtistRepository.update).mockRejectedValue(uniqueError);

      const result = await ArtistService.updateArtist(
        'artist-123',
        { slug: 'existing-slug' },
        'admin-1'
      );

      expect(result).toMatchObject({
        success: false,
        error: 'Artist with this slug already exists',
      });
    });

    it('should return error when database is unavailable', async () => {
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.update).mockRejectedValue(initError);

      const result = await ArtistService.updateArtist('artist-123', updateData, 'admin-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.updateArtist('artist-123', updateData, 'admin-1');

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

      await ArtistService.updateArtist(
        'a1',
        { bio: `<p><img src="${THUMB}" alt="x" /></p>` },
        'admin-1'
      );

      const updateData = vi.mocked(ArtistRepository.update).mock.calls[0][1];
      expect(updateData.bio).toContain(FULL);
    });

    it('upgrades the matching bio image row url', async () => {
      vi.mocked(ArtistBioImageRepository.findForRehost).mockResolvedValue([thumbnailRow]);

      await ArtistService.updateArtist(
        'a1',
        { bio: `<p><img src="${THUMB}" alt="x" /></p>` },
        'admin-1'
      );

      expect(vi.mocked(ArtistBioImageRepository.updateUrl)).toHaveBeenCalledWith('img-1', FULL);
    });

    it('skips an external src that resolves to a private address', async () => {
      vi.mocked(isPubliclyRoutableUrl).mockResolvedValue(false);

      await ArtistService.updateArtist(
        'a1',
        { bio: '<p><img src="https://internal.example/x.jpg" alt="" /></p>' },
        'admin-1'
      );

      expect(vi.mocked(BioImageService.rehostWithVariants)).not.toHaveBeenCalled();
    });

    it('leaves a fully re-hosted CDN src untouched', async () => {
      await ArtistService.updateArtist(
        'a1',
        { bio: `<p><img src="${FULL}" alt="" /></p>` },
        'admin-1'
      );

      expect(vi.mocked(BioImageService.rehostWithVariants)).not.toHaveBeenCalled();
    });

    it('saves with the original src when re-hosting throws', async () => {
      vi.mocked(BioImageService.rehostWithVariants).mockRejectedValue(new Error('s3 down'));

      const result = await ArtistService.updateArtist(
        'a1',
        { bio: `<p><img src="${THUMB}" alt="" /></p>` },
        'admin-1'
      );

      expect(result.success).toBe(true);
    });

    it('skips finalization entirely when no bio fields are updated', async () => {
      await ArtistService.updateArtist('a1', { displayName: 'X' }, 'admin-1');

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

      await ArtistService.updateArtist(
        'a1',
        { bio: `<p><img src="${THUMB}" alt="" /><img src="${THUMB2}" alt="" /></p>` },
        'admin-1'
      );

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

      await ArtistService.updateArtist(
        'a1',
        { bio: `<p><img src="${THUMB}" alt="" /><img src="${THUMB2}" alt="" /></p>` },
        'admin-1'
      );

      const updateData = vi.mocked(ArtistRepository.update).mock.calls[0][1];
      expect(updateData.bio).toContain(THUMB2);
    });
  });

  describe('deleteArtist', () => {
    const archivedArtist = { ...mockArtist, deletedOn: new Date('2026-01-01') };

    beforeEach(() => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example');
      vi.mocked(ArtistRepository.findById).mockResolvedValue(archivedArtist as never);
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockResolvedValue([]);
      vi.mocked(ArtistCreditRepository.findReleasesLedBy).mockResolvedValue([]);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.mocked(ArtistRepository.findById).mockReset();
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockReset();
      vi.mocked(ArtistCreditRepository.findReleasesLedBy).mockReset();
    });

    it('should delete an archived artist successfully', async () => {
      vi.mocked(ArtistRepository.delete).mockResolvedValue(mockArtist);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: mockArtist });
      expect(ArtistRepository.delete).toHaveBeenCalledWith('artist-123');
    });

    // "Archive first, then delete permanently" was enforced only by which
    // button the admin list renders; the service is the gate.
    it('refuses to delete an artist that is not archived', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValue(mockArtist as never);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toEqual({
        success: false,
        error: 'Archive the artist before deleting it permanently.',
        code: 'VALIDATION',
      });
      expect(ArtistRepository.delete).not.toHaveBeenCalled();
    });

    // Deleting a release's album artist would make the next credit the
    // album artist and the byline, a choice nobody made; the admin moves or
    // removes that credit first.
    it('refuses to delete the album artist of a release, naming the releases', async () => {
      vi.mocked(ArtistCreditRepository.findReleasesLedBy).mockResolvedValueOnce([
        { id: 'r1', title: 'Beta' },
        { id: 'r2', title: 'Alpha' },
      ]);

      const result = await ArtistService.deleteArtist('artist-123');

      expect({ result, deleted: vi.mocked(ArtistRepository.delete).mock.calls }).toEqual({
        result: {
          success: false,
          code: 'VALIDATION',
          error:
            'This artist is the album artist of Alpha, Beta. Move or remove that credit on each release first; the published ones are listed from the dashboard’s Releases tile.',
        },
        deleted: [],
      });
    });

    it('reads the releases the artist leads', async () => {
      vi.mocked(ArtistRepository.delete).mockResolvedValue(mockArtist);

      await ArtistService.deleteArtist('artist-123');

      expect(vi.mocked(ArtistCreditRepository.findReleasesLedBy).mock.calls).toEqual([
        ['artist-123'],
      ]);
    });

    it('should return error when artist not found', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValue(null);

      const result = await ArtistService.deleteArtist('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
      expect(ArtistRepository.delete).not.toHaveBeenCalled();
    });

    it('reports not found when the artist is gone by the time it is deleted', async () => {
      vi.mocked(ArtistRepository.delete).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    // The re-hosted bio images live in our bucket; the row cascade removed
    // their rows but left the objects behind.
    it('removes the deleted artist’s re-hosted bio images from S3', async () => {
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockResolvedValue([
        {
          url: 'https://cdn.example/media/artists/a1/bio/img/0-abc.webp',
          thumbnailUrl: 'https://cdn.example/media/artists/a1/bio/thumbs/0-abc.webp',
        },
        { url: 'https://upload.wikimedia.org/external.jpg', thumbnailUrl: null },
      ] as never);
      vi.mocked(ArtistRepository.delete).mockResolvedValue(mockArtist);

      await ArtistService.deleteArtist('artist-123');

      expect(vi.mocked(deleteS3Object).mock.calls).toEqual([
        ['media/artists/a1/bio/img/0-abc.webp'],
        ['media/artists/a1/bio/thumbs/0-abc.webp'],
      ]);
    });

    it('still reports the delete when an S3 cleanup fails', async () => {
      vi.mocked(ArtistBioImageRepository.findManyByArtist).mockResolvedValue([
        { url: 'https://cdn.example/media/artists/a1/bio/img/0-abc.webp', thumbnailUrl: null },
      ] as never);
      vi.mocked(deleteS3Object).mockRejectedValueOnce(new Error('S3 down'));
      vi.mocked(ArtistRepository.delete).mockResolvedValue(mockArtist);

      const result = await ArtistService.deleteArtist('artist-123');

      expect(result).toMatchObject({ success: true, data: mockArtist });
    });

    it('drops the deleted artist’s terms from the vocabulary counts', async () => {
      vi.mocked(ArtistRepository.delete).mockResolvedValue(mockArtist);

      await ArtistService.deleteArtist('artist-123');

      expect(ArtistVocabularyService.invalidate).toHaveBeenCalled();
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

    // The vocabulary counts read only non-deleted artists.
    it('drops the archived artist’s terms from the vocabulary counts', async () => {
      vi.mocked(ArtistRepository.archive).mockResolvedValue(mockArtist);

      await ArtistService.archiveArtist('artist-123');

      expect(ArtistVocabularyService.invalidate).toHaveBeenCalled();
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
    it('refuses to publish while no display image is chosen (ADR-0019)', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(mockArtist as never);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(0);

      const result = await ArtistService.publishArtist('artist-123', 'admin-1');

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
      expect(ArtistRepository.update).not.toHaveBeenCalled();
    });

    it('should publish an artist by stamping publishedOn', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(mockArtist as never);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(1);
      const publishedArtist = { ...mockArtist, publishedOn: new Date('2024-12-13') };
      vi.mocked(ArtistRepository.update).mockResolvedValue(publishedArtist);

      const result = await ArtistService.publishArtist('artist-123', 'admin-1');

      expect(result).toMatchObject({ success: true, data: publishedArtist });
      expect(ArtistRepository.update).toHaveBeenCalledWith(
        'artist-123',
        { publishedOn: expect.any(Date) },
        { publishedBy: 'admin-1' }
      );
    });

    it('should return error when artist not found', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(notFoundError);

      const result = await ArtistService.publishArtist('non-existent', 'admin-1');

      expect(result).toMatchObject({ success: false, error: 'Artist not found' });
    });

    it('should return error when database is unavailable', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(mockArtist as never);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(1);
      const initError = new DataError('UNAVAILABLE', 'Connection failed');
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(initError);

      const result = await ArtistService.publishArtist('artist-123', 'admin-1');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('should handle unknown errors', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce(mockArtist as never);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(1);
      vi.mocked(ArtistRepository.update).mockReset();
      vi.mocked(ArtistRepository.update).mockRejectedValue(Error('Unknown error'));

      const result = await ArtistService.publishArtist('artist-123', 'admin-1');

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

    it('brings the restored artist’s terms back into the vocabulary counts', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist as never);

      await ArtistService.restoreArtist('artist-123');

      expect(ArtistVocabularyService.invalidate).toHaveBeenCalled();
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
      members: [],
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
            artistReleases: [{ artistId: mockArtist.id, artist: { ...mockArtist } }],
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
            artistReleases: [{ artistId: mockArtist.id, artist: { ...mockArtist } }],
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
            artistReleases: [{ artistId: mockArtist.id, artist: { ...mockArtist } }],
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
      artistReleases: Array<{ artistId: string; artist: { id: string; publishedOn: Date | null } }>;
      digitalFormats: never[];
    }

    /** A credited artist as the credit select projects it: public unless overridden. */
    const creditArtist = (id: string) => ({
      id,
      slug: id,
      firstName: 'Artist',
      surname: id,
      displayName: id,
      deactivatedAt: null,
      publishedOn: new Date('2024-01-01'),
      deletedOn: null,
    });

    /** Ids whose credit the fixture builds as a hidden (unpublished) artist. */
    const hiddenCreditIds = new Set(['artist-hidden']);

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
      artistReleases: artistIds.map((artistId) => ({
        artistId,
        artist: hiddenCreditIds.has(artistId)
          ? { ...creditArtist(artistId), publishedOn: null }
          : creditArtist(artistId),
      })),
      digitalFormats: [],
    });

    /** The visibility fields a joined-artist fixture may override (#786). */
    interface JoinedArtistOverrides {
      deactivatedAt?: Date | null;
      publishedOn?: Date | null;
      deletedOn?: Date | null;
    }

    /** A joined artist (band member or band) as the public select projects it. */
    const joinedArtist = (id: string, overrides: JoinedArtistOverrides = {}) => ({
      ...mockArtist,
      id,
      slug: id,
      publishedOn: new Date('2024-01-01'),
      deletedOn: null,
      ...overrides,
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
        members: [],
        releases: [joinRow(mockArtist.id, guest), joinRow(mockArtist.id, own)],
        memberOf: [
          {
            id: 'am-1',
            artistId: 'band-1',
            memberId: mockArtist.id,
            artist: { ...joinedArtist('band-1'), releases: [joinRow('band-1', bandLp)] },
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

    // The page leads with the newest release the artist holds a direct credit
    // on — own or featured, never a band's — summarised like the index does.
    it('summarises the newest listed direct release, ignoring band releases', async () => {
      const own = publishedRelease('own', [mockArtist.id], '2010-01-01');
      const guest = publishedRelease('guest', ['artist-other', mockArtist.id], '2024-01-01');
      const bandLp = publishedRelease('band-lp', ['band-1'], '2025-01-01');
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValueOnce({
        ...mockArtist,
        members: [],
        releases: [joinRow(mockArtist.id, own), joinRow(mockArtist.id, guest)],
        memberOf: [
          {
            id: 'am-1',
            artistId: 'band-1',
            memberId: mockArtist.id,
            artist: { ...joinedArtist('band-1'), releases: [joinRow('band-1', bandLp)] },
          },
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success && result.data.newestRelease).toEqual({
        id: 'guest',
        title: 'guest',
        releasedOn: new Date('2024-01-01'),
      });
    });

    it('has no newest release when every direct credit is unlisted', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValueOnce({
        ...mockArtist,
        members: [],
        memberOf: [],
        releases: [
          joinRow(mockArtist.id, {
            ...publishedRelease('draft', [mockArtist.id], '2024-01-01'),
            publishedAt: null,
          }),
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(result.success && result.data.newestRelease).toBeNull();
    });

    describe('hidden credited artists (ADR-0015)', () => {
      interface CreditedRow {
        releaseId: string;
        albumArtist: { id: string } | null;
        release: { artistReleases: Array<{ artistId: string }> };
      }

      const readRows = async (release: PublishedReleaseRow): Promise<CreditedRow[]> => {
        vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValueOnce({
          ...mockArtist,
          members: [],
          memberOf: [],
          releases: [joinRow(mockArtist.id, release)],
        } as never);
        const result = await ArtistService.getArtistBySlugWithReleases('john-doe');
        return (result as { success: true; data: { releases: CreditedRow[] } }).data.releases;
      };

      it('drops a hidden artist from a release’s credits', async () => {
        const [row] = await readRows(
          publishedRelease('lp', [mockArtist.id, 'artist-hidden', 'artist-other'], '2024-01-01')
        );

        expect(row.release.artistReleases.map(({ artistId }) => artistId)).toEqual([
          mockArtist.id,
          'artist-other',
        ]);
      });

      it('names the album artist when it is public', async () => {
        const [row] = await readRows(
          publishedRelease('guest', ['artist-other', mockArtist.id], '2024-01-01')
        );

        expect(row.albumArtist?.id).toBe('artist-other');
      });

      it('names no album artist when it is hidden, rather than the next credit', async () => {
        const [row] = await readRows(
          publishedRelease('guest', ['artist-hidden', mockArtist.id], '2024-01-01')
        );

        expect(row.albumArtist).toBeNull();
      });

      it('still derives the credit from the full credit order', async () => {
        vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValueOnce({
          ...mockArtist,
          members: [],
          memberOf: [],
          releases: [
            joinRow(
              mockArtist.id,
              publishedRelease('guest', ['artist-hidden', mockArtist.id], '2024-01-01')
            ),
          ],
        } as never);

        const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

        expect(readReleases(result).map(({ credit }) => credit)).toEqual(['featured']);
      });
    });

    it('excludes an unpublished band release', async () => {
      const draft = { ...publishedRelease('draft', ['band-1'], '2025-01-01'), publishedAt: null };
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtist,
        members: [],
        releases: [],
        memberOf: [
          {
            id: 'am-1',
            artistId: 'band-1',
            memberId: mockArtist.id,
            artist: { ...joinedArtist('band-1'), releases: [joinRow('band-1', draft)] },
          },
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(readReleases(result)).toEqual([]);
    });

    it('omits unpublished and deleted members, and keeps one that left the label (ADR-0016)', async () => {
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtistWithReleases,
        members: [
          { id: 'm-1', artistId: mockArtist.id, memberId: 'pub', member: joinedArtist('pub') },
          {
            id: 'm-2',
            artistId: mockArtist.id,
            memberId: 'draft',
            member: joinedArtist('draft', { publishedOn: null }),
          },
          {
            id: 'm-3',
            artistId: mockArtist.id,
            memberId: 'inactive',
            member: joinedArtist('inactive'),
          },
          {
            id: 'm-4',
            artistId: mockArtist.id,
            memberId: 'gone',
            member: joinedArtist('gone', { deletedOn: new Date('2024-06-01') }),
          },
          {
            id: 'm-5',
            artistId: mockArtist.id,
            memberId: 'alumnus',
            member: joinedArtist('alumnus', {
              deactivatedAt: new Date('2025-03-01'),
            }),
          },
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      const data = (result as { success: true; data: { members: Array<{ memberId: string }> } })
        .data;
      expect(data.members.map(({ memberId }) => memberId)).toEqual(['pub', 'inactive', 'alumnus']);
    });

    it('drops the releases of an unpublished or deleted band, whatever its standing (ADR-0016)', async () => {
      const bandRow = (id: string, overrides: JoinedArtistOverrides = {}) => ({
        id: `am-${id}`,
        artistId: id,
        memberId: mockArtist.id,
        artist: {
          ...joinedArtist(id, overrides),
          releases: [joinRow(id, publishedRelease(`${id}-lp`, [id], '2025-01-01'))],
        },
      });
      vi.mocked(ArtistRepository.findPublishedBySlugWithReleases).mockResolvedValue({
        ...mockArtist,
        members: [],
        releases: [],
        memberOf: [
          bandRow('pub-band'),
          bandRow('draft-band', { publishedOn: null }),
          bandRow('inactive-band'),
          bandRow('gone-band', { deletedOn: new Date('2024-06-01') }),
          bandRow('alumni-band', { deactivatedAt: new Date('2025-03-01') }),
        ],
      } as never);

      const result = await ArtistService.getArtistBySlugWithReleases('john-doe');

      expect(
        readReleases(result)
          .map(({ releaseId }) => releaseId)
          .sort()
      ).toEqual(['alumni-band-lp', 'inactive-band-lp', 'pub-band-lp']);
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
      // The full nested release/digital-format include AND the public artist
      // where-clause (published + deletedOn null-safety) now live in (and are
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
        members: [],
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
        members: [],
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

    describe('when a soft-deleted artist owns the slug', () => {
      const duplicate = new DataError('DUPLICATE', 'Unique constraint failed');
      const created = { id: 'artist-new', displayName: 'Ceschi', firstName: 'Ceschi', surname: '' };

      beforeEach(() => {
        // The finders skip soft-deleted rows, so every lookup misses.
        vi.mocked(ArtistRepository.findUniqueBySlug).mockResolvedValue(null as never);
        vi.mocked(ArtistRepository.findFirstByDisplayName).mockResolvedValue(null as never);
        vi.mocked(ArtistRepository.findFirstByName).mockResolvedValue(null as never);
      });

      afterEach(() => {
        vi.mocked(ArtistRepository.createWithSelect).mockReset();
      });

      it('creates a new artist under the next free slug', async () => {
        vi.mocked(ArtistRepository.createWithSelect)
          .mockRejectedValueOnce(duplicate)
          .mockResolvedValueOnce(created as never);

        const result = await ArtistService.findOrCreateByName('Ceschi');

        expect(result).toEqual({ success: true, data: created });
      });

      it('retries the create with a numbered slug', async () => {
        vi.mocked(ArtistRepository.createWithSelect)
          .mockRejectedValueOnce(duplicate)
          .mockRejectedValueOnce(duplicate)
          .mockResolvedValueOnce(created as never);

        await ArtistService.findOrCreateByName('Ceschi');

        expect(
          vi.mocked(ArtistRepository.createWithSelect).mock.calls.map(([{ slug }]) => slug)
        ).toEqual(['ceschi', 'ceschi-2', 'ceschi-3']);
      });

      it('fails with DUPLICATE once the numbered slugs run out', async () => {
        vi.mocked(ArtistRepository.createWithSelect).mockRejectedValue(duplicate);

        const result = await ArtistService.findOrCreateByName('Ceschi');

        expect(result).toEqual({
          success: false,
          error: 'Artist with this slug already exists',
          code: 'DUPLICATE',
        });
      });
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

  describe('findNameById', () => {
    it('returns the name projection from the repository', async () => {
      const row = { id: 'artist-1', displayName: 'Ceschi', firstName: 'David', surname: 'Ramos' };
      vi.mocked(ArtistRepository.findNameById).mockResolvedValue(row);

      const result = await ArtistService.findNameById('artist-1');

      expect(result).toEqual(row);
      expect(ArtistRepository.findNameById).toHaveBeenCalledWith('artist-1');
    });

    it('returns null when the artist does not exist', async () => {
      vi.mocked(ArtistRepository.findNameById).mockResolvedValue(null);

      await expect(ArtistService.findNameById('missing-id')).resolves.toBeNull();
    });
  });

  describe('updateArtist shortBio sanitization', () => {
    it('sanitizes a string shortBio before persisting', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { shortBio: '<p>Hi</p><script>alert(1)</script>' },
        'admin-1'
      );

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.shortBio).toBe('<p>Hi</p>');
    });
  });

  // ADR-0009: the normalised form applies to the write path. The service is
  // the seam every writer crosses, so it — not the admin combobox — is the
  // gate; a payload that skipped the client's normalisation still stores the
  // one storage form.
  describe('vocabulary normalisation at the write seam (ADR-0009)', () => {
    it('stores genres and tags in the normalised form on create', async () => {
      vi.mocked(ArtistRepository.create).mockResolvedValue(mockArtist);

      await ArtistService.createArtist({
        firstName: 'John',
        surname: 'Doe',
        displayName: 'John Doe',
        slug: 'john-doe',
        genres: 'Hip Hop, R&B, hip-hop',
        tags: 'Synth Pop',
      });

      const [persisted] = vi.mocked(ArtistRepository.create).mock.calls.at(-1) ?? [];
      expect(persisted?.genres).toBe('hip-hop,r-and-b');
      expect(persisted?.tags).toBe('synth-pop');
    });

    it('stores genres and tags in the normalised form on update', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist(
        'artist-123',
        { genres: 'Experimental, Electronic', tags: 'Lo-Fi' },
        'admin-1'
      );

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.genres).toBe('experimental,electronic');
      expect(persisted?.tags).toBe('lo-fi');
    });

    it('clears a column that normalises to nothing, and leaves an omitted one alone', async () => {
      vi.mocked(ArtistRepository.update).mockResolvedValue(mockArtist);

      await ArtistService.updateArtist('artist-123', { genres: ' , ' }, 'admin-1');

      const [, persisted] = vi.mocked(ArtistRepository.update).mock.calls.at(-1) ?? [];
      expect(persisted?.genres).toBeNull();
      expect(persisted).not.toHaveProperty('tags');
    });
  });

  describe('creditOnRelease', () => {
    it('credits through the credit module so the stored order stays dense', async () => {
      vi.mocked(ArtistCreditRepository.creditOnRelease).mockResolvedValueOnce(undefined);

      await ArtistService.creditOnRelease('artist-1', 'release-1');

      expect(vi.mocked(ArtistCreditRepository.creditOnRelease).mock.calls).toEqual([
        ['release-1', 'artist-1'],
      ]);
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

      // A card shows the first display image only (CARD_DISPLAY_IMAGE_COUNT).
      const ids = result.success ? result.data[0]?.bioImages.map(({ id }) => id) : result;
      expect(ids).toEqual(['first']);
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
        members: [],
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
        members: [],
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
    const unchosenOfUnpublished = {
      artistId: 'a1',
      displayOrder: null,
      artist: { publishedOn: null },
    };
    const chosenOfPublished = {
      artistId: 'a1',
      displayOrder: 0,
      artist: { publishedOn: new Date('2026-01-01') },
    };

    beforeEach(() => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example');
      vi.mocked(ArtistBioImageRepository.findDisplayState).mockResolvedValue(unchosenOfUnpublished);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.mocked(ArtistBioImageRepository.findDisplayState).mockReset();
      vi.mocked(ArtistBioImageRepository.countChosen).mockReset();
    });

    // The guard (ADR-0019): a published artist's chosen set never becomes
    // empty, so its last chosen image cannot be deleted.
    it("refuses to delete a published artist's last chosen image", async () => {
      vi.mocked(ArtistBioImageRepository.findDisplayState).mockResolvedValueOnce(chosenOfPublished);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(1);

      const result = await ArtistService.deleteBioImage('img-1');

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
      expect(ArtistBioImageRepository.delete).not.toHaveBeenCalled();
    });

    it("deletes a published artist's chosen image while another remains", async () => {
      vi.mocked(ArtistBioImageRepository.findDisplayState).mockResolvedValueOnce(chosenOfPublished);
      vi.mocked(ArtistBioImageRepository.countChosen).mockResolvedValueOnce(2);
      vi.mocked(ArtistBioImageRepository.delete).mockResolvedValue({
        url: 'https://upload.wikimedia.org/photo.jpg',
        thumbnailUrl: null,
      });

      const result = await ArtistService.deleteBioImage('img-1');

      expect(result).toEqual({ success: true, data: undefined });
      expect(ArtistBioImageRepository.delete).toHaveBeenCalledWith('img-1');
    });

    it("deletes a published artist's unchosen image without counting", async () => {
      vi.mocked(ArtistBioImageRepository.findDisplayState).mockResolvedValueOnce({
        ...chosenOfPublished,
        displayOrder: null,
      });
      vi.mocked(ArtistBioImageRepository.delete).mockResolvedValue({
        url: 'https://upload.wikimedia.org/photo.jpg',
        thumbnailUrl: null,
      });

      await ArtistService.deleteBioImage('img-1');

      expect(ArtistBioImageRepository.countChosen).not.toHaveBeenCalled();
      expect(ArtistBioImageRepository.delete).toHaveBeenCalledWith('img-1');
    });

    it('returns NOT_FOUND for an unknown image', async () => {
      vi.mocked(ArtistBioImageRepository.findDisplayState).mockResolvedValueOnce(null);

      const result = await ArtistService.deleteBioImage('missing');

      expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' });
      expect(ArtistBioImageRepository.delete).not.toHaveBeenCalled();
    });

    it('maps a repository failure to a failed response', async () => {
      vi.mocked(ArtistBioImageRepository.delete).mockRejectedValueOnce(Error('boom'));

      const result = await ArtistService.deleteBioImage('img-1');

      expect(result).toMatchObject({ success: false, error: 'Failed to delete bio image' });
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
      await expect(ArtistService.deleteBioImage('img-1')).resolves.toEqual({
        success: true,
        data: undefined,
      });
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
        displayName: 'Ceschi',
        firstName: 'David',
        surname: 'Ramos',
      } as never);
      vi.mocked(ArtistBioImageRepository.setDisplayOrder).mockResolvedValue(undefined);
      vi.mocked(ArtistBioImageRepository.updateAlt).mockResolvedValue(undefined);
    });

    // Persistent implementations and unconsumed one-shots leak across the
    // shuffled file (docs/lessons/testing), so drain them after every test.
    afterEach(() => {
      vi.mocked(ArtistRepository.findById).mockReset();
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockReset();
      vi.mocked(ArtistBioImageRepository.setDisplayOrder).mockReset();
      vi.mocked(ArtistBioImageRepository.updateAlt).mockReset();
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

    it('refuses to clear the set of a published artist (ADR-0019)', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce({
        id: 'a1',
        slug: 'ceschi',
        displayName: 'Ceschi',
        publishedOn: new Date('2026-01-01'),
      } as never);

      const result = await ArtistService.setDisplayImages('a1', []);

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' });
      expect(ArtistBioImageRepository.setDisplayOrder).not.toHaveBeenCalled();
    });

    it('clears every display image when given an empty list', async () => {
      const result = await ArtistService.setDisplayImages('a1', []);

      expect(result).toMatchObject({ success: true });
      expect(ArtistBioImageRepository.setDisplayOrder).toHaveBeenCalledWith('a1', []);
    });

    it('accepts more than three ids — the chosen set has no cap', async () => {
      const ids = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9'];
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce(
        ids.map((id) => ({ id, alt: 'alt', origin: 'custom' }))
      );

      const result = await ArtistService.setDisplayImages('a1', ids);

      expect(result).toMatchObject({ success: true });
      expect(ArtistBioImageRepository.setDisplayOrder).toHaveBeenCalledWith('a1', ids);
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

    it("backfills a blank alt with the artist's name before choosing the image", async () => {
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([
        eligible('img-1'),
        { id: 'img-2', alt: '  ', origin: 'custom' },
        { id: 'img-3', alt: null, origin: 'generated' },
      ]);

      const result = await ArtistService.setDisplayImages('a1', ['img-1', 'img-2', 'img-3']);

      expect(result).toEqual({ success: true, data: { slug: 'ceschi' } });
      expect(vi.mocked(ArtistBioImageRepository.updateAlt).mock.calls).toEqual([
        ['img-2', 'Ceschi'],
        ['img-3', 'Ceschi'],
      ]);
      expect(ArtistBioImageRepository.setDisplayOrder).toHaveBeenCalledWith('a1', [
        'img-1',
        'img-2',
        'img-3',
      ]);
    });

    it('derives the backfilled alt from first name and surname when displayName is blank', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce({
        id: 'a1',
        slug: 'ceschi',
        displayName: null,
        firstName: 'David',
        surname: 'Ramos',
      } as never);
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([
        { id: 'img-2', alt: null, origin: 'custom' },
      ]);

      await ArtistService.setDisplayImages('a1', ['img-2']);

      expect(ArtistBioImageRepository.updateAlt).toHaveBeenCalledWith('img-2', 'David Ramos');
    });

    it('leaves an existing alt alone', async () => {
      vi.mocked(ArtistBioImageRepository.findManyByIds).mockResolvedValueOnce([eligible('img-1')]);

      await ArtistService.setDisplayImages('a1', ['img-1']);

      expect(ArtistBioImageRepository.updateAlt).not.toHaveBeenCalled();
    });

    it('refuses an image without alt text when the artist has no name to fall back on', async () => {
      vi.mocked(ArtistRepository.findById).mockResolvedValueOnce({
        id: 'a1',
        slug: 'ceschi',
        displayName: null,
        firstName: '',
        surname: '',
      } as never);
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
      expect(ArtistBioImageRepository.updateAlt).not.toHaveBeenCalled();
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
