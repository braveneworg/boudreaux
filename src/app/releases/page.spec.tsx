/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { queryKeys } from '@/lib/query-keys';

import ReleasesPage, { generateMetadata } from './page';

vi.mock('server-only', () => ({}));

// Mock TanStack Query SSR utilities
const mockPrefetchInfiniteQuery = vi
  .fn()
  .mockImplementation(async (opts: { queryFn?: () => unknown | Promise<unknown> }) => {
    if (opts.queryFn) {
      await Promise.resolve(opts.queryFn());
    }
  });
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockSetQueryData = vi.fn();
vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchInfiniteQuery: mockPrefetchInfiniteQuery,
    setQueryData: mockSetQueryData,
  }),
}));

const mockGetPublishedReleases = vi.fn().mockResolvedValue({ success: true, data: [] });
const mockGetReleaseWithTracks = vi.fn();
vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getPublishedReleases: (...args: unknown[]) => mockGetPublishedReleases(...args),
    getReleaseWithTracks: (...args: unknown[]) => mockGetReleaseWithTracks(...args),
  },
}));

// Mock child components
vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({
    items,
  }: {
    items: Array<{ anchorText: string; url: string; isActive: boolean }>;
  }) => (
    <nav data-testid="breadcrumb-menu" data-items={JSON.stringify(items)}>
      Breadcrumbs
    </nav>
  ),
}));

vi.mock('@/app/components/ui/heading', () => ({
  Heading: ({ children, level }: { children: React.ReactNode; level?: number }) => (
    <div data-testid="heading" data-level={level}>
      {children}
    </div>
  ),
}));

vi.mock('@/app/components/releases-content', () => ({
  ReleasesContent: ({
    artist,
    artistName,
    initialRelease,
  }: {
    artist?: string;
    artistName?: string;
    initialRelease?: unknown;
  }) => (
    <div
      data-testid="releases-content"
      data-artist={artist ?? ''}
      data-artist-name={artistName ?? ''}
      data-initial-release={JSON.stringify(initialRelease ?? null)}
    >
      Releases Content
    </div>
  ),
}));

// Like Next's own, the mock throws: nothing after a `notFound()` runs.
const notFound = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  notFound: () => {
    notFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const getPublicArtist = vi.hoisted(() => vi.fn());
vi.mock('@/app/artists/[slug]/get-public-artist', () => ({
  getPublicArtist: (slug: string) => getPublicArtist(slug),
}));

beforeEach(() => {
  getPublicArtist.mockResolvedValue({ displayName: 'E2E Artist' });
});

type SearchParams = Record<string, string | string[] | undefined>;

const RELEASE_ID = '0123456789abcdef01234567';

/** A playable release as `getReleaseWithTracks` returns it. */
const releaseWithTracks = (overrides: Record<string, unknown> = {}) => ({
  id: RELEASE_ID,
  title: 'E2E Album One',
  releasedOn: new Date('2024-03-01T00:00:00.000Z'),
  albumArtist: { firstName: 'E2E', surname: 'Artist', displayName: 'E2E Artist' },
  artistReleases: [],
  digitalFormats: [{ files: [{ s3Key: 'releases/e2e/track-one.mp3', trackNumber: 1 }] }],
  ...overrides,
});

/** The `initialRelease` the page handed the releases content. */
const initialRelease = (): unknown =>
  JSON.parse(screen.getByTestId('releases-content').getAttribute('data-initial-release') ?? '');

/** Render the page for the given query string params. */
const renderPage = async (searchParams: SearchParams = {}) =>
  render(await ReleasesPage({ searchParams: Promise.resolve(searchParams) }));

describe('ReleasesPage', () => {
  it('should render page structure with PageContainer and ContentContainer', async () => {
    await renderPage();

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render BreadcrumbMenu with Releases', async () => {
    await renderPage();

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    expect(breadcrumbs).toBeInTheDocument();
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    expect(items).toEqual([{ anchorText: 'Releases', url: '/releases', isActive: true }]);
  });

  it('should leave the heading to the releases content, under its search', async () => {
    await renderPage();

    // ReleasesContent renders the RELEASES wordmark below its search, as the
    // home page does; the page adds no heading of its own.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /releases/i })).not.toBeInTheDocument();
  });

  it('should wrap the releases content in a cyan zine panel', async () => {
    const { container } = await renderPage();

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-cyan');
    expect(panel).toContainElement(screen.getByTestId('releases-content'));
  });

  it('should prefetch the first published-releases page as an infinite query', async () => {
    mockGetPublishedReleases.mockResolvedValue({
      success: true,
      data: [{ id: 'release-1', title: 'E2E Release' }],
    });

    await renderPage();

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['releases', 'publishedInfinite', '', ''],
        initialPageParam: 0,
      })
    );
    // Reads the service directly (no self-HTTP) for the first page.
    expect(mockGetPublishedReleases).toHaveBeenCalledWith({ skip: 0, take: 24 });

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({
      rows: [{ id: 'release-1', title: 'E2E Release' }],
      nextSkip: null,
    });
  });

  it('should prefetch the artist-filtered first page under the key the client hook uses', async () => {
    mockGetPublishedReleases.mockResolvedValue({ success: true, data: [] });

    await renderPage({ artist: 'e2e-artist' });

    const [[opts]] = mockPrefetchInfiniteQuery.mock.calls as [[{ queryKey: unknown[] }]];
    expect(opts.queryKey).toEqual(['releases', 'publishedInfinite', '', 'e2e-artist']);
    expect(opts.queryKey).toEqual(queryKeys.releases.publishedInfinite('', 'e2e-artist'));
    expect(mockGetPublishedReleases.mock.calls).toEqual([
      [{ skip: 0, take: 24, artist: 'e2e-artist' }],
    ]);
  });

  it('should pass the artist filter to the releases content', async () => {
    await renderPage({ artist: ' e2e-artist ' });

    expect(screen.getByTestId('releases-content')).toHaveAttribute('data-artist', 'e2e-artist');
  });

  it('should take the first artist when the param repeats', async () => {
    await renderPage({ artist: ['e2e-artist', 'e2e-band'] });

    expect(screen.getByTestId('releases-content')).toHaveAttribute('data-artist', 'e2e-artist');
    const [[opts]] = mockPrefetchInfiniteQuery.mock.calls as [[{ queryKey: unknown[] }]];
    expect(opts.queryKey).toEqual(['releases', 'publishedInfinite', '', 'e2e-artist']);
  });

  it.each([{ artist: '' }, { artist: '   ' }, {}])(
    'should ignore an empty or missing artist param (%j)',
    async (searchParams) => {
      await renderPage(searchParams);

      expect(screen.getByTestId('releases-content')).toHaveAttribute('data-artist', '');
      const [[opts]] = mockPrefetchInfiniteQuery.mock.calls as [[{ queryKey: unknown[] }]];
      expect(opts.queryKey).toEqual(['releases', 'publishedInfinite', '', '']);
      expect(mockGetPublishedReleases.mock.calls).toEqual([[{ skip: 0, take: 24 }]]);
    }
  );

  it('should name the filtered artist in the releases content', async () => {
    await renderPage({ artist: 'e2e-artist' });

    expect(getPublicArtist.mock.calls).toEqual([['e2e-artist']]);
    expect(screen.getByTestId('releases-content')).toHaveAttribute(
      'data-artist-name',
      'E2E Artist'
    );
  });

  it('should look up no artist without an artist filter', async () => {
    await renderPage();

    expect(getPublicArtist).not.toHaveBeenCalled();
    expect(screen.getByTestId('releases-content')).toHaveAttribute('data-artist-name', '');
  });

  it('should show 404 when the filter names no public artist, before prefetching', async () => {
    getPublicArtist.mockResolvedValueOnce(null);

    await expect(
      ReleasesPage({ searchParams: Promise.resolve({ artist: 'hidden-artist' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled();
  });

  describe('release deep link', () => {
    it('opens the release when it is listed under the artist filter and playable', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({ success: true, data: releaseWithTracks() });

      await renderPage({ artist: 'e2e-artist', release: RELEASE_ID });

      expect(mockGetReleaseWithTracks.mock.calls).toEqual([[RELEASE_ID, 'e2e-artist']]);
      expect(initialRelease()).toEqual({
        id: RELEASE_ID,
        title: 'E2E Album One',
        artistName: 'E2E Artist',
        playSrc: expect.stringContaining('releases/e2e/track-one.mp3'),
        year: 2024,
      });
    });

    it('seeds the release detail so the modal mounts without a skeleton', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({ success: true, data: releaseWithTracks() });

      await renderPage({ artist: 'e2e-artist', release: RELEASE_ID });

      expect(mockSetQueryData.mock.calls).toEqual([
        [
          queryKeys.releases.detail(RELEASE_ID),
          expect.objectContaining({ id: RELEASE_ID, releasedOn: '2024-03-01T00:00:00.000Z' }),
        ],
      ]);
    });

    it('seeds BigInt fields as numbers, as the API serves them', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({
        success: true,
        data: releaseWithTracks({ totalFileSize: BigInt(5_000_000) }),
      });

      await renderPage({ artist: 'e2e-artist', release: RELEASE_ID });

      expect(mockSetQueryData.mock.calls[0]?.[1]).toHaveProperty('totalFileSize', 5_000_000);
    });

    it('takes the first release when the param repeats, trimmed', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({ success: true, data: releaseWithTracks() });

      await renderPage({ artist: 'e2e-artist', release: [` ${RELEASE_ID} `, 'other'] });

      expect(mockGetReleaseWithTracks.mock.calls).toEqual([[RELEASE_ID, 'e2e-artist']]);
    });

    it('names no artist when the album artist is hidden', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({
        success: true,
        data: releaseWithTracks({ albumArtist: null }),
      });

      await renderPage({ artist: 'e2e-artist', release: RELEASE_ID });

      expect(initialRelease()).toHaveProperty('artistName', null);
    });

    it('shows the plain grid when the release is not under the filter or not listed', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({
        success: false,
        error: 'Release not found',
      });

      await renderPage({ artist: 'e2e-artist', release: RELEASE_ID });

      expect(initialRelease()).toBeNull();
      expect(mockSetQueryData).not.toHaveBeenCalled();
    });

    it('shows the plain grid when the release has nothing playable', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({
        success: true,
        data: releaseWithTracks({ digitalFormats: [] }),
      });

      await renderPage({ artist: 'e2e-artist', release: RELEASE_ID });

      expect(initialRelease()).toBeNull();
      expect(mockSetQueryData).not.toHaveBeenCalled();
    });

    it.each(['garbage', '', `${RELEASE_ID}0`])(
      'looks nothing up for a release that is not an ObjectId (%j)',
      async (release) => {
        await renderPage({ artist: 'e2e-artist', release });

        expect(mockGetReleaseWithTracks).not.toHaveBeenCalled();
        expect(initialRelease()).toBeNull();
      }
    );

    it('looks nothing up without an artist filter', async () => {
      await renderPage({ release: RELEASE_ID });

      expect(mockGetReleaseWithTracks).not.toHaveBeenCalled();
      expect(initialRelease()).toBeNull();
    });
  });

  describe('generateMetadata', () => {
    const metadataFor = (searchParams: SearchParams) =>
      generateMetadata({ searchParams: Promise.resolve(searchParams) });

    it('titles the unfiltered listing as releases', async () => {
      await expect(metadataFor({})).resolves.toEqual({
        title: 'Releases',
        description: 'Browse all published releases. Search by artist or title.',
      });
    });

    it('titles a filtered listing with the artist', async () => {
      await expect(metadataFor({ artist: 'e2e-artist' })).resolves.toEqual({
        title: 'Releases by E2E Artist',
        description: 'Every release by E2E Artist.',
      });
    });

    it('titles a deep link with the release', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({ success: true, data: releaseWithTracks() });

      await expect(metadataFor({ artist: 'e2e-artist', release: RELEASE_ID })).resolves.toEqual({
        title: 'E2E Album One',
        description: 'Every release by E2E Artist.',
      });
    });

    it('titles a deep link to an unplayable release as the artist listing', async () => {
      mockGetReleaseWithTracks.mockResolvedValueOnce({
        success: false,
        error: 'Release not found',
      });

      await expect(metadataFor({ artist: 'e2e-artist', release: RELEASE_ID })).resolves.toEqual({
        title: 'Releases by E2E Artist',
        description: 'Every release by E2E Artist.',
      });
    });

    it('titles a filter naming no public artist as not found', async () => {
      getPublicArtist.mockResolvedValueOnce(null);

      await expect(metadataFor({ artist: 'hidden-artist' })).resolves.toEqual({
        title: 'Artist Not Found',
      });
    });
  });

  it('should render ReleasesContent within HydrationBoundary', async () => {
    await renderPage();

    expect(screen.getByTestId('releases-content')).toBeInTheDocument();
  });
});
