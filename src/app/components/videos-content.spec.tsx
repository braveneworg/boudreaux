/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfinitePublishedVideosQuery } from '@/hooks/use-infinite-published-videos-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { VideosContent } from './videos-content';

vi.mock('@/hooks/use-infinite-published-videos-query', () => ({
  useInfinitePublishedVideosQuery: vi.fn(),
}));

vi.mock('@/hooks/use-infinite-scroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

vi.mock('./video-card', () => ({
  VideoCard: ({ video }: { video: { id: string; title: string } }) => (
    <div data-testid="video-card">{video.title}</div>
  ),
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

beforeEach(() => {
  vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(toInfiniteResult() as never);
});

describe('VideosContent sorting', () => {
  it('defaults to newest-first sort', () => {
    render(<VideosContent />);

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc');
  });

  it('sorts oldest first when that toggle is selected', async () => {
    render(<VideosContent />);

    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('asc');
  });

  it('returns to newest first when that toggle is reselected', async () => {
    render(<VideosContent />);

    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));
    await userEvent.click(screen.getByRole('radio', { name: /newest first/i }));

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc');
  });

  it('keeps the current sort when the selection is cleared', async () => {
    render(<VideosContent />);

    await userEvent.click(screen.getByRole('radio', { name: /newest first/i }));

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc');
  });
});

describe('VideosContent list', () => {
  it('flattens the loaded pages in order', () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          { rows: [{ id: 'a', title: 'Alpha' }], nextSkip: 5 },
          { rows: [{ id: 'b', title: 'Bravo' }], nextSkip: null },
        ],
      }) as never
    );

    render(<VideosContent />);

    const cards = screen.getAllByTestId('video-card');
    expect(cards.map((card) => card.textContent)).toEqual(['Alpha', 'Bravo']);
  });

  it('wires the infinite-scroll sentinel to the paging state', () => {
    const fetchNextPage = vi.fn();
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({ hasNextPage: true, fetchNextPage }) as never
    );

    render(<VideosContent />);

    expect(useInfiniteScroll).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hasNextPage: true, isFetchingNextPage: false, fetchNextPage })
    );
  });

  it('shows a loading-more indicator while fetching the next page', () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({ hasNextPage: true, isFetchingNextPage: true }) as never
    );

    render(<VideosContent />);

    expect(screen.getByText(/loading more videos/i)).toBeInTheDocument();
  });
});

describe('VideosContent states', () => {
  it('renders skeletons while the initial page is pending', () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({ isPending: true, data: undefined }) as never
    );

    render(<VideosContent />);

    expect(screen.getByText(/loading videos/i)).toBeInTheDocument();
  });

  it('renders an error state with a retry action', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({ error: new Error('boom'), data: undefined, refetch }) as never
    );

    render(<VideosContent />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state when there are no videos', () => {
    render(<VideosContent />);

    expect(screen.getByText(/no videos yet/i)).toBeInTheDocument();
  });

  it('keeps showing the list when a refetch errors but data is retained', () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({
        error: new Error('boom'),
        pages: [{ rows: [{ id: 'a', title: 'Alpha' }], nextSkip: null }],
      }) as never
    );

    render(<VideosContent />);

    expect(screen.getByTestId('video-card')).toBeInTheDocument();
  });

  it('renders the empty state when there is no data yet', () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({ data: undefined }) as never
    );

    render(<VideosContent />);

    expect(screen.getByText(/no videos yet/i)).toBeInTheDocument();
  });
});
