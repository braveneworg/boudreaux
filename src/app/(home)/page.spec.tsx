/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

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
const mockPrefetchInfiniteQuery = vi
  .fn()
  .mockImplementation(async (opts: { queryFn?: () => unknown | Promise<unknown> }) => {
    if (opts.queryFn) {
      // Same error-swallowing semantics as prefetchQuery above.
      try {
        await Promise.resolve(opts.queryFn());
      } catch {
        // ignored — matches TanStack prefetchInfiniteQuery semantics
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
    prefetchInfiniteQuery: mockPrefetchInfiniteQuery,
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

const mockGetPublishedReleases = vi.fn();

vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getPublishedReleases: (...args: unknown[]) => mockGetPublishedReleases(...args),
  },
}));

vi.mock('@/lib/utils/attach-stream-urls', () => ({
  attachStreamUrls: <T,>(payload: T): T => payload,
}));

// Mock child components
vi.mock('@/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/components/home-content', () => ({
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
    mockGetPublishedReleases.mockResolvedValue({ success: true, data: [] });
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

  it('prefetches the first published-releases page for the landing headlines', async () => {
    mockGetPublishedReleases.mockResolvedValue({
      success: true,
      data: [{ id: 'release-1', title: 'Landing Release' }],
    });

    render(await Home());

    // Same query key + page param as useInfinitePublishedReleasesQuery('') in
    // ReleaseHeadlines, so the desktop headlines column hydrates server-filled
    // instead of popping in after a client API roundtrip.
    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['releases', 'publishedInfinite', ''],
        initialPageParam: 0,
      })
    );
    expect(mockGetPublishedReleases).toHaveBeenCalledWith({ skip: 0, take: 24 });

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({
      rows: [{ id: 'release-1', title: 'Landing Release' }],
      nextSkip: null,
    });
  });

  it('falls back to an empty first page when the releases service fails', async () => {
    mockGetPublishedReleases.mockResolvedValue({ success: false, error: 'Database unavailable' });

    render(await Home());

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [], nextSkip: null });
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

  describe('mobile banner preload', () => {
    const seedFirstBanner = () =>
      mockGetQueryData.mockImplementation((key: string[]) =>
        key[0] === 'banners'
          ? {
              banners: [{ slotNumber: 1, imageFilename: 'hero-banner.jpg', notification: null }],
              rotationInterval: 5000,
            }
          : undefined
      );

    it('emits an image preload link for the first banner slot', async () => {
      seedFirstBanner();

      render(await Home());

      const preload = document.querySelector('link[rel="preload"][as="image"]');
      expect(preload).not.toBeNull();
    });

    it('scopes the preload to the mobile breakpoint so desktop never fetches it', async () => {
      seedFirstBanner();

      render(await Home());

      const preload = document.querySelector('link[rel="preload"][as="image"]');
      expect(preload?.getAttribute('media')).toBe('(max-width: 767.98px)');
    });

    it('builds the srcset from the first banner filename', async () => {
      seedFirstBanner();

      render(await Home());

      const preload = document.querySelector('link[rel="preload"][as="image"]');
      expect(preload?.getAttribute('imagesrcset')).toContain('hero-banner');
    });

    it('emits no preload link when no banners are cached', async () => {
      mockGetQueryData.mockReturnValue(undefined);

      render(await Home());

      expect(document.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    });
  });

  describe('desktop cover-art preload', () => {
    const coverPreloadSelector = 'link[rel="preload"][as="image"][media="(min-width: 1024px)"]';

    const seedFeaturedArtists = (artists: unknown[]) =>
      mockGetQueryData.mockImplementation((key: string[]) =>
        key[0] === 'featuredArtists'
          ? { featuredArtists: artists, count: artists.length }
          : undefined
      );

    it('emits a desktop-scoped, high-priority preload for the first cover art', async () => {
      seedFeaturedArtists([
        {
          id: 'featured-1',
          displayName: 'Jane Doe',
          coverArt: '/media/releases/abc/cover.jpg',
          artists: [],
        },
      ]);

      render(await Home());

      // The player SSRs, so the selected artist's cover art — the desktop LCP
      // element — is fetchable as soon as the HTML arrives. `lg` is where the
      // grid split puts it above the fold; below that it stays lazy.
      const preload = document.querySelector(coverPreloadSelector);
      expect(preload).not.toBeNull();
      expect(preload?.getAttribute('imagesrcset')).toContain(
        '/media/releases/abc/cover_w640.webp 640w'
      );
      expect(preload?.getAttribute('imagesizes')).toBe('576px');
      expect(preload?.getAttribute('fetchpriority')).toBe('high');
    });

    it('targets the first artist with a displayable name (matching player selection)', async () => {
      seedFeaturedArtists([
        // No displayName and no connected artists → the player filters it out,
        // so the preload must skip it too.
        { id: 'featured-0', coverArt: '/media/releases/skipped/cover.jpg', artists: [] },
        {
          id: 'featured-1',
          displayName: 'Jane Doe',
          coverArt: '/media/releases/selected/cover.jpg',
          artists: [],
        },
      ]);

      render(await Home());

      const preload = document.querySelector(coverPreloadSelector);
      expect(preload?.getAttribute('imagesrcset')).toContain('/media/releases/selected/');
      expect(preload?.getAttribute('imagesrcset')).not.toContain('/media/releases/skipped/');
    });

    it('emits no cover preload when the cover art is a data: URI', async () => {
      seedFeaturedArtists([
        {
          id: 'featured-1',
          displayName: 'Jane Doe',
          coverArt: 'data:image/webp;base64,AAAA',
          artists: [],
        },
      ]);

      render(await Home());

      expect(document.querySelector(coverPreloadSelector)).toBeNull();
    });

    it('emits no cover preload when no featured artists are cached', async () => {
      mockGetQueryData.mockReturnValue(undefined);

      render(await Home());

      expect(document.querySelector(coverPreloadSelector)).toBeNull();
    });
  });
});
