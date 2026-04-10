/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

// Import after mocks
import Home from './page';

// Mock server-only to prevent the error
vi.mock('server-only', () => ({}));

// Mock getInternalApiUrl to return predictable URLs
vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: vi.fn((path: string) => Promise.resolve(`http://test-host${path}`)),
}));

// Mock UI components
vi.mock('./components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('./components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('./components/ui/heading', () => ({
  Heading: ({
    children,
    level,
    ...props
  }: {
    children: React.ReactNode;
    level: number;
    className?: string;
  }) => {
    const HeadingTag =
      level === 1
        ? 'h1'
        : level === 2
          ? 'h2'
          : level === 3
            ? 'h3'
            : level === 4
              ? 'h4'
              : level === 5
                ? 'h5'
                : 'h6';
    return React.createElement(HeadingTag, props, children);
  },
}));

vi.mock('./components/featured-artists-player-client', () => ({
  FeaturedArtistsPlayerClient: () => (
    <div data-testid="featured-artists-player">Featured Artists Player</div>
  ),
}));

vi.mock('./components/artist-search-input', () => ({
  ArtistSearchInput: () => <div data-testid="artist-search-input">Search</div>,
}));

vi.mock('./components/banner-carousel', () => ({
  BannerCarousel: () => <div data-testid="banner-carousel">Banner Carousel</div>,
}));

const mockFeaturedArtists = [
  {
    id: '1',
    displayName: 'Test Artist',
    coverArt: 'https://example.com/cover.jpg',
    artists: [{ id: 'a1', displayName: 'Artist One' }],
    digitalFormat: {
      id: 'df1',
      files: [
        {
          id: 'f1',
          trackNumber: 1,
          title: 'Test Track',
          fileName: 'test.mp3',
          s3Key: 'audio/test.mp3',
          duration: 180,
        },
      ],
    },
  },
];

const createFetchMock = (
  featuredArtistsResponse: { ok: boolean; json: () => Promise<unknown> },
  bannersResponse: { ok: boolean; json: () => Promise<unknown> }
) =>
  vi.fn((url: string) => {
    if (typeof url === 'string' && url.includes('/api/featured-artists')) {
      return Promise.resolve(featuredArtistsResponse);
    }
    if (typeof url === 'string' && url.includes('/api/notification-banners')) {
      return Promise.resolve(bannersResponse);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });

describe('Home Page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: successful fetch responses
    global.fetch = createFetchMock(
      {
        ok: true,
        json: () => Promise.resolve({ featuredArtists: mockFeaturedArtists }),
      },
      {
        ok: true,
        json: () =>
          Promise.resolve({
            banners: [],
            rotationInterval: 6.5,
          }),
      }
    ) as unknown as typeof fetch;
  });

  it('should render page structure', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render featured artists heading', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByRole('heading', { name: 'featured artists' })).toBeInTheDocument();
  });

  it('should render featured artists player', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    await waitFor(() => {
      expect(screen.getByTestId('featured-artists-player')).toBeInTheDocument();
    });
  });

  it('should have proper heading hierarchy', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    const heading = screen.getByRole('heading', { name: 'featured artists' });
    expect(heading.tagName).toBe('H1');
  });

  it('should render empty array when featuredArtists fetch fails', async () => {
    global.fetch = createFetchMock(
      { ok: false, json: () => Promise.resolve({}) },
      {
        ok: true,
        json: () => Promise.resolve({ banners: [], rotationInterval: 6.5 }),
      }
    ) as unknown as typeof fetch;

    const HomeComponent = await Home();
    render(HomeComponent);

    // Should still render without crashing
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('featured-artists-player')).toBeInTheDocument();
  });

  it('should render empty array when banners fetch fails', async () => {
    global.fetch = createFetchMock(
      {
        ok: true,
        json: () => Promise.resolve({ featuredArtists: mockFeaturedArtists }),
      },
      { ok: false, json: () => Promise.resolve({}) }
    ) as unknown as typeof fetch;

    const HomeComponent = await Home();
    render(HomeComponent);

    // Should still render without crashing
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    // Banner carousel should not be rendered
    expect(screen.queryByTestId('banner-carousel')).not.toBeInTheDocument();
  });

  it('should render banner carousel when banners exist', async () => {
    global.fetch = createFetchMock(
      {
        ok: true,
        json: () => Promise.resolve({ featuredArtists: mockFeaturedArtists }),
      },
      {
        ok: true,
        json: () =>
          Promise.resolve({
            banners: [
              {
                slotNumber: 1,
                imageFilename: 'FFINC Banner 1_5_1920.webp',
                notification: null,
              },
            ],
            rotationInterval: 6.5,
          }),
      }
    ) as unknown as typeof fetch;

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('banner-carousel')).toBeInTheDocument();
  });

  it('should not render banner carousel when banners array is empty', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.queryByTestId('banner-carousel')).not.toBeInTheDocument();
  });
});
