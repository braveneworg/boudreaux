/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { artistWhere } from './_internal/artist-where';
import { releaseWhere } from './_internal/release-where';
import { ArtistCreditRepository } from './artist-credit-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    artist: {
      findMany: vi.fn(),
    },
    artistRelease: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    tourDateHeadliner: {
      findMany: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

const NOW = new Date('2026-09-26T12:00:00.000Z');

const AWAITING_GATE = [artistWhere.unpublished, artistWhere.notDeleted];

const NAME_SELECT = {
  id: true,
  slug: true,
  displayName: true,
  firstName: true,
  middleName: true,
  surname: true,
  title: true,
  suffix: true,
};

const nameRow = {
  id: 'artist-1',
  slug: 'mc-example',
  displayName: 'MC Example',
  firstName: 'MC',
  middleName: null,
  surname: 'Example',
  title: null,
  suffix: null,
};

describe('ArtistCreditRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.artist.findMany).mockResolvedValue([]);
    vi.mocked(prisma.artistRelease.findMany).mockResolvedValue([]);
    vi.mocked(prisma.tourDateHeadliner.findMany).mockResolvedValue([]);
  });

  describe('findAwaitingConfirmation', () => {
    it('reads the artists credited on the release that only lack publishedOn', async () => {
      await ArtistCreditRepository.findAwaitingConfirmation('release-1');

      expect(vi.mocked(prisma.artist.findMany).mock.calls).toEqual([
        [
          {
            where: { releases: { some: { releaseId: 'release-1' } }, AND: AWAITING_GATE },
            select: {
              ...NAME_SELECT,
              bio: true,
              shortBio: true,
              altBio: true,
              bioGeneratedAt: true,
              bioImages: {
                select: { isPrimary: true, displayOrder: true, alt: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        ],
      ]);
    });

    it('describes what goes live and keeps the bio text out of the result', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValueOnce([
        {
          ...nameRow,
          bio: 'A long generated bio.',
          shortBio: null,
          altBio: null,
          bioGeneratedAt: NOW,
          bioImages: [{ isPrimary: true, displayOrder: null, alt: 'On stage' }],
        },
      ] as never);

      const credits = await ArtistCreditRepository.findAwaitingConfirmation('release-1');

      expect(credits).toEqual([
        {
          id: 'artist-1',
          slug: 'mc-example',
          name: 'MC Example',
          bioState: 'generated',
          bioGeneratedAt: NOW,
          displayImageCount: 1,
        },
      ]);
    });

    it('orders the credits by displayed name', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValueOnce([
        { ...nameRow, id: 'z', displayName: 'Zed', bioImages: [] },
        { ...nameRow, id: 'a', displayName: 'abel', bioImages: [] },
      ] as never);

      const credits = await ArtistCreditRepository.findAwaitingConfirmation('release-1');

      expect(credits.map(({ id }) => id)).toEqual(['a', 'z']);
    });
  });

  describe('findAwaitingConfirmationAmong', () => {
    it('reads the given artists that only lack publishedOn', async () => {
      await ArtistCreditRepository.findAwaitingConfirmationAmong(['artist-1', 'artist-2']);

      expect(vi.mocked(prisma.artist.findMany).mock.calls[0][0]?.where).toEqual({
        id: { in: ['artist-1', 'artist-2'] },
        AND: AWAITING_GATE,
      });
    });

    it('describes what goes live for each', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValueOnce([
        {
          ...nameRow,
          bio: null,
          shortBio: null,
          altBio: null,
          bioGeneratedAt: null,
          bioImages: [],
        },
      ] as never);

      const credits = await ArtistCreditRepository.findAwaitingConfirmationAmong(['artist-1']);

      expect(credits).toEqual([
        {
          id: 'artist-1',
          slug: 'mc-example',
          name: 'MC Example',
          bioState: 'none',
          bioGeneratedAt: null,
          displayImageCount: 0,
        },
      ]);
    });

    it('reads nothing when no artist is given', async () => {
      const credits = await ArtistCreditRepository.findAwaitingConfirmationAmong([]);

      expect({ credits, calls: vi.mocked(prisma.artist.findMany).mock.calls }).toEqual({
        credits: [],
        calls: [],
      });
    });
  });

  describe('findThatStayHiddenAmong', () => {
    it('reads the given artists that are deleted', async () => {
      await ArtistCreditRepository.findThatStayHiddenAmong(['artist-1']);

      expect(vi.mocked(prisma.artist.findMany).mock.calls[0][0]?.where).toEqual({
        id: { in: ['artist-1'] },
        deletedOn: { not: null },
      });
    });

    it('reads nothing when no artist is given', async () => {
      const credits = await ArtistCreditRepository.findThatStayHiddenAmong([]);

      expect({ credits, calls: vi.mocked(prisma.artist.findMany).mock.calls }).toEqual({
        credits: [],
        calls: [],
      });
    });
  });

  describe('findThatStayHidden', () => {
    it('reads the credited artists that are deleted', async () => {
      await ArtistCreditRepository.findThatStayHidden('release-1');

      expect(vi.mocked(prisma.artist.findMany).mock.calls).toEqual([
        [
          {
            where: {
              releases: { some: { releaseId: 'release-1' } },
              deletedOn: { not: null },
            },
            select: { ...NAME_SELECT, deletedOn: true },
          },
        ],
      ]);
    });

    it('describes each credit with the reason it stays hidden', async () => {
      vi.mocked(prisma.artist.findMany).mockResolvedValueOnce([
        { ...nameRow, deletedOn: NOW },
      ] as never);

      const credits = await ArtistCreditRepository.findThatStayHidden('release-1');

      expect(credits).toEqual([
        { id: 'artist-1', slug: 'mc-example', name: 'MC Example', reason: 'deleted' },
      ]);
    });
  });

  describe('findPublishedWorkCreditedTo', () => {
    it('reads the listed releases the artist is credited on', async () => {
      await ArtistCreditRepository.findPublishedWorkCreditedTo('artist-1');

      expect(vi.mocked(prisma.artistRelease.findMany).mock.calls).toEqual([
        [
          {
            where: {
              artistId: 'artist-1',
              release: releaseWhere.listed,
            },
            select: { release: { select: { id: true, title: true } } },
          },
        ],
      ]);
    });

    it('reads the tour dates the artist headlines', async () => {
      await ArtistCreditRepository.findPublishedWorkCreditedTo('artist-1');

      expect(vi.mocked(prisma.tourDateHeadliner.findMany).mock.calls).toEqual([
        [
          {
            where: { artistId: 'artist-1' },
            select: {
              tourDate: {
                select: {
                  id: true,
                  startDate: true,
                  tour: { select: { id: true, title: true } },
                },
              },
            },
          },
        ],
      ]);
    });

    it('returns the releases and tour dates flattened', async () => {
      const startDate = new Date('2026-11-01T00:00:00.000Z');
      vi.mocked(prisma.artistRelease.findMany).mockResolvedValueOnce([
        { release: { id: 'release-1', title: 'Broken Bone Ballads' } },
      ] as never);
      vi.mocked(prisma.tourDateHeadliner.findMany).mockResolvedValueOnce([
        { tourDate: { id: 'date-1', startDate, tour: { id: 'tour-1', title: 'Fall Tour' } } },
      ] as never);

      const work = await ArtistCreditRepository.findPublishedWorkCreditedTo('artist-1');

      expect(work).toEqual({
        releases: [{ id: 'release-1', title: 'Broken Bone Ballads' }],
        tourDates: [{ id: 'date-1', startDate, tourId: 'tour-1', tourTitle: 'Fall Tour' }],
      });
    });
  });

  describe('creditOnRelease', () => {
    it('appends the artist after the credits the release already has', async () => {
      vi.mocked(prisma.artistRelease.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.artistRelease.count).mockResolvedValueOnce(2);
      vi.mocked(prisma.artistRelease.create).mockResolvedValueOnce({} as never);

      await ArtistCreditRepository.creditOnRelease('release-1', 'artist-c');

      expect(vi.mocked(prisma.artistRelease.create).mock.calls).toEqual([
        [{ data: { artistId: 'artist-c', releaseId: 'release-1', position: 2 } }],
      ]);
    });

    it('is a no-op when the artist is already credited', async () => {
      vi.mocked(prisma.artistRelease.findUnique).mockResolvedValueOnce({ id: 'ar-1' } as never);

      await ArtistCreditRepository.creditOnRelease('release-1', 'artist-a');

      expect(prisma.artistRelease.count).not.toHaveBeenCalled();
      expect(prisma.artistRelease.create).not.toHaveBeenCalled();
    });
  });
});
