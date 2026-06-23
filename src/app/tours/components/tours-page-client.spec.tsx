/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  ArtistScalars as Artist,
  TourDateHeadlinerScalars as TourDateHeadliner,
  TourDateScalars as TourDate,
  TourImageScalars as TourImage,
  TourScalars as Tour,
  VenueScalars as Venue,
} from '@/lib/types/tours';

import { ToursPageClient } from './tours-page-client';

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
    startDate: new Date('2026-06-01'),
    endDate: null,
    showStartTime: new Date('2026-06-01T20:00:00'),
    showEndTime: null,
    venueId: 'venue-1',
    ticketsUrl: null,
    ticketPrices: null,
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
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tourDates: [createMockTourDate()],
    images: [],
    ...overrides,
  }) as TourWithRelations;

describe('ToursPageClient', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setupUser = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

  const renderClient = (props: Partial<React.ComponentProps<typeof ToursPageClient>> = {}) =>
    render(
      <ToursPageClient
        tours={props.tours ?? []}
        search={props.search ?? ''}
        onSearchChange={props.onSearchChange ?? vi.fn()}
        hasNextPage={props.hasNextPage ?? false}
        isFetchingNextPage={props.isFetchingNextPage ?? false}
        fetchNextPage={props.fetchNextPage ?? vi.fn()}
      />
    );

  it('renders the provided tours', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2' }),
    ];

    renderClient({ tours });

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.getByText('Tour 2')).toBeInTheDocument();
  });

  it('calls onSearchChange with the debounced search term', async () => {
    const user = setupUser();
    const onSearchChange = vi.fn();

    renderClient({ onSearchChange });

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await user.type(searchInput, 'Rock');
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(onSearchChange).toHaveBeenCalledWith('Rock');
  });

  it('does not show a count when there is no search term', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2' }),
    ];

    renderClient({ tours, search: '' });

    // The loaded-count chip only renders when a search is active.
    expect(screen.queryByText(/tours? found/)).not.toBeInTheDocument();
  });

  it('shows a plural loaded count when searching', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock 1' }),
      createMockTour({ id: 'tour-2', title: 'Rock 2' }),
    ];

    renderClient({ tours, search: 'Rock' });

    expect(screen.getByText('2 tours found')).toBeInTheDocument();
  });

  it('shows a singular loaded count when one tour is loaded', () => {
    renderClient({ tours: [createMockTour({ id: 'tour-1', title: 'Rock' })], search: 'Rock' });

    expect(screen.getByText('1 tour found')).toBeInTheDocument();
  });

  it('shows the empty state when a search returns no tours', () => {
    renderClient({ tours: [], search: 'Classical' });

    expect(screen.getByText('No tours found')).toBeInTheDocument();
    expect(screen.getByText(/Try adjusting your search/)).toBeInTheDocument();
  });

  it('reflects the controlled search value in the input', () => {
    renderClient({ search: 'Jazz' });

    expect(screen.getByLabelText('Search tours by artist name')).toHaveValue('Jazz');
  });

  it('shows a loading spinner while fetching the next page', () => {
    renderClient({
      tours: [createMockTour({ id: 'tour-1', title: 'Tour 1' })],
      hasNextPage: true,
      isFetchingNextPage: true,
    });

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    // The spinner has no accessible name; assert the SVG is present.
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
