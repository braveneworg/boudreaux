/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfinitePublishedReleasesQuery } from '@/hooks/queries/use-infinite-published-releases-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import {
  SPOTLIGHT_COVER_SPAN_CLASS,
  SPOTLIGHT_GRID_CLASS,
  type SpotlightCard as SpotlightCardData,
} from '@/utils/spotlight-card';

import { ReleasesContent, ReleasesSkeleton } from './releases-content';

vi.mock('@/hooks/queries/use-infinite-published-releases-query', () => ({
  useInfinitePublishedReleasesQuery: vi.fn(),
}));

vi.mock('@/hooks/use-infinite-scroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

// Stub the card — covered by spotlight-card.spec. The content island's job is
// paging, states, the layout around the grid, and what each card is given.
vi.mock('./spotlight-card', () => ({
  SpotlightCard: ({
    card,
    caption,
    accent,
  }: {
    card: SpotlightCardData;
    caption?: string;
    accent?: string;
  }) => (
    <div
      data-testid="spotlight-card"
      data-release-id={card.releaseId}
      data-caption={caption ?? ''}
      data-accent={accent ?? ''}
    >
      {card.title}
    </div>
  ),
}));

vi.mock('./release-search-combobox', () => ({
  ReleaseSearchCombobox: () => <div data-testid="release-search-combobox" />,
}));

interface InfiniteResultOverrides {
  pages?: Array<{ rows: PublishedReleaseListing[]; nextSkip: number | null }>;
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

const makeRow = (id: string, title: string): PublishedReleaseListing =>
  ({
    id,
    title,
    coverArt: `/media/releases/${id}/cover.jpg`,
    releasedOn: new Date('2024-05-01T00:00:00Z'),
    images: [],
    digitalFormats: [{ files: [{ s3Key: `audio/${id}.mp3` }] }],
    albumArtist: null,
  }) as unknown as PublishedReleaseListing;

const twoRows = [makeRow('release-1', 'Midnight Serenade'), makeRow('release-2', 'Dawn Chorus')];

const mockPages = (pages: InfiniteResultOverrides['pages']): void => {
  vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
    toInfiniteResult({ pages }) as never
  );
};

const releasesHeading = (): HTMLElement =>
  screen.getByRole('heading', { level: 1, name: 'releases' });

const TAP_HINT = /any release art to play or download the music/;

beforeEach(() => {
  vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(toInfiniteResult() as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReleasesContent', () => {
  it('shows the grid-shaped loading skeleton while the first page is pending', () => {
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ isPending: true, data: undefined }) as never
    );

    render(<ReleasesContent />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading releases…');
    expect(screen.getByTestId('releases-grid-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('spotlight-card')).not.toBeInTheDocument();
  });

  it('shows an error state whose retry refetches in place', async () => {
    const refetch = vi.fn();
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ error: Error('boom'), data: undefined, refetch }) as never
    );

    render(<ReleasesContent />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the search and the heading above the error state', () => {
    vi.mocked(useInfinitePublishedReleasesQuery).mockReturnValue(
      toInfiniteResult({ error: Error('boom'), data: undefined }) as never
    );

    render(<ReleasesContent />);

    const error = screen.getByText('Unable to load releases. Please try again later.');
    expect(
      releasesHeading().compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId('release-search-combobox')).toBeInTheDocument();
  });

  it('shows the empty state, with no grid and no tap hint, when no releases are published', () => {
    render(<ReleasesContent />);

    expect(screen.getByText('No releases available.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(TAP_HINT)).not.toBeInTheDocument();
  });

  it('renders one card per release, in order, as the items of the shared cover grid', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    const grid = screen.getByRole('list');
    expect(grid).toHaveAttribute('class', SPOTLIGHT_GRID_CLASS);
    const items = within(grid).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByTestId('spotlight-card').textContent)).toEqual([
      'Midnight Serenade',
      'Dawn Chorus',
    ]);
  });

  it('renders every loaded page, with no cap on the card count', () => {
    const rows = Array.from({ length: 14 }, (_, index) =>
      makeRow(`release-${index}`, `Album ${index}`)
    );
    mockPages([
      { rows: rows.slice(0, 10), nextSkip: 10 },
      { rows: rows.slice(10), nextSkip: null },
    ]);

    render(<ReleasesContent />);

    expect(screen.getAllByTestId('spotlight-card')).toHaveLength(14);
  });

  it('builds each card from its release', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    expect(
      screen.getAllByTestId('spotlight-card').map((card) => card.getAttribute('data-release-id'))
    ).toEqual(['release-1', 'release-2']);
  });

  it('captions each card with the title alone', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    screen.getAllByTestId('spotlight-card').forEach((card) => {
      expect(card).toHaveAttribute('data-caption', 'title');
    });
  });

  it('opens each card in the page’s cyan accent', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    screen.getAllByTestId('spotlight-card').forEach((card) => {
      expect(card).toHaveAttribute('data-accent', 'cyan');
    });
  });

  it('stacks the search, then the heading, then the grid', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    const search = screen.getByTestId('release-search-combobox');
    const heading = releasesHeading();
    const grid = screen.getByRole('list');
    expect(search.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the search and the heading in one column spanning the outer cover edges', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    const column = screen.getByTestId('release-search-combobox').parentElement;
    expect(releasesHeading().parentElement).toBe(column);
    expect(column).toHaveClass(...SPOTLIGHT_COVER_SPAN_CLASS.split(' '));
    expect(column?.parentElement).toHaveClass('mb-8');
  });

  it('sets the heading like the home wordmark: its own line, left-aligned, ink on the edge', () => {
    render(<ReleasesContent />);

    expect(releasesHeading()).toHaveClass('mt-7', 'mb-0', '-ml-1.5', 'block', 'text-left');
  });

  it('shows the heading as the RELEASES wordmark at the shared zine strip scale', () => {
    render(<ReleasesContent />);

    const wordmark = within(releasesHeading()).getByRole('img', { name: 'releases' });
    expect(wordmark).toHaveAttribute('src', '/media/headings/RELEASES.webp');
    expect(wordmark).toHaveClass('h-auto', 'w-full', 'sm:h-14', 'sm:w-auto');
  });

  it('tells touch screens to tap a cover, between the heading and the grid', () => {
    mockPages([{ rows: twoRows, nextSkip: null }]);

    render(<ReleasesContent />);

    const hint = screen.getByText(TAP_HINT);
    expect(hint).toHaveTextContent('Tap any release art to play or download the music');
    expect(hint).toHaveClass('hidden', '[@media(hover:none)]:block', 'text-zinc-600');
    expect(within(hint).getByText('Tap')).toHaveClass('font-bold', 'text-zinc-950');
    expect(
      releasesHeading().compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      hint.compareDocumentPosition(screen.getByRole('list')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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

  it('puts the infinite-scroll sentinel after the grid', () => {
    mockPages([{ rows: twoRows, nextSkip: 24 }]);

    render(<ReleasesContent />);

    const [sentinelRef] = vi.mocked(useInfiniteScroll).mock.calls.at(-1) ?? [];
    const sentinel = sentinelRef?.current;
    expect(sentinel).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByRole('list').compareDocumentPosition(sentinel as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
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

describe('ReleasesSkeleton', () => {
  it('announces the load to assistive tech and marks itself busy', () => {
    render(<ReleasesSkeleton />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading releases…');
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-busy', 'true');
  });

  it('holds a search bar, then a heading block, in the cover-span column', () => {
    render(<ReleasesSkeleton />);

    const search = screen.getByTestId('releases-search-skeleton');
    const heading = screen.getByTestId('releases-heading-skeleton');
    expect(search.parentElement).toBe(heading.parentElement);
    expect(search.parentElement).toHaveClass(...SPOTLIGHT_COVER_SPAN_CLASS.split(' '));
    expect(search.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The wordmark's box: a full-width 4:1 image below `sm`, h-14 by 224px from `sm`.
    expect(heading).toHaveClass('aspect-[4/1]', 'w-full', 'sm:h-14', 'sm:w-56');
  });

  it('lays the cover skeletons out in the shared one, two, four column grid', () => {
    render(<ReleasesSkeleton />);

    const grid = screen.getByTestId('releases-grid-skeleton');
    expect(grid).toHaveAttribute('class', SPOTLIGHT_GRID_CLASS);
    expect(
      screen.getByTestId('releases-heading-skeleton').compareDocumentPosition(grid) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('gives each card skeleton a square cover over one centered caption line', () => {
    render(<ReleasesSkeleton />);

    const cards = screen.getAllByTestId('releases-card-skeleton');
    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      expect(card).toHaveClass('mx-auto', 'w-full', 'sm:max-w-52');
      expect(card.children).toHaveLength(2);
      expect(card.firstElementChild).toHaveClass('aspect-square', 'w-full');
      expect(card.lastElementChild).toHaveClass('mx-auto', 'h-4');
    });
  });
});
