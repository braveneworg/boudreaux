/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { SPOTLIGHT_COVER_SIZES } from '@/lib/utils/spotlight-card';

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

    expect(mockGetFeaturedArtists).toHaveBeenCalledWith(expect.any(Date), 12);
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

  describe('newest-releases fallback', () => {
    const SPOTLIGHT = {
      id: 'featured-1',
      displayName: 'Jane Doe',
      coverArt: '/media/releases/abc/cover.jpg',
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

    const seedSpotlights = (featuredArtists: unknown[] | undefined) =>
      mockGetQueryData.mockImplementation((key: string[]) =>
        key[0] === 'featuredArtists' && featuredArtists
          ? { featuredArtists, count: featuredArtists.length }
          : undefined
      );

    const fallbackCall = () =>
      (
        mockPrefetchQuery.mock.calls as Array<
          [{ queryKey: unknown[]; queryFn: () => Promise<unknown> }]
        >
      ).find(([opts]) => opts.queryKey[1] === 'newestPublished');

    it('never prefetches the infinite headlines feed', async () => {
      render(await Home());

      expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled();
    });

    it('does not prefetch the newest releases while there are spotlights', async () => {
      seedSpotlights([SPOTLIGHT]);

      render(await Home());

      expect(fallbackCall()).toBeUndefined();
      expect(mockGetPublishedReleases).not.toHaveBeenCalled();
    });

    it('does not prefetch the newest releases when the spotlights failed to load', async () => {
      seedSpotlights(undefined);

      render(await Home());

      expect(fallbackCall()).toBeUndefined();
    });

    it('prefetches the twelve newest releases when there is no spotlight', async () => {
      seedSpotlights([]);
      mockGetPublishedReleases.mockResolvedValue({
        success: true,
        data: [{ id: 'release-1', title: 'Newest Album' }],
      });

      render(await Home());

      // Same key and page shape as useNewestPublishedReleasesQuery(12), so the
      // grid hydrates server-filled.
      expect(fallbackCall()?.[0].queryKey).toEqual(['releases', 'newestPublished', 12]);
      expect(mockGetPublishedReleases.mock.calls).toEqual([[{ skip: 0, take: 12 }]]);
      await expect(fallbackCall()?.[0].queryFn()).resolves.toEqual({
        rows: [{ id: 'release-1', title: 'Newest Album' }],
        nextSkip: null,
      });
    });

    it('prefetches the newest releases when no spotlight row can render', async () => {
      seedSpotlights([{ ...SPOTLIGHT, release: null }]);

      render(await Home());

      expect(fallbackCall()).toBeDefined();
    });

    it('surfaces a failed fallback read so the client refetches', async () => {
      seedSpotlights([]);
      mockGetPublishedReleases.mockResolvedValue({ success: false, error: 'Database unavailable' });

      render(await Home());

      await expect(fallbackCall()?.[0].queryFn()).rejects.toThrow('Database unavailable');
    });
  });

  describe('first-cover preload', () => {
    const coverPreloadSelector = 'link[rel="preload"][as="image"]:not([media])';

    const SPOTLIGHT = {
      id: 'featured-1',
      displayName: 'Jane Doe',
      coverArt: '/media/releases/abc/cover.jpg',
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

    const seed = (featuredArtists: unknown[], newestRows?: unknown[]) =>
      mockGetQueryData.mockImplementation((key: string[]) => {
        if (key[0] === 'featuredArtists') {
          return { featuredArtists, count: featuredArtists.length };
        }
        if (key[1] === 'newestPublished' && newestRows) {
          return { rows: newestRows, nextSkip: null };
        }
        return undefined;
      });

    it('preloads the first card cover at every width, at high priority', async () => {
      seed([SPOTLIGHT]);

      render(await Home());

      // The grid sits above the fold at every width, so the preload carries
      // no media query; its sizes are the card image's own.
      const preloads = document.querySelectorAll(coverPreloadSelector);
      expect(preloads).toHaveLength(1);
      expect(preloads[0]?.getAttribute('imagesrcset')).toContain(
        '/media/releases/abc/cover_w640.webp 640w'
      );
      expect(preloads[0]?.getAttribute('imagesizes')).toBe(SPOTLIGHT_COVER_SIZES);
      expect(preloads[0]?.getAttribute('fetchpriority')).toBe('high');
    });

    it('preloads the first card that renders, skipping rows the grid skips', async () => {
      seed([
        // No display name: the grid skips it, so the preload must too.
        { ...SPOTLIGHT, id: 'featured-0', displayName: null, coverArt: '/media/skipped/c.jpg' },
        { ...SPOTLIGHT, coverArt: '/media/releases/selected/cover.jpg' },
      ]);

      render(await Home());

      const preload = document.querySelector(coverPreloadSelector);
      expect(preload?.getAttribute('imagesrcset')).toContain('/media/releases/selected/');
      expect(preload?.getAttribute('imagesrcset')).not.toContain('/media/skipped/');
    });

    it('preloads the first newest release when the grid falls back', async () => {
      seed(
        [],
        [
          {
            id: 'rel-9',
            title: 'Newest Album',
            coverArt: '/media/releases/newest/cover.jpg',
            releasedOn: new Date('2025-01-01T00:00:00Z'),
            images: [],
            digitalFormats: [],
            albumArtist: null,
          },
        ]
      );

      render(await Home());

      expect(document.querySelector(coverPreloadSelector)?.getAttribute('imagesrcset')).toContain(
        '/media/releases/newest/'
      );
    });

    it('emits no cover preload when the cover art is a data: URI', async () => {
      seed([{ ...SPOTLIGHT, coverArt: 'data:image/webp;base64,AAAA' }]);

      render(await Home());

      expect(document.querySelector(coverPreloadSelector)).toBeNull();
    });

    it('emits no cover preload when the first card has no cover', async () => {
      seed([{ ...SPOTLIGHT, coverArt: null }]);

      render(await Home());

      expect(document.querySelector(coverPreloadSelector)).toBeNull();
    });

    it('emits no cover preload when nothing is cached', async () => {
      mockGetQueryData.mockReturnValue(undefined);

      render(await Home());

      expect(document.querySelector(coverPreloadSelector)).toBeNull();
    });
  });
});
