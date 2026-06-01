/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
  // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

// FeaturedArtistsPlayer is loaded via next/dynamic — mock the module so the
// loader import resolves to a lightweight stub instead of the video.js bundle.
vi.mock('./featured-artists-player', () => ({
  FeaturedArtistsPlayer: ({ featuredArtists }: { featuredArtists: unknown[] }) => (
    <div data-testid="featured-artists-player" data-count={featuredArtists.length} />
  ),
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
});
