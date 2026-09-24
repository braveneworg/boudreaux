/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfinitePublishedArtistsQuery } from '@/hooks/queries/use-infinite-published-artists-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { ArtistsContent } from './artists-content';

import type * as ArtistListCardModule from './artist-list-card';

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

// Stub the card but keep its real exports (the skeleton reads the shared
// photo-frame class from the same module).
vi.mock('./artist-list-card', async (importOriginal) => ({
  ...(await importOriginal<typeof ArtistListCardModule>()),
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

  it('places the sort toggle to the left of the search trigger', () => {
    render(<ArtistsContent />);

    const toggle = screen.getByRole('radiogroup', { name: 'Sort artists' });
    const search = screen.getByRole('button', { name: 'Search artists' });

    expect(toggle.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('stacks the cards in a single column, never in two', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    render(<ArtistsContent />);

    const list = screen.getByRole('list');
    expect(list).toHaveClass('flex', 'flex-col');
    expect(list).not.toHaveClass('lg:grid-cols-2');
  });

  it('spaces the rows 32px apart from the list alone', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    render(<ArtistsContent />);

    const list = screen.getByRole('list');
    expect(list).toHaveClass('gap-8');
    expect(list).not.toHaveClass('gap-4');
  });

  it('gives the toolbar 32px of air above the list', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    const { container } = render(<ArtistsContent />);

    expect(container.firstElementChild).toHaveClass('gap-8');
    expect(container.firstElementChild).not.toHaveClass('gap-6');
  });

  it('runs the cards the full width of the panel', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    render(<ArtistsContent />);

    const list = screen.getByRole('list');
    expect(list).toHaveClass('w-full');
    expect(list).not.toHaveClass('lg:w-3/4');
  });

  it('leaves the toolbar at full panel width so the search bar does not move', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    const { container } = render(<ArtistsContent />);

    const toolbar = container.querySelector('[data-slot="artists-toolbar"]');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).not.toHaveClass('lg:w-3/4');
  });

  it('sizes each sort option to its own label so the longer one cannot overflow', () => {
    render(<ArtistsContent />);

    const newest = screen.getByRole('radio', { name: 'Newest release' });
    expect(newest).toHaveClass('flex-none');
    expect(newest).not.toHaveClass('flex-1');
  });

  it('dresses the sort toggle in the punk-zine frame', () => {
    render(<ArtistsContent />);

    const group = screen.getByRole('radiogroup', { name: 'Sort artists' });
    expect(group).toHaveClass('shadow-zine-ink', 'border-2', 'border-black');
  });

  it('fills the selected sort with the full hot-pink accent, not the soft shade', () => {
    render(<ArtistsContent />);

    // The soft hot-pink (pink-200) is 2.17:1 against the zinc-50 unselected
    // fill — under WCAG 1.4.11's 3:1 — so /artists overrides to the full accent.
    const selected = screen.getByRole('radio', { name: 'A–Z' });
    expect(selected).toHaveClass('data-[state=on]:bg-(--card-accent)');
    expect(selected).not.toHaveClass('data-[state=on]:bg-(--card-accent-soft)');
  });

  it('gives the search field a wider cap than the old narrow default', () => {
    render(<ArtistsContent />);

    const search = screen.getByRole('button', { name: 'Search artists' });
    expect(search).toHaveClass('sm:max-w-md');
    expect(search).not.toHaveClass('sm:max-w-xs');
  });

  it('counts the roster at the toolbar’s right edge', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({
        pages: [{ rows: [row('a', 'Alpha'), row('b', 'Bravo')], nextSkip: null }],
      }) as never
    );

    const { container } = render(<ArtistsContent />);

    const count = container.querySelector('[data-slot="artists-count"]');
    expect(count).toHaveTextContent('2 artists');
    expect(count).toHaveClass('sm:ml-auto');
    expect(container.querySelector('[data-slot="artists-toolbar"]')).toContainElement(
      count as HTMLElement
    );
  });

  it('counts a single artist in the singular', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    const { container } = render(<ArtistsContent />);

    expect(container.querySelector('[data-slot="artists-count"]')).toHaveTextContent('1 artist');
  });

  it('counts the matches, not the roster, while a search narrows the list', async () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: [row('a', 'Alpha')], nextSkip: null }] }) as never
    );

    const { container } = render(<ArtistsContent />);
    await userEvent.type(await openSearch(), 'alp');

    expect(container.querySelector('[data-slot="artists-count"]')).toHaveTextContent(
      '1 match for “alp”'
    );
  });

  it('says how many are showing when more pages remain, since the total is unknown', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({
        pages: [{ rows: [row('a', 'Alpha'), row('b', 'Bravo')], nextSkip: 24 }],
        hasNextPage: true,
      }) as never
    );

    const { container } = render(<ArtistsContent />);

    expect(container.querySelector('[data-slot="artists-count"]')).toHaveTextContent('Showing 2');
  });

  it('shows no count alongside the empty state', () => {
    const { container } = render(<ArtistsContent />);

    expect(container.querySelector('[data-slot="artists-count"]')).not.toBeInTheDocument();
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

  it('shapes the skeleton as the same full-width single column', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ isPending: true, data: undefined }) as never
    );

    const { container } = render(<ArtistsContent />);

    const list = container.querySelector('[data-slot="artists-skeleton-list"]');
    expect(list).toHaveClass('w-full');
    expect(list).not.toHaveClass('lg:w-3/4');
  });

  it('mirrors the card’s photo frame and row spacing in the skeleton so nothing jumps', () => {
    vi.mocked(useInfinitePublishedArtistsQuery).mockReturnValue(
      toInfiniteResult({ isPending: true, data: undefined }) as never
    );

    const { container } = render(<ArtistsContent />);

    const list = container.querySelector('[data-slot="artists-skeleton-list"]');
    const frame = container.querySelector('[data-slot="artists-skeleton-photo"]');
    expect(list).toHaveClass('gap-8');
    expect(frame).toHaveClass('size-32', 'sm:size-44', 'xl:size-48');
    expect(frame?.parentElement).toHaveClass('sm:flex-row', 'p-5', 'sm:p-6');
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
