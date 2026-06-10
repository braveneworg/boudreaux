/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import ReactDOM from 'react-dom';

import Home, { dynamic as homeDynamic } from './page';

vi.mock('server-only', () => ({}));

// next/headers returns a Promise in Next.js 15+; the page reads the user-agent to pick a variant width.
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: () => '' }),
}));

// Override setupTests.ts next/server stub to expose userAgentFromString.
vi.mock('next/server', () => ({
  userAgentFromString: () => ({ device: { type: 'desktop' } }),
}));

// Mock TanStack Query SSR utilities — execute each queryFn so coverage sees the arrow functions
const mockPrefetchQuery = vi
  .fn()
  .mockImplementation(async (opts: { queryFn?: () => unknown | Promise<unknown> }) => {
    if (opts.queryFn) {
      // Real prefetchQuery swallows queryFn errors; mirror that so failure
      // branches in the page's queryFns can be exercised.
      try {
        await Promise.resolve(opts.queryFn());
      } catch {
        // ignored — matches TanStack prefetchQuery semantics
      }
    }
  });
const mockDehydratedState = { queries: [], mutations: [] };
const mockGetQueryData = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchQuery: mockPrefetchQuery,
    getQueryData: mockGetQueryData,
  }),
}));

// The page prefetches by calling the services directly (no self-HTTP), so the
// service layer is mocked at the boundary. The prefetchQuery mock above
// executes each queryFn, exercising the success path of both arrows.
const mockGetFeaturedArtists = vi.fn();
const mockGetActiveBanners = vi.fn();

vi.mock('@/lib/services/featured-artists-service', () => ({
  FeaturedArtistsService: {
    getFeaturedArtists: (...args: unknown[]) => mockGetFeaturedArtists(...args),
  },
}));

vi.mock('@/lib/services/banner-notification-service', () => ({
  BannerNotificationService: {
    getActiveBanners: () => mockGetActiveBanners(),
  },
}));

vi.mock('@/lib/utils/attach-stream-urls', () => ({
  attachStreamUrls: <T,>(payload: T): T => payload,
}));

// Mock child components
vi.mock('./components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('./components/home-content', () => ({
  HomeContent: () => <div data-testid="home-content">Home Content</div>,
}));

describe('Home Page', () => {
  beforeEach(() => {
    mockGetQueryData.mockReturnValue(undefined);
    mockGetFeaturedArtists.mockResolvedValue({ success: true, data: [] });
    mockGetActiveBanners.mockResolvedValue({
      success: true,
      data: { banners: [], rotationInterval: 5000 },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opts the home route into dynamic rendering on every request', () => {
    // Required so CloudFront-signed streamUrls aren't baked into a
    // statically-generated HTML response.
    expect(homeDynamic).toBe('force-dynamic');
  });

  it('should render page structure', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('should prefetch featured artists and banners data', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(mockPrefetchQuery).toHaveBeenCalledTimes(2);
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['featuredArtists', 'active'],
      })
    );
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['banners', 'active'],
      })
    );
  });

  it('prefetches via direct service calls with the route response shapes', async () => {
    mockGetFeaturedArtists.mockResolvedValue({
      success: true,
      data: [{ id: 'featured-1' }],
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(mockGetFeaturedArtists).toHaveBeenCalledWith(expect.any(Date), 7);
    expect(mockGetActiveBanners).toHaveBeenCalledTimes(1);

    const calls = mockPrefetchQuery.mock.calls as Array<
      [{ queryKey: string[]; queryFn: () => Promise<unknown> }]
    >;

    const featuredCall = calls.find(([opts]) => opts.queryKey[0] === 'featuredArtists');
    await expect(featuredCall?.[0].queryFn()).resolves.toEqual({
      featuredArtists: [{ id: 'featured-1' }],
      count: 1,
    });

    const bannersCall = calls.find(([opts]) => opts.queryKey[0] === 'banners');
    await expect(bannersCall?.[0].queryFn()).resolves.toEqual({
      banners: [],
      rotationInterval: 5000,
    });
  });

  it('surfaces service failures as queryFn rejections so the client refetches', async () => {
    mockGetFeaturedArtists.mockResolvedValue({ success: false, error: 'Database unavailable' });
    mockGetActiveBanners.mockResolvedValue({ success: false, error: 'Database unavailable' });

    const HomeComponent = await Home();
    render(HomeComponent);

    const calls = mockPrefetchQuery.mock.calls as Array<[{ queryFn: () => Promise<unknown> }]>;
    await expect(calls[0]?.[0].queryFn()).rejects.toThrow('Database unavailable');
    await expect(calls[1]?.[0].queryFn()).rejects.toThrow('Database unavailable');
  });

  it('should render HomeContent within HydrationBoundary', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('home-content')).toBeInTheDocument();
  });

  it('does not emit a manual ReactDOM.preload for the featured-artist cover art', async () => {
    // The FeaturedArtistsPlayer is dynamic-imported with `ssr: false`, so the
    // <img> consumer renders well after window.load and a manual preload would
    // trigger Chrome's "preloaded but not used" warning.
    const preloadSpy = vi.spyOn(ReactDOM, 'preload').mockImplementation(() => undefined);

    mockGetQueryData.mockReturnValue({
      featuredArtists: [
        {
          id: 'featured-1',
          isActive: true,
          sortOrder: 1,
          displayName: 'Jane Doe',
          coverArt: 'https://cdn.example.com/releases/cover.jpg',
          artists: [],
          release: { coverArt: 'https://cdn.example.com/releases/cover.jpg' },
        },
      ],
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(preloadSpy).not.toHaveBeenCalled();
  });
});
