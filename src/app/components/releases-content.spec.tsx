/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfinitePublishedReleasesQuery } from '@/hooks/queries/use-infinite-published-releases-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { ReleasesContent } from './releases-content';

vi.mock('@/hooks/queries/use-infinite-published-releases-query', () => ({
  useInfinitePublishedReleasesQuery: vi.fn(),
}));

vi.mock('@/hooks/use-infinite-scroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

// Stub the row — covered by release-list-row.spec. The content island's job is
// paging, states, and the list chrome around the rows.
vi.mock('./release-list-row', () => ({
  ReleaseListRow: ({ release }: { release: { id: string; title: string } }) => (
    <div data-testid="release-list-row">{release.title}</div>
  ),
}));

vi.mock('./release-search-combobox', () => ({
  ReleaseSearchCombobox: () => <div data-testid="release-search-combobox" />,
}));

interface InfiniteResultOverrides {
  pages?: Array<{ rows: Array<{ id: string; title: string }>; nextSkip: number | null }>;
  isPending?: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  refetch?: () => void;
  data?: unknown;
}

const toInfiniteResult = (overrides: InfiniteResultOverrides = {}) => {
  const { pages, data, ...rest } = overrides;
  return {
    data: 'data' in overrides ? data : { pages: pages ?? [{ rows: [], nextSkip: null }] },
    isPending: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    ...rest,
  };
};

const twoRows = [
  { id: 'release-1', title: 'Midnight Serenade' },
  { id: 'release-2', title: 'Dawn Chorus' },
];

beforeEach(() => {
  vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(toInfiniteResult() as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReleasesContent', () => {
  it('shows a row-shaped loading skeleton while the first page is pending', () => {
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ isPending: true, data: undefined }) as never
    );

    render(<ReleasesContent />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading releases…');
    expect(screen.queryByTestId('release-list-row')).not.toBeInTheDocument();
  });

  it('shows an error state whose retry refetches in place', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ error: Error('boom'), data: undefined, refetch }) as never
    );

    render(<ReleasesContent />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when no releases are published', () => {
    render(<ReleasesContent />);

    expect(screen.getByText('No releases available.')).toBeInTheDocument();
  });

  it('renders one row per release inside a dashed-divided list', () => {
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: twoRows, nextSkip: null }] }) as never
    );

    const { container } = render(<ReleasesContent />);

    expect(screen.getAllByTestId('release-list-row')).toHaveLength(2);
    expect(container.querySelector('ul')).toHaveClass('divide-y-2', 'divide-dashed');
  });

  it('keeps the search combobox above the rows', () => {
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ pages: [{ rows: twoRows, nextSkip: null }] }) as never
    );

    render(<ReleasesContent />);

    const combobox = screen.getByTestId('release-search-combobox');
    const firstRow = screen.getAllByTestId('release-list-row')[0];
    const ordering = combobox.compareDocumentPosition(firstRow);
    expect(ordering & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('announces when the next page is loading', () => {
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({
        pages: [{ rows: twoRows, nextSkip: 24 }],
        hasNextPage: true,
        isFetchingNextPage: true,
      }) as never
    );

    render(<ReleasesContent />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading more releases…');
  });

  it('wires the sentinel to the infinite scroll hook', () => {
    const fetchNextPage = vi.fn();
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({
        pages: [{ rows: twoRows, nextSkip: 24 }],
        hasNextPage: true,
        fetchNextPage,
      }) as never
    );

    render(<ReleasesContent />);

    expect(vi.mocked(useInfiniteScroll)).toHaveBeenCalledWith(
      expect.objectContaining({ current: expect.any(HTMLElement) }),
      expect.objectContaining({ hasNextPage: true, fetchNextPage })
    );
  });
});
