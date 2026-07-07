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

// Mock the player module (statically imported — next/dynamic would SSR only
// its loading fallback, hiding the LCP cover art from the server HTML) so the
// spec stays lightweight instead of pulling the media-player tree.
vi.mock('./featured-artists-player', () => ({
  FeaturedArtistsPlayer: ({ featuredArtists }: { featuredArtists: unknown[] }) => (
    <div data-testid="featured-artists-player" data-count={featuredArtists.length} />
  ),
}));

vi.mock('./release-headlines', () => ({
  ReleaseHeadlines: () => <aside data-testid="release-headlines" />,
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

  it('renders the player directly so its markup server-renders (LCP discovery)', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    // Static import: next/dynamic server-renders only its loading fallback in
    // the App Router, which kept the LCP cover art out of the server HTML.
    // video.js stays code-split behind MediaPlayer.Controls (LazyControls).
    expect(screen.getByTestId('featured-artists-player')).toBeInTheDocument();
  });

  it('forwards the featured artists to the player', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({
      data: { featuredArtists: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
    });

    render(<HomeContent />);

    expect(screen.getByTestId('featured-artists-player')).toHaveAttribute('data-count', '3');
  });

  it('falls back to an empty featured-artist list when none are returned', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    expect(screen.getByTestId('featured-artists-player')).toHaveAttribute('data-count', '0');
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

  it('reflows the desktop layout: heading atop the headlines column', () => {
    useBannersQueryMock.mockReturnValue({ data: undefined });
    useActiveFeaturedArtistsQueryMock.mockReturnValue({ data: undefined });

    render(<HomeContent />);

    // lg+: the search box keeps clear air above the split, then a
    // two-column grid places the wordmark in the right column's first row
    // (top-aligned with the carousel), the player spanning both rows on
    // the left, and the headlines feed beneath the wordmark. The feed pane
    // scrolls internally, so the wordmark stays put.
    expect(screen.getByTestId('artist-search').parentElement).toHaveClass('lg:mb-8');
    const heading = screen.getByRole('heading', { name: /featured artists/i });
    expect(heading).toHaveClass('lg:col-start-2', 'lg:row-start-1', 'lg:mt-0', 'lg:mb-8');
    const grid = heading.parentElement;
    expect(grid).toHaveClass(
      'lg:grid',
      'lg:grid-cols-2',
      'lg:grid-rows-[auto_1fr]',
      'lg:items-start',
      'lg:gap-x-10'
    );
    const playerCell = screen.getByTestId('featured-artists-player').parentElement;
    expect(playerCell).toHaveClass('lg:col-start-1', 'lg:row-start-1', 'lg:row-span-2');
    const headlinesCell = screen.getByTestId('release-headlines').parentElement;
    expect(headlinesCell).toHaveClass('lg:col-start-2', 'lg:row-start-2');
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
