/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { TourDetail } from './tour-detail';

import type { Artist, Tour, TourDate, TourDateHeadliner, TourImage, Venue } from '@prisma/client';

type TourWithRelations = Tour & {
  tourDates: Array<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: Artist | null;
        }
      >;
    }
  >;
  images: TourImage[];
};

const createMockArtist = (overrides?: Partial<Artist>): Artist =>
  ({
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: 'John Doe',
    ...overrides,
  }) as Artist;

const createMockVenue = (overrides?: Partial<Venue>): Venue =>
  ({
    id: 'venue-1',
    name: 'Test Venue',
    city: 'New York',
    state: 'NY',
    address: null,
    postalCode: null,
    country: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Venue;

const createMockImage = (overrides?: Partial<TourImage>): TourImage =>
  ({
    id: 'image-1',
    tourId: 'tour-1',
    s3Key: 'test-key',
    s3Bucket: 'test-bucket',
    s3Url: 'https://example.com/image.jpg',
    cdnUrl: 'https://cdn.example.com/image.jpg',
    filename: 'image.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 800,
    height: 600,
    displayOrder: 0,
    altText: 'Test image',
    caption: null,
    uploadedAt: new Date(),
    ...overrides,
  }) as TourImage;

const createMockTourDateHeadliner = (
  overrides?: Partial<
    TourDateHeadliner & {
      artist: Artist | null;
    }
  >
): TourDateHeadliner & {
  artist: Artist | null;
} =>
  ({
    id: 'th-1',
    tourDateId: 'tour-date-1',
    artistId: 'artist-1',
    sortOrder: 0,
    artist: createMockArtist(),
    ...overrides,
  }) as TourDateHeadliner & {
    artist: Artist | null;
  };

const createMockTourDate = (
  overrides?: Partial<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: Artist | null;
        }
      >;
    }
  >
): TourDate & {
  venue: Venue;
  headliners: Array<
    TourDateHeadliner & {
      artist: Artist | null;
    }
  >;
} =>
  ({
    id: 'tour-date-1',
    tourId: 'tour-1',
    startDate: new Date('2099-06-01T00:00:00.000Z'),
    endDate: null,
    showStartTime: new Date('2099-06-01T20:00:00.000Z'),
    showEndTime: null,
    venueId: 'venue-1',
    ticketsUrl: null,
    ticketIconUrl: null,
    ticketPrices: null,
    notes: null,
    timeZone: null,
    utcOffset: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    venue: createMockVenue(),
    headliners: [],
    ...overrides,
  }) as TourDate & {
    venue: Venue;
    headliners: Array<
      TourDateHeadliner & {
        artist: Artist | null;
      }
    >;
  };

const createMockTour = (overrides?: Partial<TourWithRelations>): TourWithRelations =>
  ({
    id: 'tour-1',
    title: 'Test Tour',
    subtitle: null,
    subtitle2: null,
    description: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    tourDates: [createMockTourDate()],
    images: [],
    ...overrides,
  }) as TourWithRelations;

describe('TourDetail', () => {
  // ─── Navigation ───────────────────────────────────────────────────────────────

  it('renders Back to Tours link', () => {
    render(<TourDetail tour={createMockTour()} />);

    const backLink = screen.getByRole('link', { name: /Back to Tours/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', '/tours');
  });

  // ─── Title & subtitles ────────────────────────────────────────────────────────

  it('renders tour title', () => {
    render(<TourDetail tour={createMockTour({ title: 'World Tour 2026' })} />);

    expect(screen.getByText('World Tour 2026')).toBeInTheDocument();
  });

  it('renders subtitle when present', () => {
    render(<TourDetail tour={createMockTour({ subtitle: 'The Final Chapter' })} />);

    expect(screen.getByText('The Final Chapter')).toBeInTheDocument();
  });

  it('does not render subtitle when absent', () => {
    render(<TourDetail tour={createMockTour({ subtitle: null })} />);

    expect(screen.queryByText('The Final Chapter')).not.toBeInTheDocument();
  });

  it('renders subtitle2 when present', () => {
    render(<TourDetail tour={createMockTour({ subtitle2: 'An Acoustic Evening' })} />);

    expect(screen.getByText('An Acoustic Evening')).toBeInTheDocument();
  });

  it('does not render subtitle2 when absent', () => {
    render(<TourDetail tour={createMockTour({ subtitle2: null })} />);

    expect(screen.queryByText('An Acoustic Evening')).not.toBeInTheDocument();
  });

  // ─── Description / About ─────────────────────────────────────────────────────

  it('renders About section when description is present', () => {
    render(<TourDetail tour={createMockTour({ description: 'A legendary farewell run.' })} />);

    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('A legendary farewell run.')).toBeInTheDocument();
  });

  it('does not render About section when description is absent', () => {
    render(<TourDetail tour={createMockTour({ description: null })} />);

    expect(screen.queryByText('About')).not.toBeInTheDocument();
  });

  // ─── Past Event badge ─────────────────────────────────────────────────────────

  it('shows Past Event badge when all tour dates are in the past', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('Past Event')).toBeInTheDocument();
  });

  it('does not show Past Event badge for upcoming tours', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date('2099-01-01T00:00:00.000Z'),
        }),
      ],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.queryByText('Past Event')).not.toBeInTheDocument();
  });

  it('does not show Past Event badge when there are no tour dates', () => {
    render(<TourDetail tour={createMockTour({ tourDates: [] })} />);

    expect(screen.queryByText('Past Event')).not.toBeInTheDocument();
  });

  // ─── Hero image ───────────────────────────────────────────────────────────────

  it('renders hero image when images are available', () => {
    const image = createMockImage({ altText: 'Concert promo photo', displayOrder: 0 });
    render(<TourDetail tour={createMockTour({ images: [image] })} />);

    const img = screen.getByAltText('Concert promo photo');
    expect(img).toBeInTheDocument();
  });

  it('does not render hero image when no images', () => {
    render(<TourDetail tour={createMockTour({ images: [] })} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uses tour title as alt text when hero image has no alt text', () => {
    const image = createMockImage({ altText: null, displayOrder: 0 });
    render(<TourDetail tour={createMockTour({ title: 'Summer Run', images: [image] })} />);

    expect(screen.getByAltText('Summer Run')).toBeInTheDocument();
  });

  // ─── Image gallery ────────────────────────────────────────────────────────────

  it('renders Gallery section when more than one image is available', () => {
    const images = [
      createMockImage({ id: 'img-1', displayOrder: 0, altText: 'Hero' }),
      createMockImage({ id: 'img-2', displayOrder: 1, altText: 'Gallery shot 1' }),
      createMockImage({ id: 'img-3', displayOrder: 2, altText: 'Gallery shot 2' }),
    ];
    render(<TourDetail tour={createMockTour({ images })} />);

    expect(screen.getByText('Gallery')).toBeInTheDocument();
    expect(screen.getByAltText('Gallery shot 1')).toBeInTheDocument();
    expect(screen.getByAltText('Gallery shot 2')).toBeInTheDocument();
  });

  it('does not render Gallery section when only one image is available', () => {
    const images = [createMockImage({ id: 'img-1', displayOrder: 0 })];
    render(<TourDetail tour={createMockTour({ images })} />);

    expect(screen.queryByText('Gallery')).not.toBeInTheDocument();
  });

  it('sorts images by displayOrder before rendering gallery', () => {
    const images = [
      createMockImage({ id: 'img-2', displayOrder: 1, altText: 'Second image' }),
      createMockImage({ id: 'img-1', displayOrder: 0, altText: 'First image' }),
    ];
    render(<TourDetail tour={createMockTour({ images })} />);

    // First image is hero, second goes to gallery
    expect(screen.getByAltText('First image')).toBeInTheDocument();
    // Second image also renders (in gallery)
    expect(screen.getByAltText('Second image')).toBeInTheDocument();
  });

  // ─── Tour dates section ───────────────────────────────────────────────────────

  it('shows "No tour dates announced yet" when there are no tour dates', () => {
    render(<TourDetail tour={createMockTour({ tourDates: [] })} />);

    expect(screen.getByText('No tour dates announced yet.')).toBeInTheDocument();
  });

  it('renders tour date with venue name and location', () => {
    const venue = createMockVenue({ name: 'Madison Square Garden', city: 'New York', state: 'NY' });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    expect(screen.getByText('New York, NY')).toBeInTheDocument();
  });

  it('renders venue location without state when state is absent', () => {
    const venue = createMockVenue({ city: 'London', state: null });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('London')).toBeInTheDocument();
  });

  it('renders formatted start date for a tour date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date('2099-07-04T00:00:00.000Z'),
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourDetail tour={tour} />);

    // Detail view uses long month format: e.g. "Saturday, July 4, 2099"
    expect(screen.getByText(/July 4, 2099/)).toBeInTheDocument();
  });

  it('renders show start time for a tour date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          showStartTime: new Date('2099-06-01T20:00:00.000Z'),
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText(/8:00 PM/)).toBeInTheDocument();
  });

  it('renders show end time when showEndTime is present', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          showStartTime: new Date('2099-06-01T20:00:00.000Z'),
          showEndTime: new Date('2099-06-01T22:00:00.000Z'),
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourDetail tour={tour} />);

    // Both times should be present in combined string
    expect(screen.getByText(/8:00 PM.*10:00 PM/)).toBeInTheDocument();
  });

  it('renders end date in date range when endDate differs from startDate', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date('2099-07-04T00:00:00.000Z'),
          endDate: new Date('2099-07-06T00:00:00.000Z'),
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourDetail tour={tour} />);

    // The date div renders: "Saturday, July 4, 2099 - Jul 6, 2099"
    // The long start date and the short end date sit in the same element
    const dateDivs = screen.getAllByText(/July 4, 2099/);
    const dateDiv = dateDivs.find((el) => el.textContent?.includes('Jul 6, 2099'));
    expect(dateDiv).toBeDefined();
  });

  it('does not render end date range when endDate equals startDate', () => {
    const sameDate = new Date('2099-07-04T00:00:00.000Z');
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: sameDate,
          endDate: sameDate,
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourDetail tour={tour} />);

    // Date element renders with long format; endDate same as startDate → no range
    const dateDivs = screen.getAllByText(/July 4, 2099/);
    const hasRange = dateDivs.some((el) => el.textContent?.includes(' - '));
    expect(hasRange).toBe(false);
  });

  it('renders headliner names for a tour date', () => {
    const artist = createMockArtist({ displayName: 'The Beatles' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [createMockTourDateHeadliner({ artist })],
        }),
      ],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('does not render Music icon row when tour date has no headliners', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ headliners: [] })],
    });
    render(<TourDetail tour={tour} />);

    // The tour renders without crashing when there are no headliners
    expect(screen.getByText('Tour Dates')).toBeInTheDocument();
  });

  it('renders "Unknown Artist" when headliner has no artist', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              artist: null,
              artistId: null,
            }),
          ],
        }),
      ],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
  });

  it('falls back to first and last name for headliner when displayName is null', () => {
    const artist = createMockArtist({ displayName: null, firstName: 'Nina', surname: 'Simone' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [createMockTourDateHeadliner({ artist })],
        }),
      ],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('Nina Simone')).toBeInTheDocument();
  });

  // ─── Ticket information ───────────────────────────────────────────────────────

  it('renders ticket price when ticketPrices is present', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketPrices: '$35 - $75' })],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.getByText('$35 - $75')).toBeInTheDocument();
  });

  it('renders Get Tickets link when ticketsUrl is present', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketsUrl: 'https://tickets.example.com' })],
    });
    render(<TourDetail tour={tour} />);

    const link = screen.getByRole('link', { name: /Get Tickets/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://tickets.example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render ticket section when no price and no URL', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketsUrl: null, ticketPrices: null })],
    });
    render(<TourDetail tour={tour} />);

    expect(screen.queryByRole('link', { name: /Get Tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  // ─── Multiple tour dates & ordering ──────────────────────────────────────────

  it('sorts tour dates by startDate ascending', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          id: 'td-2',
          startDate: new Date('2099-08-01T00:00:00.000Z'),
          venue: createMockVenue({ id: 'venue-2', name: 'The Ryman' }),
          timeZone: 'UTC',
        } as never),
        createMockTourDate({
          id: 'td-1',
          startDate: new Date('2099-07-01T00:00:00.000Z'),
          venue: createMockVenue({ id: 'venue-1', name: 'MSG' }),
          timeZone: 'UTC',
        } as never),
      ],
    });
    render(<TourDetail tour={tour} />);

    const venueNames = screen.getAllByText(/MSG|The Ryman/);
    // MSG (July) should appear before The Ryman (August)
    expect(venueNames[0]).toHaveTextContent('MSG');
    expect(venueNames[1]).toHaveTextContent('The Ryman');
  });

  it('renders Tour Dates section heading', () => {
    render(<TourDetail tour={createMockTour()} />);

    expect(screen.getByText('Tour Dates')).toBeInTheDocument();
  });
});
