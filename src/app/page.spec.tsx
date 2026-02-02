import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

// Import after mocks
import Home from './page';

// Mock server-only to prevent the error
vi.mock('server-only', () => ({}));

// Mock the FeaturedArtistsService
vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getFeaturedArtists: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          id: '1',
          displayName: 'Test Artist',
          coverArt: 'https://example.com/cover.jpg',
          artists: [{ id: 'a1', displayName: 'Artist One' }],
          track: { id: 't1', title: 'Test Track', audioUrl: 'https://example.com/audio.mp3' },
        },
      ],
    }),
  },
}));

// Mock the NotificationBannerService
vi.mock('@/lib/services/notification-banner-service', () => ({
  NotificationBannerService: {
    getActiveNotificationBanners: vi.fn().mockResolvedValue({
      success: true,
      data: [],
    }),
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

vi.mock('./components/notification-banner', () => ({
  NotificationBanner: () => <div data-testid="notification-banner">Notification Banner</div>,
}));

describe('Home Page', () => {
  it('should render page structure', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render featured artists heading', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByRole('heading', { name: 'Featured artists' })).toBeInTheDocument();
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

    const heading = screen.getByRole('heading', { name: 'Featured artists' });
    expect(heading.tagName).toBe('H1');
  });
});
