/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { TourList } from './tour-list';

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
    address: null,
    city: 'New York',
    state: 'NY',
    postalCode: null,
    country: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Venue;

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
    headliners: [
      {
        id: 'th-1',
        tourDateId: 'tour-date-1',
        artistId: 'artist-1',
        sortOrder: 0,
        artist: createMockArtist(),
      } as TourDateHeadliner & {
        artist: Artist | null;
      },
    ],
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

describe('TourList', () => {
  it('renders grid of tour cards', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2' }),
      createMockTour({ id: 'tour-3', title: 'Tour 3' }),
    ];

    render(<TourList tours={tours} />);

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.getByText('Tour 2')).toBeInTheDocument();
    expect(screen.getByText('Tour 3')).toBeInTheDocument();
  });

  it('renders correct number of tour cards', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2' }),
    ];

    render(<TourList tours={tours} />);

    const cards = screen.getAllByTestId('tour-card');
    expect(cards).toHaveLength(2);
  });

  it('shows empty state when no tours', () => {
    render(<TourList tours={[]} />);

    expect(screen.getByText('No tours found')).toBeInTheDocument();
    expect(screen.getByText(/Check back later for upcoming tour dates/)).toBeInTheDocument();
  });

  it('does not show empty state when tours exist', () => {
    const tours = [createMockTour()];

    render(<TourList tours={tours} />);

    expect(screen.queryByText('No tours found')).not.toBeInTheDocument();
  });

  it('renders tours in order provided', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'First Tour' }),
      createMockTour({ id: 'tour-2', title: 'Second Tour' }),
      createMockTour({ id: 'tour-3', title: 'Third Tour' }),
    ];

    render(<TourList tours={tours} />);

    const cards = screen.getAllByTestId('tour-card');
    expect(cards[0]).toHaveTextContent('First Tour');
    expect(cards[1]).toHaveTextContent('Second Tour');
    expect(cards[2]).toHaveTextContent('Third Tour');
  });
});
