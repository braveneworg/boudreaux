/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToursPageClient } from './tours-page-client';

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
    address: null,
    city: 'New York',
    state: 'NY',
    postalCode: null,
    country: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Venue;

const createMockHeadliner = (
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

  /** Type into the search input and flush the 300ms debounce */
  const typeAndFlush = async (
    user: ReturnType<typeof userEvent.setup>,
    input: HTMLElement,
    text: string
  ) => {
    await user.type(input, text);
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
  };

  const setupUser = () => userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });

  it('renders all tours when no search query', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2' }),
    ];

    render(<ToursPageClient tours={tours} />);

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.getByText('Tour 2')).toBeInTheDocument();
  });

  it('filters tours by title', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert' }),
      createMockTour({ id: 'tour-2', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Rock');

    expect(screen.getByText('Rock Concert')).toBeInTheDocument();
    expect(screen.queryByText('Jazz Night')).not.toBeInTheDocument();
  });

  it('filters tours by subtitle', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1', subtitle: 'Summer Edition' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2', subtitle: 'Winter Edition' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Summer');

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.queryByText('Tour 2')).not.toBeInTheDocument();
  });

  it('filters tours by artist display name', async () => {
    const user = setupUser();
    const artist1 = createMockArtist({ id: 'artist-1', displayName: 'The Beatles' });
    const artist2 = createMockArtist({ id: 'artist-2', displayName: 'Rolling Stones' });

    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Tour 1',
        tourDates: [createMockTourDate({ headliners: [createMockHeadliner({ artist: artist1 })] })],
      }),
      createMockTour({
        id: 'tour-2',
        title: 'Tour 2',
        tourDates: [
          createMockTourDate({
            id: 'td-2',
            headliners: [createMockHeadliner({ id: 'th-2', artist: artist2 })],
          }),
        ],
      }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Beatles');

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.queryByText('Tour 2')).not.toBeInTheDocument();
  });

  it('filters tours by artist first and last name when no display name', async () => {
    const user = setupUser();
    const artist = createMockArtist({
      id: 'artist-1',
      firstName: 'John',
      surname: 'Lennon',
      displayName: null,
    });

    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Tour 1',
        tourDates: [createMockTourDate({ headliners: [createMockHeadliner({ artist })] })],
      }),
      createMockTour({
        id: 'tour-2',
        title: 'Tour 2',
        tourDates: [createMockTourDate({ id: 'td-2' })],
      }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Lennon');

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.queryByText('Tour 2')).not.toBeInTheDocument();
  });

  it('performs case-insensitive search', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert' }),
      createMockTour({ id: 'tour-2', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'ROCK');

    expect(screen.getByText('Rock Concert')).toBeInTheDocument();
    expect(screen.queryByText('Jazz Night')).not.toBeInTheDocument();
  });

  it('performs partial match search', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert' }),
      createMockTour({ id: 'tour-2', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Roc');

    expect(screen.getByText('Rock Concert')).toBeInTheDocument();
    expect(screen.queryByText('Jazz Night')).not.toBeInTheDocument();
  });

  it('shows count of filtered tours', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert 1' }),
      createMockTour({ id: 'tour-2', title: 'Rock Concert 2' }),
      createMockTour({ id: 'tour-3', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Rock');

    expect(screen.getByText('2 tours found')).toBeInTheDocument();
  });

  it('shows singular count for one tour', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert' }),
      createMockTour({ id: 'tour-2', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Rock');

    expect(screen.getByText('1 tour found')).toBeInTheDocument();
  });

  it('shows empty state when no tours match search', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert' }),
      createMockTour({ id: 'tour-2', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Classical');

    expect(screen.getByText('No tours found')).toBeInTheDocument();
    expect(screen.getByText(/Try adjusting your search/)).toBeInTheDocument();
  });

  it('shows all tours when search is cleared', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Rock Concert' }),
      createMockTour({ id: 'tour-2', title: 'Jazz Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Rock');

    expect(screen.queryByText('Jazz Night')).not.toBeInTheDocument();

    const clearButton = screen.getByLabelText('Clear search');
    await user.click(clearButton);

    expect(screen.getByText('Rock Concert')).toBeInTheDocument();
    expect(screen.getByText('Jazz Night')).toBeInTheDocument();
  });

  it('handles tours with multiple headliners', async () => {
    const user = setupUser();
    const artist1 = createMockArtist({ id: 'artist-1', displayName: 'The Beatles' });
    const artist2 = createMockArtist({ id: 'artist-2', displayName: 'Rolling Stones' });

    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Double Headline',
        tourDates: [
          createMockTourDate({
            headliners: [
              createMockHeadliner({ id: 'th-1', artist: artist1 }),
              createMockHeadliner({ id: 'th-2', artist: artist2 }),
            ],
          }),
        ],
      }),
      createMockTour({ id: 'tour-2', title: 'Solo Show' }),
    ];

    render(<ToursPageClient tours={tours} />);

    // Search for first headliner
    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Beatles');

    expect(screen.getByText('Double Headline')).toBeInTheDocument();
    expect(screen.queryByText('Solo Show')).not.toBeInTheDocument();

    // Clear and search for second headliner
    const clearButton = screen.getByLabelText('Clear search');
    await user.click(clearButton);
    await typeAndFlush(user, searchInput, 'Stones');

    expect(screen.getByText('Double Headline')).toBeInTheDocument();
    expect(screen.queryByText('Solo Show')).not.toBeInTheDocument();
  });

  it('filters tours by venue name in tour dates', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'West Coast Run',
        tourDates: [
          createMockTourDate({ venue: createMockVenue({ name: 'Madison Square Garden' }) }),
        ],
      }),
      createMockTour({
        id: 'tour-2',
        title: 'South Run',
        tourDates: [
          createMockTourDate({ id: 'td-2', venue: createMockVenue({ name: 'Ryman Auditorium' }) }),
        ],
      }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Madison');

    expect(screen.getByText('West Coast Run')).toBeInTheDocument();
    expect(screen.queryByText('South Run')).not.toBeInTheDocument();
  });

  it('filters tours by group headliner name', async () => {
    const user = setupUser();
    const group = createMockGroup({ id: 'group-1', name: 'The Supremes' });
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Motown Night',
        tourDates: [
          createMockTourDate({
            headliners: [
              createMockHeadliner({
                artist: null,
                artistId: null,
                group,
                groupId: group.id,
              }),
            ],
          }),
        ],
      }),
      createMockTour({ id: 'tour-2', title: 'Rock Night' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Supremes');

    expect(screen.getByText('Motown Night')).toBeInTheDocument();
    expect(screen.queryByText('Rock Night')).not.toBeInTheDocument();
  });

  it('does not show count when no search query', () => {
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2' }),
    ];

    render(<ToursPageClient tours={tours} />);

    expect(screen.queryByText(/tours found/)).not.toBeInTheDocument();
  });

  it('filters tours by subtitle2', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({ id: 'tour-1', title: 'Tour 1', subtitle2: 'An Acoustic Evening' }),
      createMockTour({ id: 'tour-2', title: 'Tour 2', subtitle2: null }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Acoustic');

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.queryByText('Tour 2')).not.toBeInTheDocument();
  });

  it('filters tours by description', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Tour 1',
        description: 'A landmark farewell run across North America',
      }),
      createMockTour({ id: 'tour-2', title: 'Tour 2', description: null }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'farewell');

    expect(screen.getByText('Tour 1')).toBeInTheDocument();
    expect(screen.queryByText('Tour 2')).not.toBeInTheDocument();
  });

  it('filters tours by artist first/last name when displayName is absent', async () => {
    const user = setupUser();
    const artistNoDisplay = createMockArtist({
      id: 'artist-nodisplay',
      displayName: null,
      firstName: 'Billie',
      surname: 'Holiday',
    });
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Jazz Tour',
        tourDates: [
          createMockTourDate({
            headliners: [
              createMockHeadliner({ artist: artistNoDisplay, artistId: artistNoDisplay.id }),
            ],
          }),
        ],
      }),
      createMockTour({ id: 'tour-2', title: 'Rock Tour' }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Holiday');

    expect(screen.getByText('Jazz Tour')).toBeInTheDocument();
    expect(screen.queryByText('Rock Tour')).not.toBeInTheDocument();
  });

  it('filters tours by venue city', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Nashville Tour',
        tourDates: [
          createMockTourDate({ venue: createMockVenue({ city: 'Nashville', state: 'TN' }) }),
        ],
      }),
      createMockTour({
        id: 'tour-2',
        title: 'Chicago Tour',
        tourDates: [
          createMockTourDate({
            id: 'td-2',
            venue: createMockVenue({ city: 'Chicago', state: 'IL' }),
          }),
        ],
      }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Nashville');

    expect(screen.getByText('Nashville Tour')).toBeInTheDocument();
    expect(screen.queryByText('Chicago Tour')).not.toBeInTheDocument();
  });

  it('filters tours by venue state', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Texas Tour',
        tourDates: [
          createMockTourDate({ venue: createMockVenue({ city: 'Austin', state: 'TX' }) }),
        ],
      }),
      createMockTour({
        id: 'tour-2',
        title: 'Florida Tour',
        tourDates: [
          createMockTourDate({
            id: 'td-2',
            venue: createMockVenue({ city: 'Miami', state: 'FL' }),
          }),
        ],
      }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'TX');

    expect(screen.getByText('Texas Tour')).toBeInTheDocument();
    expect(screen.queryByText('Florida Tour')).not.toBeInTheDocument();
  });

  it('handles null venue city and state without crashing', async () => {
    const user = setupUser();
    const tours = [
      createMockTour({
        id: 'tour-1',
        title: 'Mystery Tour',
        tourDates: [
          createMockTourDate({
            venue: createMockVenue({
              name: 'Secret Venue',
              // Intentionally testing defensive null handling even though city is
              // non-nullable in the DB schema (runtime data may be inconsistent)
              city: null as unknown as string,
              state: null,
            }),
          }),
        ],
      }),
    ];

    render(<ToursPageClient tours={tours} />);

    const searchInput = screen.getByLabelText('Search tours by artist name');
    await typeAndFlush(user, searchInput, 'Secret');

    expect(screen.getByText('Mystery Tour')).toBeInTheDocument();
  });
});
