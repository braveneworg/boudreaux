/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { TourCard } from './tour-card';

import type {
  Artist,
  Group,
  Tour,
  TourDate,
  TourDateHeadliner,
  TourImage,
  Venue,
} from '@prisma/client';

type TourWithRelations = Tour & {
  tourDates: Array<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: (Artist & { groups: Array<{ group: Group }> }) | null;
          group: Group | null;
        }
      >;
    }
  >;
  images: TourImage[];
};

const createMockArtist = (
  overrides?: Partial<Artist & { groups: Array<{ group: Group }> }>
): Artist & { groups: Array<{ group: Group }> } =>
  ({
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: 'John Doe',
    groups: [],
    ...overrides,
  }) as Artist & { groups: Array<{ group: Group }> };

const createMockGroup = (overrides?: Partial<Group>): Group =>
  ({
    id: 'group-1',
    name: 'Test Group',
    ...overrides,
  }) as Group;

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
      artist: (Artist & { groups: Array<{ group: Group }> }) | null;
      group: Group | null;
    }
  >
): TourDateHeadliner & {
  artist: (Artist & { groups: Array<{ group: Group }> }) | null;
  group: Group | null;
} =>
  ({
    id: 'th-1',
    tourDateId: 'tour-date-1',
    artistId: 'artist-1',
    groupId: null,
    sortOrder: 0,
    artist: createMockArtist(),
    group: null,
    ...overrides,
  }) as TourDateHeadliner & {
    artist: (Artist & { groups: Array<{ group: Group }> }) | null;
    group: Group | null;
  };

const createMockTourDate = (
  overrides?: Partial<
    TourDate & {
      venue: Venue;
      headliners: Array<
        TourDateHeadliner & {
          artist: (Artist & { groups: Array<{ group: Group }> }) | null;
          group: Group | null;
        }
      >;
    }
  >
): TourDate & {
  venue: Venue;
  headliners: Array<
    TourDateHeadliner & {
      artist: (Artist & { groups: Array<{ group: Group }> }) | null;
      group: Group | null;
    }
  >;
} =>
  ({
    id: 'tour-date-1',
    tourId: 'tour-1',
    startDate: new Date(Date.UTC(2026, 5, 1)),
    endDate: null,
    showStartTime: new Date(Date.UTC(2026, 5, 1, 20, 0)),
    showEndTime: null,
    venueId: 'venue-1',
    ticketsUrl: 'https://example.com',
    ticketPrices: '$25',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    venue: createMockVenue(),
    headliners: [],
    ...overrides,
  }) as TourDate & {
    venue: Venue;
    headliners: Array<
      TourDateHeadliner & {
        artist: (Artist & { groups: Array<{ group: Group }> }) | null;
        group: Group | null;
      }
    >;
  };

const createMockTour = (overrides?: Partial<TourWithRelations>): TourWithRelations =>
  ({
    id: 'tour-1',
    title: 'Test Tour',
    subtitle: 'A test tour',
    subtitle2: null,
    description: 'Test description',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    tourDates: [createMockTourDate()],
    images: [],
    ...overrides,
  }) as TourWithRelations;

describe('TourCard', () => {
  it('renders tour card with test id', () => {
    const tour = createMockTour();
    render(<TourCard tour={tour} />);

    expect(screen.getByTestId('tour-card')).toBeInTheDocument();
  });

  it('renders tour title', () => {
    const tour = createMockTour({ title: 'Rock Concert 2026' });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('Rock Concert 2026')).toBeInTheDocument();
  });

  it('renders tour subtitle when present', () => {
    const tour = createMockTour({ subtitle: 'Summer Edition' });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('Summer Edition')).toBeInTheDocument();
  });

  it('does not render subtitle when absent', () => {
    const tour = createMockTour({ subtitle: null });
    render(<TourCard tour={tour} />);

    expect(screen.queryByText('Summer Edition')).not.toBeInTheDocument();
  });

  it('renders venue name and location', () => {
    const venue = createMockVenue({ name: 'Madison Square Garden', city: 'New York', state: 'NY' });
    const tour = createMockTour({
      tourDates: [createMockTourDate({ venue })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText(/Madison Square Garden/)).toBeInTheDocument();
  });

  it('renders headliner names', () => {
    const artist = createMockArtist({ displayName: 'The Beatles' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [createMockTourDateHeadliner({ artist })],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('renders multiple headliners with comma separation', () => {
    const artist1 = createMockArtist({ id: 'artist-1', displayName: 'The Beatles' });
    const artist2 = createMockArtist({ id: 'artist-2', displayName: 'Rolling Stones' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({ id: 'th-1', artistId: 'artist-1', artist: artist1 }),
            createMockTourDateHeadliner({ id: 'th-2', artistId: 'artist-2', artist: artist2 }),
          ],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('The Beatles, Rolling Stones')).toBeInTheDocument();
  });

  it('uses artist first and last name when no display name', () => {
    const artist = createMockArtist({
      displayName: null,
      firstName: 'John',
      surname: 'Lennon',
    });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [createMockTourDateHeadliner({ artist })],
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('John Lennon')).toBeInTheDocument();
  });

  it('renders primary image when available', () => {
    const image = createMockImage({
      s3Url: 'https://example.com/tour-image.jpg',
      altText: 'Tour promotional image',
    });
    const tour = createMockTour({ images: [image] });
    render(<TourCard tour={tour} />);

    const img = screen.getByAltText('Tour promotional image');
    expect(img).toBeInTheDocument();
  });

  it('uses tour title as alt text when image has no alt text', () => {
    const image = createMockImage({ altText: null });
    const tour = createMockTour({ title: 'Rock Concert', images: [image] });
    render(<TourCard tour={tour} />);

    const img = screen.getByAltText('Rock Concert');
    expect(img).toBeInTheDocument();
  });

  it('renders single date when no end date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          startDate: new Date(Date.UTC(2026, 5, 1)),
          endDate: null,
        }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Check that a date is rendered (exact format may vary by timezone)
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('renders date range when end date differs from start date', () => {
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({ id: 'tour-date-1', startDate: new Date(Date.UTC(2026, 5, 1)) }),
        createMockTourDate({ id: 'tour-date-2', startDate: new Date(Date.UTC(2026, 5, 3)) }),
      ],
    });
    render(<TourCard tour={tour} />);

    // Should show a date range with a dash
    expect(screen.getByText(/-/)).toBeInTheDocument();
  });

  it('renders ticket price when available', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketPrices: '$25 - $50' })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.getByText('$25 - $50')).toBeInTheDocument();
  });

  it('renders View Details button', () => {
    const tour = createMockTour();
    render(<TourCard tour={tour} />);

    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('renders Get Tickets button when tickets URL is available', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketsUrl: 'https://tickets.example.com' })],
    });
    render(<TourCard tour={tour} />);

    const button = screen.getByText('Get Tickets');
    expect(button).toBeInTheDocument();
    expect(button.closest('a')).toHaveAttribute('href', 'https://tickets.example.com');
    expect(button.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('does not render Get Tickets button when no tickets URL', () => {
    const tour = createMockTour({
      tourDates: [createMockTourDate({ ticketsUrl: null })],
    });
    render(<TourCard tour={tour} />);

    expect(screen.queryByText('Get Tickets')).not.toBeInTheDocument();
  });

  it('links to tour detail page', () => {
    const tour = createMockTour({ id: 'tour-123' });
    render(<TourCard tour={tour} />);

    const links = screen.getAllByRole('link', { name: /Test Tour|View Details/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/tours/tour-123');
    });
  });

  it('renders group headliner name when artist is null', () => {
    const group = createMockGroup({ name: 'The Supremes' });
    const tour = createMockTour({
      tourDates: [
        createMockTourDate({
          headliners: [
            createMockTourDateHeadliner({
              artist: null,
              artistId: null,
              group,
              groupId: group.id,
            }),
          ],
        }),
      ],
    });

    render(<TourCard tour={tour} />);
    expect(screen.getByText('The Supremes')).toBeInTheDocument();
  });
});
