/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';

import { HomeContent } from './home-content';

const useBannersQueryMock = vi.hoisted(() => vi.fn());
const useActiveFeaturedArtistsQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-banners-query', () => ({
  useBannersQuery: () => useBannersQueryMock(),
}));

vi.mock('@/app/hooks/use-active-featured-artists-query', () => ({
  useActiveFeaturedArtistsQuery: () => useActiveFeaturedArtistsQueryMock(),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

// FeaturedArtistsPlayer is loaded via next/dynamic — mock the module so the
// loader import resolves to a lightweight stub instead of the video.js bundle.
vi.mock('./featured-artists-player', () => ({
  FeaturedArtistsPlayer: ({ featuredArtists }: { featuredArtists: unknown[] }) => (
    <div data-testid="featured-artists-player" data-count={featuredArtists.length} />
  ),
}));

vi.mock('./release-headlines', () => ({
  ReleaseHeadlines: () => <aside data-testid="release-headlines" />,
}));

// Drive next/dynamic synchronously: exercise the loader (so the dynamic import
// arrow + its `.then` mapper are covered) and the `loading` placeholder branch.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, options?: { loading?: () => React.ReactNode }) => {
    void loader();
    const Dynamic = (props: { featuredArtists: unknown[] }) => (
      <div data-testid="dynamic-featured">
        {options?.loading?.()}
        <span data-testid="featured-count">{props.featuredArtists.length}</span>
      </div>
    );
    return Dynamic;
  },
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

vi.mock('./artist-search-input', () => ({
  ArtistSearchInput: () => <div data-testid="artist-search" />,
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

  it('forwards the featured artists to the player', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({
      data: { featuredArtists: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    });

    render(<HomeContent />);

    expect(screen.getByTestId('featured-count')).toHaveTextContent('3');
  });

  it('falls back to an empty featured-artist list when none are returned', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    expect(screen.getByTestId('featured-count')).toHaveTextContent('0');
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

  it('gives the landing heading extra breathing room', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    // Landing-only: the wordmark separates the search field from the player,
    // so it gets more air than the default tight heading margins — slightly
    // more above than below, tying it to the player it titles.
    const heading = screen.getByRole('heading', { name: /featured artists/i });
    expect(heading).toHaveClass('mt-8', 'mb-6');
  });

  it('reflows the desktop layout: heading first, player beside headlines', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    // lg+: CSS order lifts the wordmark above the search field (tighter
    // vertical air), the search box gets a clear margin before the split,
    // and the player shares a two-column grid with the release headlines.
    const heading = screen.getByRole('heading', { name: /featured artists/i });
    expect(heading).toHaveClass('lg:order-first', 'lg:mt-0', 'lg:mb-3');
    expect(screen.getByTestId('artist-search').parentElement).toHaveClass('lg:mb-8');
    const grid = screen.getByTestId('release-headlines').parentElement;
    expect(grid).toHaveClass('lg:grid', 'lg:grid-cols-2', 'lg:gap-10');
    expect(grid).toContainElement(screen.getByTestId('dynamic-featured'));
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
});
