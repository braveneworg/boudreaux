/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';
import { ARTIST_BIO_FIELDS, ARTIST_PRIVATE_FIELDS } from '@/lib/types/domain/artist';

import { TourRepository } from './tour-repository';

vi.mock('server-only', () => ({}));

vi.mock('../../prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    tour: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('TourRepository', () => {
  const mockTour = {
    id: 'tour-123',
    title: 'Summer Tour 2026',
    subtitle: 'West Coast Edition',
    subtitle2: null,
    description: 'An incredible summer tour',
    notes: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    createdBy: 'user-123',
    updatedBy: null,
    images: [],
    tourDates: [],
  };
  // The tour payload is public (`/api/tours`, the tours pages' dehydrated
  // state), so each headliner artist carries only its public scalars (#765).
  describe('headliner artist projection', () => {
    type HeadlinerArtistArg = {
      include: {
        tourDates: { include: { headliners: { include: { artist: { select: object } } } } };
      };
    };
    const headlinerArtistSelect = (arg: unknown): object =>
      (arg as HeadlinerArtistArg).include.tourDates.include.headliners.include.artist.select;

    it.each(ARTIST_PRIVATE_FIELDS)('findAll never selects the private field %s', async (field) => {
      vi.mocked(prisma.tour.findMany).mockResolvedValueOnce([] as never);

      await TourRepository.findAll();

      expect(
        headlinerArtistSelect(vi.mocked(prisma.tour.findMany).mock.calls[0][0])
      ).not.toHaveProperty(field);
    });

    it.each(ARTIST_PRIVATE_FIELDS)('findById never selects the private field %s', async (field) => {
      vi.mocked(prisma.tour.findUnique).mockResolvedValueOnce(null);

      await TourRepository.findById('507f1f77bcf86cd799439011');

      expect(
        headlinerArtistSelect(vi.mocked(prisma.tour.findUnique).mock.calls[0][0])
      ).not.toHaveProperty(field);
    });

    // Nothing gates a headliner on publication, so a draft headliner's bio
    // must never ride along on the public tour payload.
    it.each(ARTIST_BIO_FIELDS)('findAll never selects the bio field %s', async (field) => {
      vi.mocked(prisma.tour.findMany).mockResolvedValueOnce([] as never);

      await TourRepository.findAll();

      expect(
        headlinerArtistSelect(vi.mocked(prisma.tour.findMany).mock.calls[0][0])
      ).not.toHaveProperty(field);
    });

    it.each(ARTIST_BIO_FIELDS)('findById never selects the bio field %s', async (field) => {
      vi.mocked(prisma.tour.findUnique).mockResolvedValueOnce(null);

      await TourRepository.findById('507f1f77bcf86cd799439011');

      expect(
        headlinerArtistSelect(vi.mocked(prisma.tour.findUnique).mock.calls[0][0])
      ).not.toHaveProperty(field);
    });
  });

  describe('public reads (ADR-0015)', () => {
    const PUBLIC_ARTIST = {
      publishedOn: { not: null },
      OR: [{ deletedOn: null }, { deletedOn: { isSet: false } }],
    };
    const PUBLIC_HEADLINER = { artist: { is: PUBLIC_ARTIST } };
    const VISIBLE_DATE = {
      OR: [
        {
          headliners: {
            every: { OR: [{ artistId: null }, { artistId: { isSet: false } }] },
          },
        },
        { headliners: { some: PUBLIC_HEADLINER } },
      ],
    };
    const VISIBLE_TOUR = {
      OR: [{ tourDates: { none: {} } }, { tourDates: { some: VISIBLE_DATE } }],
    };

    interface PublicTourArgs {
      where: unknown;
      include: {
        tourDates: { where: unknown; include: { headliners: { where: unknown } } };
      };
      skip?: number;
      take?: number;
    }

    beforeEach(() => {
      vi.mocked(prisma.tour.findMany).mockResolvedValue([] as never);
      vi.mocked(prisma.tour.findFirst).mockResolvedValue(null);
    });

    afterEach(() => {
      vi.mocked(prisma.tour.findMany).mockReset();
      vi.mocked(prisma.tour.findFirst).mockReset();
    });

    const listArgs = async (params?: Parameters<typeof TourRepository.findAllPublic>[0]) => {
      await TourRepository.findAllPublic(params);
      return vi.mocked(prisma.tour.findMany).mock.calls.at(-1)?.[0] as unknown as PublicTourArgs;
    };

    it('lists tours with no dates or with a date the public may see', async () => {
      const args = await listArgs();

      expect(args.where).toEqual({ AND: [VISIBLE_TOUR] });
    });

    it('returns only the dates the public may see', async () => {
      const args = await listArgs();

      expect(args.include.tourDates.where).toEqual(VISIBLE_DATE);
    });

    it('names only the headliners that are public artists', async () => {
      const args = await listArgs();

      expect(args.include.tourDates.include.headliners.where).toEqual(PUBLIC_HEADLINER);
    });

    it('searches names of public headliners only, on dates the public may see', async () => {
      const contains = { contains: 'ceschi', mode: 'insensitive' };

      const args = await listArgs({ search: 'ceschi' });

      expect(args.where).toEqual({
        AND: [
          VISIBLE_TOUR,
          {
            OR: [
              { title: contains },
              { subtitle: contains },
              { subtitle2: contains },
              { description: contains },
              {
                tourDates: {
                  some: {
                    AND: [
                      VISIBLE_DATE,
                      {
                        OR: [
                          {
                            venue: {
                              OR: [{ name: contains }, { city: contains }, { state: contains }],
                            },
                          },
                          {
                            headliners: {
                              some: {
                                artist: {
                                  is: {
                                    AND: [
                                      PUBLIC_ARTIST,
                                      {
                                        OR: [
                                          { firstName: contains },
                                          { surname: contains },
                                          { displayName: contains },
                                        ],
                                      },
                                    ],
                                  },
                                },
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      });
    });

    it('pages in the database, so a hidden tour never shortens a page', async () => {
      const args = await listArgs({ skip: 24, take: 12 });

      expect({ skip: args.skip, take: args.take }).toEqual({ skip: 24, take: 12 });
    });

    it('finds a tour by id only when the public may see it', async () => {
      await TourRepository.findPublicById('507f1f77bcf86cd799439011');

      const args = vi
        .mocked(prisma.tour.findFirst)
        .mock.calls.at(-1)?.[0] as unknown as PublicTourArgs;
      expect(args.where).toEqual({ id: '507f1f77bcf86cd799439011', ...VISIBLE_TOUR });
    });

    it('reads a tour by id with the public dates and headliners', async () => {
      await TourRepository.findPublicById('507f1f77bcf86cd799439011');

      const args = vi
        .mocked(prisma.tour.findFirst)
        .mock.calls.at(-1)?.[0] as unknown as PublicTourArgs;
      expect({
        dates: args.include.tourDates.where,
        headliners: args.include.tourDates.include.headliners.where,
      }).toEqual({ dates: VISIBLE_DATE, headliners: PUBLIC_HEADLINER });
    });

    it('does not read for a malformed id', async () => {
      const tour = await TourRepository.findPublicById('nope');

      expect({ tour, reads: vi.mocked(prisma.tour.findFirst).mock.calls }).toEqual({
        tour: null,
        reads: [],
      });
    });

    it('leaves the admin reads unfiltered', async () => {
      await TourRepository.findAll();

      const args = vi.mocked(prisma.tour.findMany).mock.calls.at(-1)?.[0] as unknown as {
        where?: unknown;
        include: { tourDates: object };
      };
      expect({ where: args.where, filtersDates: 'where' in args.include.tourDates }).toEqual({
        where: undefined,
        filtersDates: false,
      });
    });
  });

  describe('findAll', () => {
    it('returns tours sorted by createdAt descending with nested relations', async () => {
      vi.mocked(prisma.tour.findMany).mockResolvedValue([mockTour] as never);

      const result = await TourRepository.findAll();

      expect(result).toEqual([mockTour]);
      expect(prisma.tour.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { displayOrder: 'asc' },
          },
          tourDates: {
            include: {
              venue: true,
              headliners: {
                include: {
                  artist: { select: expect.objectContaining({ id: true, slug: true }) },
                },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { startDate: 'asc' },
          },
        },
      });
    });

    it('applies search across tour, venue, and headliner fields with page/limit pagination', async () => {
      vi.mocked(prisma.tour.findMany).mockResolvedValue([mockTour] as never);

      await TourRepository.findAll({ search: 'Summer', page: 2, limit: 25 });

      const contains = { contains: 'Summer', mode: 'insensitive' };
      expect(prisma.tour.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
          where: {
            OR: [
              { title: contains },
              { subtitle: contains },
              { subtitle2: contains },
              { description: contains },
              {
                tourDates: {
                  some: {
                    OR: [
                      {
                        venue: {
                          OR: [{ name: contains }, { city: contains }, { state: contains }],
                        },
                      },
                      {
                        headliners: {
                          some: {
                            artist: {
                              OR: [
                                { firstName: contains },
                                { surname: contains },
                                { displayName: contains },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        })
      );
    });

    it('applies skip/take pagination in preference to page/limit', async () => {
      vi.mocked(prisma.tour.findMany).mockResolvedValue([mockTour] as never);

      await TourRepository.findAll({ skip: 24, take: 24 });

      expect(prisma.tour.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 24, take: 24 })
      );
    });
  });

  describe('findById', () => {
    it('returns one tour with nested relations', async () => {
      vi.mocked(prisma.tour.findUnique).mockResolvedValue(mockTour as never);

      const validTourId = '507f1f77bcf86cd799439011';

      const result = await TourRepository.findById(validTourId);

      expect(result).toEqual(mockTour);
      expect(prisma.tour.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: validTourId } })
      );
    });

    it('returns null when missing', async () => {
      vi.mocked(prisma.tour.findUnique).mockResolvedValue(null);

      const result = await TourRepository.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a tour with basic fields only', async () => {
      const createData = {
        title: 'New Tour',
        subtitle: 'Subtitle',
        subtitle2: null,
        description: 'Description',
        notes: 'Internal note',
        createdBy: 'user-123',
      };

      vi.mocked(prisma.tour.create).mockResolvedValue(mockTour as never);

      const result = await TourRepository.create(createData);

      expect(result).toEqual(mockTour);
      expect(prisma.tour.create).toHaveBeenCalledWith({
        data: createData,
      });
    });
  });

  describe('update', () => {
    it('updates fields and sets updatedBy', async () => {
      const updateData = {
        title: 'Updated Title',
        subtitle: 'Updated Subtitle',
      };

      vi.mocked(prisma.tour.update).mockResolvedValue({
        ...mockTour,
        ...updateData,
      } as never);

      await TourRepository.update('tour-123', updateData, 'user-456');

      expect(prisma.tour.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tour-123' },
          data: {
            ...updateData,
            updatedBy: 'user-456',
          },
        })
      );
    });
  });

  describe('delete', () => {
    it('deletes by id', async () => {
      const tx = {
        tourDateHeadliner: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        tourDate: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        tourImage: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        tour: {
          delete: vi.fn().mockResolvedValue(mockTour),
        },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

      await TourRepository.delete('tour-123');

      expect(tx.tourDateHeadliner.deleteMany).toHaveBeenCalledWith({
        where: {
          tourDate: {
            tourId: 'tour-123',
          },
        },
      });
      expect(tx.tourDate.deleteMany).toHaveBeenCalledWith({
        where: { tourId: 'tour-123' },
      });
      expect(tx.tourImage.deleteMany).toHaveBeenCalledWith({
        where: { tourId: 'tour-123' },
      });
      expect(tx.tour.delete).toHaveBeenCalledWith({
        where: { id: 'tour-123' },
      });
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      vi.mocked(prisma.tour.count).mockResolvedValue(42);

      const result = await TourRepository.count();

      expect(result).toBe(42);
      expect(prisma.tour.count).toHaveBeenCalledWith({ where: {} });
    });

    it('applies search filter when counting', async () => {
      vi.mocked(prisma.tour.count).mockResolvedValue(5);

      await TourRepository.count({ search: 'Summer' });

      const contains = { contains: 'Summer', mode: 'insensitive' };
      expect(prisma.tour.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: contains },
            { subtitle: contains },
            { subtitle2: contains },
            { description: contains },
            {
              tourDates: {
                some: {
                  OR: [
                    {
                      venue: { OR: [{ name: contains }, { city: contains }, { state: contains }] },
                    },
                    {
                      headliners: {
                        some: {
                          artist: {
                            OR: [
                              { firstName: contains },
                              { surname: contains },
                              { displayName: contains },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
    });
  });
});
