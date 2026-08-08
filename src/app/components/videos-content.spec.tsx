/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfinitePublishedVideosQuery } from '@/hooks/queries/use-infinite-published-videos-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

import { VideosContent } from './videos-content';

vi.mock('@/hooks/queries/use-infinite-published-videos-query', () => ({
  useInfinitePublishedVideosQuery: vi.fn(),
}));

vi.mock('@/hooks/use-infinite-scroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

// Pass-through debounce: the component's wiring is under test here; the
// debounce timing itself is covered by use-debounce's own spec.
vi.mock('@/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));

vi.mock('./video-card', () => ({
  VideoCard: ({ video }: { video: { id: string; title: string } }) => (
    <div data-testid="video-card">{video.title}</div>
  ),
}));

vi.mock('@/lib/utils/cdn-url', () => ({
  resolveStreamUrl: vi.fn(() => 'https://cdn.example.com/resolved.mp4'),
}));

// Sentinel modal: captures the props the listing wires into the enlarged
// player for a picked suggestion, without exercising Radix or video.js.
const dialogProps = vi.hoisted(
  (): {
    open?: boolean;
    title?: string;
    artist?: string;
    src?: string;
    onOpenChange?: (open: boolean) => void;
    takeMediaEl?: () => HTMLVideoElement | null;
  } => ({})
);
vi.mock('@/components/ui/video/video-play-dialog', () => ({
  VideoPlayDialog: (props: {
    open: boolean;
    title: string;
    artist: string;
    src: string;
    onOpenChange: (open: boolean) => void;
    takeMediaEl: () => HTMLVideoElement | null;
  }) => {
    Object.assign(dialogProps, props);
    return props.open ? <div data-testid="play-dialog">{`dialog:${props.title}`}</div> : null;
  },
}));

interface InfiniteResultOverrides {
  pages?: Array<{
    rows: Array<{ id: string; title: string; artist?: string; posterUrl?: string | null }>;
    nextSkip: number | null;
  }>;
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VideosContent sorting', () => {
  it('defaults to newest-first sort', () => {
    render(<VideosContent />);

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc', '');
  });

  it('sorts oldest first when that toggle is selected', async () => {
    render(<VideosContent />);

    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('asc', '');
  });

  it('returns to newest first when that toggle is reselected', async () => {
    render(<VideosContent />);

    await userEvent.click(screen.getByRole('radio', { name: /oldest first/i }));
    await userEvent.click(screen.getByRole('radio', { name: /newest first/i }));

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc', '');
  });

  it('keeps the current sort when the selection is cleared', async () => {
    render(<VideosContent />);

    await userEvent.click(screen.getByRole('radio', { name: /newest first/i }));

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc', '');
  });
});

/** Open the search combobox and return its typing input. */
const openSearch = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: 'Search videos' }));
  return screen.getByPlaceholderText('Search by title or artist');
};

describe('VideosContent search', () => {
  it('renders a labelled search combobox trigger', () => {
    render(<VideosContent />);

    expect(screen.getByRole('button', { name: 'Search videos' })).toBeInTheDocument();
  });

  it('places the search trigger before the sort toggle', () => {
    render(<VideosContent />);

    const search = screen.getByRole('button', { name: 'Search videos' });
    const toggle = screen.getByRole('radiogroup', { name: /sort videos by release date/i });

    expect(search.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('forwards the typed search term to the query', async () => {
    render(<VideosContent />);

    await userEvent.type(await openSearch(), 'basement');

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc', 'basement');
  });

  it('trims the search term before querying', async () => {
    render(<VideosContent />);

    await userEvent.type(await openSearch(), '  Rock ');

    expect(useInfinitePublishedVideosQuery).toHaveBeenLastCalledWith('desc', 'Rock');
  });

  it('shows a no-match message when a search returns nothing', async () => {
    render(<VideosContent />);

    await userEvent.type(await openSearch(), 'zzz');

    expect(screen.getAllByText(/no videos match/i).length).toBeGreaterThan(0);
  });

  it('prepopulates the dropdown with the loaded matches', async () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          {
            rows: [
              { id: 'a', title: 'Alpha Session', artist: 'Artist One' },
              { id: 'b', title: 'Bravo Live', artist: 'Artist Two' },
            ],
            nextSkip: null,
          },
        ],
      }) as never
    );
    render(<VideosContent />);

    await openSearch();

    // Artists render only inside the dropdown (the card stub shows titles),
    // so their presence proves the suggestion rows populated.
    expect(screen.getByText('Artist One')).toBeInTheDocument();
    expect(screen.getByText('Artist Two')).toBeInTheDocument();
  });

  it('opens the play modal for a selected suggestion', async () => {
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          { rows: [{ id: 'a', title: 'Alpha Session', artist: 'Artist One' }], nextSkip: null },
        ],
      }) as never
    );
    render(<VideosContent />);

    await openSearch();
    await userEvent.click(screen.getByText('Artist One'));

    expect(screen.getByTestId('play-dialog')).toHaveTextContent('dialog:Alpha Session');
    expect(dialogProps.src).toBe('https://cdn.example.com/resolved.mp4');
  });

  it('starts gesture playback of the selection inside the click', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          { rows: [{ id: 'a', title: 'Alpha Session', artist: 'Artist One' }], nextSkip: null },
        ],
      }) as never
    );
    render(<VideosContent />);

    await openSearch();
    await userEvent.click(screen.getByText('Artist One'));

    expect(playSpy).toHaveBeenCalledTimes(1);
    const primedEl = playSpy.mock.instances[0] as HTMLVideoElement;
    expect(primedEl.getAttribute('src')).toBe('https://cdn.example.com/resolved.mp4');
  });

  it('stops an unclaimed primed element when the modal closes', async () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    vi.mocked(useInfinitePublishedVideosQuery).mockReturnValue(
      toInfiniteResult({
        pages: [
          { rows: [{ id: 'a', title: 'Alpha Session', artist: 'Artist One' }], nextSkip: null },
        ],
      }) as never
    );
    render(<VideosContent />);
    await openSearch();
    await userEvent.click(screen.getByText('Artist One'));
    pauseSpy.mockClear();

    act(() => dialogProps.onOpenChange?.(false));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
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
