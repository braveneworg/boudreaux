/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

// Import after mocks
import Home from './page';

// Mock server-only to prevent the error
vi.mock('server-only', () => ({}));

// Mock the FeaturedArtistsService
const mockGetFeaturedArtists = vi.fn();
vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getFeaturedArtists: (...args: unknown[]) => mockGetFeaturedArtists(...args),
  },
}));

// Mock the BannerNotificationService
const mockGetActiveBanners = vi.fn();
vi.mock('@/lib/services/banner-notification-service', () => ({
  BannerNotificationService: {
    getActiveBanners: (...args: unknown[]) => mockGetActiveBanners(...args),
  },
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

vi.mock('./components/featured-artists-player', () => ({
  FeaturedArtistsPlayer: () => (
    <div data-testid="featured-artists-player">Featured Artists Player</div>
  ),
}));

vi.mock('./components/banner-carousel', () => ({
  BannerCarousel: () => <div data-testid="banner-carousel">Banner Carousel</div>,
}));

describe('Home Page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default successful mocks
    mockGetFeaturedArtists.mockResolvedValue({
      success: true,
      data: [
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
      ],
    });
    mockGetActiveBanners.mockResolvedValue({
      success: true,
      data: {
        banners: [],
        rotationInterval: 6.5,
      },
    });
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
    mockGetFeaturedArtists.mockResolvedValue({
      success: false,
      error: 'Failed to fetch',
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    // Should still render without crashing
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('featured-artists-player')).toBeInTheDocument();
  });

  it('should render empty array when banners fetch fails', async () => {
    mockGetActiveBanners.mockResolvedValue({
      success: false,
      error: 'Failed to fetch',
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    // Should still render without crashing
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    // Banner carousel should not be rendered
    expect(screen.queryByTestId('banner-carousel')).not.toBeInTheDocument();
  });

  it('should render banner carousel when banners exist', async () => {
    mockGetActiveBanners.mockResolvedValue({
      success: true,
      data: {
        banners: [
          {
            slotNumber: 1,
            imageFilename: 'FFINC Banner 1_5_1920.webp',
            notification: null,
          },
        ],
        rotationInterval: 6.5,
      },
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('banner-carousel')).toBeInTheDocument();
  });

  it('should not render banner carousel when banners array is empty', async () => {
    mockGetActiveBanners.mockResolvedValue({
      success: true,
      data: {
        banners: [],
        rotationInterval: 6.5,
      },
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.queryByTestId('banner-carousel')).not.toBeInTheDocument();
  });
});
