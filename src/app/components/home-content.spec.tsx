/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen, within } from '@testing-library/react';

import { SPOTLIGHT_COVER_SPAN_CLASS } from '@/utils/spotlight-card';

import { HomeContent } from './home-content';

const useBannersQueryMock = vi.hoisted(() => vi.fn());
const useActiveFeaturedArtistsQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/use-banners-query', () => ({
  useBannersQuery: () => useBannersQueryMock(),
}));

vi.mock('@/hooks/queries/use-active-featured-artists-query', () => ({
  SPOTLIGHT_LIMIT: 12,
  useActiveFeaturedArtistsQuery: () => useActiveFeaturedArtistsQueryMock(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

const newestQuery = vi.hoisted(() => ({
  calls: [] as Array<{ take: number; enabled: boolean | undefined }>,
  rows: undefined as unknown[] | undefined,
}));

vi.mock('@/hooks/queries/use-infinite-published-releases-query', () => ({
  useNewestPublishedReleasesQuery: (take: number, options: { enabled?: boolean } = {}) => {
    newestQuery.calls.push({ take, enabled: options.enabled });
    return { data: options.enabled ? newestQuery.rows : undefined };
  },
}));

vi.mock('./spotlight-grid', () => ({
  SpotlightGrid: ({ cards }: { cards: Array<{ releaseId: string; title: string }> }) => (
    <ul data-testid="spotlight-grid">
      {cards.map((card) => (
        <li key={card.releaseId}>{card.title}</li>
      ))}
    </ul>
  ),
}));

vi.mock('./banner-carousel', () => ({
  BannerCarousel: ({
    banners,
    rotationInterval,
  }: {
    banners: Array<{ slotNumber: number; notification: unknown }>;
    rotationInterval?: number;
  }) => (
    <div
      data-testid="banner-carousel"
      data-count={banners.length}
      data-rotation={String(rotationInterval)}
      data-with-notification={String(banners.some((b) => b.notification !== null))}
    />
  ),
}));

vi.mock('./banner-strip', () => ({
  BannerStrip: ({ banners }: { banners: Array<{ slotNumber: number }> }) => (
    <div data-testid="banner-strip" data-count={banners.length} />
  ),
}));

vi.mock('./artist-nav-search-combobox', () => ({
  ArtistNavSearchCombobox: () => <div data-testid="artist-search" />,
}));

vi.mock('./ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

describe('HomeContent', () => {
  it('renders the featured heading image and search input', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    const headingImage = screen.getByRole('img', { name: /featured artists/i });
    expect(headingImage).toHaveAttribute('src', '/media/headings/FEATURED.webp');
    // Eager (not lazy) so the wordmark doesn't linger as an empty sketch frame
    // after navigation — but not `priority`, which would emit a preload that
    // goes unused below the fold on mobile.
    expect(headingImage).toHaveAttribute('loading', 'eager');
    expect(screen.getByTestId('artist-search')).toBeInTheDocument();
  });

  it('passes an empty banner list when there is no banner data', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    const carousel = screen.getByTestId('banner-carousel');
    expect(carousel).toHaveAttribute('data-count', '0');
    expect(carousel).toHaveAttribute('data-rotation', 'undefined');
  });

  it('passes an empty banner list when the data object has no banners array', () => {
    useBannersQueryMock.mockReturnValue({ data: {} });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: {} });

    render(<HomeContent />);

    expect(screen.getByTestId('banner-carousel')).toHaveAttribute('data-count', '0');
  });

  it('maps banners with and without notifications and forwards the rotation interval', () => {
    useBannersQueryMock.mockReturnValue({
      data: {
        rotationInterval: 7,
        banners: [
          {
            slotNumber: 1,
            imageFilename: 'one.webp',
            notification: {
              id: 'n1',
              content: 'Hello',
              textColor: '#fff',
              backgroundColor: '#000',
            },
          },
          {
            slotNumber: 2,
            imageFilename: 'two.webp',
            notification: null,
          },
        ],
      },
    });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({
      data: { featuredArtists: [{ id: 'a' }, { id: 'b' }] },
    });

    render(<HomeContent />);

    const carousel = screen.getByTestId('banner-carousel');
    expect(carousel).toHaveAttribute('data-count', '2');
    expect(carousel).toHaveAttribute('data-rotation', '7');
    expect(carousel).toHaveAttribute('data-with-notification', 'true');
  });

  it('wraps the content after the banner in a yellow zine panel', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    const panel = screen.getByRole('img', { name: /featured artists/i }).closest('section');
    expect(panel).toHaveAttribute('data-slot', 'zine-panel');
    expect(panel).toHaveClass('zine-accent-yellow');
    expect(panel).toContainElement(screen.getByTestId('artist-search'));
  });

  it('renders both banner treatments so the visible one is correct from first paint', () => {
    useBannersQueryMock.mockReturnValue({
      data: {
        rotationInterval: 5,
        banners: [{ slotNumber: 1, imageFilename: 'one.webp', notification: null }],
      },
    });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    // Both render unconditionally; each component self-gates by breakpoint
    // (asserted in banner-carousel.spec / banner-strip.spec), so CSS picks the
    // visible one with no JS swap.
    expect(screen.getByTestId('banner-carousel')).toBeInTheDocument();
    expect(screen.getByTestId('banner-strip')).toBeInTheDocument();
  });

  describe('the spotlight grid', () => {
    const SPOTLIGHT = {
      id: 'fa-1',
      displayName: 'Spot Artist',
      coverArt: null,
      featuredTrackNumber: null,
      artists: [],
      digitalFormat: null,
      release: {
        id: 'rel-1',
        title: 'Spot Album',
        coverArt: '',
        releasedOn: new Date('2024-01-01T00:00:00Z'),
        images: [],
      },
    };
    const NEWEST = {
      id: 'rel-9',
      title: 'Newest Album',
      coverArt: '',
      releasedOn: new Date('2025-01-01T00:00:00Z'),
      images: [],
      digitalFormats: [],
      albumArtist: null,
    };

    beforeEach(() => {
      newestQuery.calls = [];
      newestQuery.rows = [NEWEST];
      useBannersQueryMock.mockReturnValue({ data: undefined });
    });

    it('stacks the heading, then the search, then the grid inside the panel', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

      render(<HomeContent />);

      const heading = screen.getByRole('heading', { level: 1, name: /featured artists/i });
      const search = screen.getByTestId('artist-search');
      const grid = screen.getByTestId('spotlight-grid');
      expect(
        heading.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(search.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(heading.closest('section')).toContainElement(grid);
    });

    it('lines the search up with the outer edges of the covers in every column count', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

      render(<HomeContent />);

      expect(screen.getByTestId('artist-search').parentElement).toHaveClass(
        ...SPOTLIGHT_COVER_SPAN_CLASS.split(' ')
      );
    });

    it('tells touch screens to tap a cover, between the search and the grid', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [SPOTLIGHT], count: 1 },
      });

      render(<HomeContent />);

      const hint = screen.getByText(/any release art to play or download the music/);
      expect(hint).toHaveTextContent('Tap any release art to play or download the music');
      expect(within(hint).getByText('Tap').tagName).toBe('STRONG');
      expect(
        screen.getByTestId('artist-search').compareDocumentPosition(hint) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        hint.compareDocumentPosition(screen.getByTestId('spotlight-grid')) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it('shows the tap hint on touch screens only, in AA zinc with a bold black "Tap"', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [SPOTLIGHT], count: 1 },
      });

      render(<HomeContent />);

      const hint = screen.getByText(/any release art to play or download the music/);
      expect(hint).toHaveClass('hidden', '[@media(hover:none)]:block', 'text-zinc-600');
      expect(within(hint).getByText('Tap')).toHaveClass('font-bold', 'text-zinc-950');
    });

    it('gives no tap hint while there is no cover to tap', () => {
      newestQuery.rows = undefined;
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [], count: 0 },
      });

      render(<HomeContent />);

      expect(screen.queryByText(/any release art/)).not.toBeInTheDocument();
    });

    it('gives the heading its own line, left-aligned', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

      render(<HomeContent />);

      expect(screen.getByRole('heading', { name: /featured artists/i })).toHaveClass(
        'block',
        'text-left'
      );
    });

    it('fills the grid with the spotlights', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [SPOTLIGHT], count: 1 },
      });

      render(<HomeContent />);

      expect(screen.getByTestId('spotlight-grid')).toHaveTextContent('Spot Album');
    });

    it('never fetches the newest releases while there are spotlights', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [SPOTLIGHT], count: 1 },
      });

      render(<HomeContent />);

      expect(newestQuery.calls.every(({ enabled }) => enabled === false)).toBe(true);
      expect(screen.getByTestId('spotlight-grid')).not.toHaveTextContent('Newest Album');
    });

    it('waits for the spotlights before deciding to fall back', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

      render(<HomeContent />);

      expect(newestQuery.calls.every(({ enabled }) => enabled === false)).toBe(true);
      expect(screen.getByTestId('spotlight-grid')).toBeEmptyDOMElement();
    });

    it('falls back to the twelve newest releases when there is no spotlight', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [], count: 0 },
      });

      render(<HomeContent />);

      expect(newestQuery.calls.at(-1)).toEqual({ take: 12, enabled: true });
      expect(screen.getByTestId('spotlight-grid')).toHaveTextContent('Newest Album');
    });

    it('falls back when no spotlight row can render', () => {
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [{ ...SPOTLIGHT, release: null }], count: 1 },
      });

      render(<HomeContent />);

      expect(screen.getByTestId('spotlight-grid')).toHaveTextContent('Newest Album');
    });

    it('shows an empty grid while the fallback loads', () => {
      newestQuery.rows = undefined;
      useActiveFeaturedArtistsQueryMock.mockReturnValue({
        data: { featuredArtists: [], count: 0 },
      });

      render(<HomeContent />);

      expect(screen.getByTestId('spotlight-grid')).toBeEmptyDOMElement();
    });
  });
});
