/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfinitePublishedArtistsQuery } from '@/hooks/queries/use-infinite-published-artists-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { ArtistsContent } from './artists-content';

vi.mock('@/hooks/queries/use-infinite-published-artists-query', () => ({
  useInfinitePublishedArtistsQuery: vi.fn(),
}));

vi.mock('@/hooks/use-infinite-scroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

// Pass-through debounce: the component's wiring is under test here; the
// debounce timing itself is covered by use-debounce's own spec.
vi.mock('@/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('./artist-list-card', () => ({
  ArtistListCard: ({ artist }: { artist: { id: string; displayName: string } }) => (
    <div data-testid="artist-card">{artist.displayName}</div>
  ),
}));

interface StubRow {
  id: string;
  displayName: string;
  newestRelease?: { id: string; title: string; releasedOn: Date } | null;
}

interface InfiniteResultOverrides {
  pages?: Array<{ rows: StubRow[]; nextSkip: number | null }>;
  isPending?: boolean;
  isFetching?: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  refetch?: () => void;
  data?: unknown;
}

/** A listing row stub with just the fields the stubbed card and the dropdown read. */
const row = (id: string, displayName: string, newestTitle?: string): StubRow =>
  ({
    id,
    displayName,
    firstName: displayName,
    middleName: null,
    surname: '',
    title: null,
    suffix: null,
    bioImages: [],
    newestRelease: newestTitle
      ? { id: `${id}-r`, title: newestTitle, releasedOn: new Date('2024-01-01') }
      : null,
  }) as StubRow;

const toInfiniteResult = (overrides: InfiniteResultOverrides = {}) => {
  const { pages, data, ...rest } = overrides;
  return {
    data: 'data' in overrides ? data : { pages: pages ?? [{ rows: [], nextSkip: null }] },
    isPending: false,
    isFetching: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    ...rest,
  };
};

beforeEach(() => {
  vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(toInfiniteResult() as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Open the search combobox and return its typing input. */
const openSearch = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: 'Search artists' }));
  return screen.getByPlaceholderText('Search by name, genre, or release');
};

describe('ArtistsContent sorting', () => {
  it('defaults to the A–Z sort', () => {
    render(<ArtistsContent />);

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('alpha', '');
  });

  it('labels the sort toggle for assistive tech', () => {
    render(<ArtistsContent />);

    expect(screen.getByRole('radiogroup', { name: 'Sort artists' })).toBeInTheDocument();
  });

  it('sorts by newest release when that toggle is selected', async () => {
    render(<ArtistsContent />);

    await userEvent.click(screen.getByRole('radio', { name: 'Newest release' }));

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('newest', '');
  });

  it('returns to A–Z when that toggle is reselected', async () => {
    render(<ArtistsContent />);

    await userEvent.click(screen.getByRole('radio', { name: 'Newest release' }));
    await userEvent.click(screen.getByRole('radio', { name: 'A–Z' }));

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('alpha', '');
  });

  it('keeps the current sort when the selection is cleared', async () => {
    render(<ArtistsContent />);

    await userEvent.click(screen.getByRole('radio', { name: 'A–Z' }));

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('alpha', '');
  });
});

describe('ArtistsContent search', () => {
  it('renders a labelled search combobox trigger', () => {
    render(<ArtistsContent />);

    expect(screen.getByRole('button', { name: 'Search artists' })).toBeInTheDocument();
  });

  it('places the search trigger before the sort toggle', () => {
    render(<ArtistsContent />);

    const search = screen.getByRole('button', { name: 'Search artists' });
    const toggle = screen.getByRole('radiogroup', { name: 'Sort artists' });

    expect(search.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('forwards the typed search term to the query', async () => {
    render(<ArtistsContent />);

    await userEvent.type(await openSearch(), 'punk');

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('alpha', 'punk');
  });

  it('trims the search term before querying', async () => {
    render(<ArtistsContent />);

    await userEvent.type(await openSearch(), '  Punk ');

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('alpha', 'Punk');
  });

  it('shows a no-match message when a search returns nothing', async () => {
    render(<ArtistsContent />);

    await userEvent.type(await openSearch(), 'zzz');

    expect(screen.getAllByText('No artists match “zzz”.').length).toBeGreaterThan(0);
  });

  it('prepopulates the dropdown with the loaded matches', async () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          {
            rows: [row('a', 'Alpha Act', 'Alpha LP'), row('b', 'Bravo Band', 'Bravo LP')],
            nextSkip: null,
          },
        ],
      }) as never
    );
    render(<ArtistsContent />);

    await openSearch();

    // Release titles render only inside the dropdown (the card stub shows
    // names), so their presence proves the suggestion rows populated.
    expect(screen.getByText('Alpha LP')).toBeInTheDocument();
    expect(screen.getByText('Bravo LP')).toBeInTheDocument();
  });

  it('caps the dropdown at eight suggestions', async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      row(`a-${index}`, `Act ${index}`, `LP ${index}`)
    );
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows, nextSkip: null }] }) as never
    );
    render(<ArtistsContent />);

    await openSearch();

    expect(screen.getAllByRole('option')).toHaveLength(8);
  });

  it('fills the field with the picked artist so the grid narrows to them', async () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({
        pages: [{ rows: [row('a', 'Alpha Act', 'Alpha LP')], nextSkip: null }],
      }) as never
    );
    render(<ArtistsContent />);

    await openSearch();
    await userEvent.click(screen.getByText('Alpha LP'));

    expect(useInfinitePublishedArtistsQuery).toHaveBeenLastCalledWith('alpha', 'Alpha Act');
    expect(screen.getByRole('button', { name: 'Search artists' })).toHaveTextContent('Alpha Act');
  });

  it('passes the fetching state to the combobox', async () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ isFetching: true }) as never
    );
    render(<ArtistsContent />);

    await userEvent.type(await openSearch(), 'zzz');

    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });
});

describe('ArtistsContent list', () => {
  it('flattens the loaded pages in order into the card grid', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          { rows: [row('a', 'Alpha')], nextSkip: 24 },
          { rows: [row('b', 'Bravo')], nextSkip: null },
        ],
      }) as never
    );

    render(<ArtistsContent />);

    const cards = screen.getAllByTestId('artist-card');
    expect(cards.map((card) => card.textContent)).toEqual(['Alpha', 'Bravo']);
  });

  it('lays the cards out as a one-column grid that becomes two columns on large screens', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    render(<ArtistsContent />);

    expect(screen.getByRole('list')).toHaveClass('grid', 'grid-cols-1', 'lg:grid-cols-2');
  });

  it('wires the infinite-scroll sentinel to the paging state', () => {
    const fetchNextPage = vi.fn();
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ hasNextPage: true, fetchNextPage }) as never
    );

    render(<ArtistsContent />);

    expect(useInfiniteScroll).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hasNextPage: true, isFetchingNextPage: false, fetchNextPage })
    );
  });

  it('shows a loading-more indicator while fetching the next page', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ hasNextPage: true, isFetchingNextPage: true }) as never
    );

    render(<ArtistsContent />);

    expect(screen.getByText(/loading more artists/i)).toBeInTheDocument();
  });
});

describe('ArtistsContent states', () => {
  it('renders skeletons while the initial page is pending', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ isPending: true, data: undefined }) as never
    );

    render(<ArtistsContent />);

    expect(screen.getByText(/loading artists/i)).toBeInTheDocument();
  });

  it('renders an error state with a retry action', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ error: new Error('boom'), data: undefined, refetch }) as never
    );

    render(<ArtistsContent />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when no artists are published', () => {
    render(<ArtistsContent />);

    expect(screen.getByText('No artists have been published yet.')).toBeInTheDocument();
  });

  it('keeps showing the grid when a refetch errors but data is retained', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({
        error: new Error('boom'),
        pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }],
      }) as never
    );

    render(<ArtistsContent />);

    expect(screen.getByTestId('artist-card')).toBeInTheDocument();
  });

  it('renders the empty state when there is no data yet', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ data: undefined }) as never
    );

    render(<ArtistsContent />);

    expect(screen.getByText('No artists have been published yet.')).toBeInTheDocument();
  });
});
