/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { queryKeys } from '@/lib/query-keys';
import type { Video } from '@/lib/types/domain/video';

import VideosPage, { generateMetadata } from './page';

vi.mock('server-only', () => ({}));

// Mock next/navigation — redirect must throw to halt execution like the real one.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
// Like Next's own, notFound throws: nothing after it runs.
const notFound = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => {
    notFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const getPublicArtist = vi.hoisted(() => vi.fn());
vi.mock('@/app/artists/[slug]/get-public-artist', () => ({
  getPublicArtist: (slug: string) => getPublicArtist(slug),
}));

// Mock TanStack Query SSR utilities — execute the queryFn so coverage sees it.
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

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchInfiniteQuery: mockPrefetchInfiniteQuery,
  }),
}));

const mockGetPublishedVideos = vi.fn();
const mockCountPublishedVideos = vi.fn();
vi.mock('@/lib/services/video-service', () => ({
  VideoService: {
    getPublishedVideos: (...args: unknown[]) => mockGetPublishedVideos(...args),
    countPublishedVideos: (...args: unknown[]) => mockCountPublishedVideos(...args),
  },
}));

vi.mock('@/lib/utils/sign-stream-url', () => ({
  signStreamUrl: () => 'https://cdn.example.com/signed',
}));

// Mock the shell containers + the client content island.
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

vi.mock('@/app/components/videos-content', () => ({
  VideosContent: ({ artist, artistName }: { artist?: string; artistName?: string }) => (
    <div
      data-testid="videos-content"
      data-artist={artist ?? ''}
      data-artist-name={artistName ?? ''}
    >
      Videos Content
    </div>
  ),
}));

type SearchParams = Record<string, string | string[] | undefined>;

/** The page for the given query string params. */
const pageFor = (searchParams: SearchParams = {}) =>
  VideosPage({ searchParams: Promise.resolve(searchParams) });

const mockVideo: Video = {
  id: 'video-1',
  title: 'Alpha',
  artist: 'The Band',
  category: 'MUSIC',
  description: 'A great video',
  releasedOn: new Date('2026-01-01T00:00:00.000Z'),
  durationSeconds: 200,
  s3Key: 'videos/alpha.mp4',
  fileName: 'alpha.mp4',
  fileSize: null,
  mimeType: 'video/mp4',
  posterUrl: null,
  posterCandidates: [],
  publishedAt: new Date('2026-01-02T00:00:00.000Z'),
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  probedAt: null,
  probeError: null,
  container: null,
  width: null,
  height: null,
  videoCodec: null,
  audioCodec: null,
  bitrateKbps: null,
  frameRate: null,
  audioChannels: null,
  audioSampleRateHz: null,
  colorSpace: null,
  colorPrimaries: null,
  colorTransfer: null,
  sourceCreatedAt: null,
  encoder: null,
  probeData: null,
  enrichmentStatus: null,
  enrichmentError: null,
  enrichmentStartedAt: null,
  enrichmentJobToken: null,
  enrichmentProgress: null,
  enrichedAt: null,
};

describe('VideosPage', () => {
  beforeEach(() => {
    mockGetPublishedVideos.mockResolvedValue({ success: true, data: [] });
    mockCountPublishedVideos.mockResolvedValue({ success: true, data: 0 });
    getPublicArtist.mockResolvedValue({ displayName: 'E2E Artist' });
  });

  // The page is public: no session is mocked anywhere in this spec, and the
  // page must never redirect an anonymous visitor.
  it('should never redirect to signin', async () => {
    const Page = await pageFor();
    render(Page);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('should prefetch the first published-videos page as an infinite query', async () => {
    const Page = await pageFor();
    render(Page);

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['videos', 'publishedInfinite', 'desc', '', ''],
        initialPageParam: 0,
      })
    );
  });

  it('should read the video service directly for the first page', async () => {
    await pageFor();

    expect(mockGetPublishedVideos).toHaveBeenCalledWith({ sort: 'desc', skip: 0, take: 5 });
  });

  it('should shape the prefetched first page with signed stream urls', async () => {
    mockGetPublishedVideos.mockResolvedValue({ success: true, data: [mockVideo] });
    mockCountPublishedVideos.mockResolvedValue({ success: true, data: 3 });

    await pageFor();

    // Every audit/probe/enrichment internal is stripped from the SSR payload via
    // the shared `toPublicVideoRow`; only the public row + signed URL survives.
    const {
      createdBy: _createdBy,
      updatedBy: _updatedBy,
      posterCandidates: _posterCandidates,
      probedAt: _probedAt,
      probeError: _probeError,
      container: _container,
      width: _width,
      height: _height,
      videoCodec: _videoCodec,
      audioCodec: _audioCodec,
      bitrateKbps: _bitrateKbps,
      frameRate: _frameRate,
      audioChannels: _audioChannels,
      audioSampleRateHz: _audioSampleRateHz,
      colorSpace: _colorSpace,
      colorPrimaries: _colorPrimaries,
      colorTransfer: _colorTransfer,
      sourceCreatedAt: _sourceCreatedAt,
      encoder: _encoder,
      probeData: _probeData,
      enrichmentStatus: _enrichmentStatus,
      enrichmentError: _enrichmentError,
      enrichmentStartedAt: _enrichmentStartedAt,
      enrichmentJobToken: _enrichmentJobToken,
      enrichmentProgress: _enrichmentProgress,
      enrichedAt: _enrichedAt,
      ...publicVideo
    } = mockVideo;
    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({
      rows: [{ ...publicVideo, streamUrl: 'https://cdn.example.com/signed' }],
      nextSkip: null,
      total: 3,
    });
  });

  it('should not leak the enrichmentJobToken into the SSR payload', async () => {
    mockGetPublishedVideos.mockResolvedValue({
      success: true,
      data: [{ ...mockVideo, enrichmentJobToken: 'secret-job-token' }],
    });

    await pageFor();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [
      { queryFn: () => Promise<{ rows: Array<Record<string, unknown>> }> },
    ];
    const { rows } = await opts.queryFn();
    expect(rows[0]).not.toHaveProperty('enrichmentJobToken');
  });

  it('should not leak the raw probeData into the SSR payload', async () => {
    mockGetPublishedVideos.mockResolvedValue({
      success: true,
      data: [{ ...mockVideo, probeData: { format: { filename: 'secret.mp4' } } }],
    });

    await pageFor();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [
      { queryFn: () => Promise<{ rows: Array<Record<string, unknown>> }> },
    ];
    const { rows } = await opts.queryFn();
    expect(rows[0]).not.toHaveProperty('probeData');
  });

  it('should degrade to an empty first page when the service fails', async () => {
    mockGetPublishedVideos.mockResolvedValue({ success: false, error: 'Database unavailable' });

    await pageFor();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [], nextSkip: null, total: 0 });
  });

  it('should degrade to an empty first page when the count fails', async () => {
    mockGetPublishedVideos.mockResolvedValue({ success: true, data: [mockVideo] });
    mockCountPublishedVideos.mockResolvedValue({ success: false, error: 'Database unavailable' });

    await pageFor();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [], nextSkip: null, total: 0 });
  });

  it('should count the first page with the artist filter', async () => {
    await pageFor({ artist: 'e2e-artist' });

    expect(mockCountPublishedVideos.mock.calls).toEqual([[{ artist: 'e2e-artist' }]]);
  });

  it('should prefetch the artist-filtered first page under the key the client hook uses', async () => {
    await pageFor({ artist: 'e2e-artist' });

    const [[opts]] = mockPrefetchInfiniteQuery.mock.calls as [[{ queryKey: unknown[] }]];
    expect(opts.queryKey).toEqual(['videos', 'publishedInfinite', 'desc', '', 'e2e-artist']);
    expect(opts.queryKey).toEqual(queryKeys.videos.publishedInfinite('desc', '', 'e2e-artist'));
    expect(mockGetPublishedVideos.mock.calls).toEqual([
      [{ sort: 'desc', skip: 0, take: 5, artist: 'e2e-artist' }],
    ]);
  });

  it('should pass the artist filter and its name to the videos content', async () => {
    render(await pageFor({ artist: ' e2e-artist ' }));

    expect(getPublicArtist.mock.calls).toEqual([['e2e-artist']]);
    const content = screen.getByTestId('videos-content');
    expect(content).toHaveAttribute('data-artist', 'e2e-artist');
    expect(content).toHaveAttribute('data-artist-name', 'E2E Artist');
  });

  it('should take the first artist when the param repeats', async () => {
    render(await pageFor({ artist: ['e2e-artist', 'e2e-band'] }));

    expect(screen.getByTestId('videos-content')).toHaveAttribute('data-artist', 'e2e-artist');
  });

  it.each([{ artist: '' }, { artist: '   ' }, {}])(
    'should ignore an empty or missing artist param (%j)',
    async (searchParams) => {
      render(await pageFor(searchParams));

      expect(getPublicArtist).not.toHaveBeenCalled();
      expect(screen.getByTestId('videos-content')).toHaveAttribute('data-artist', '');
      expect(screen.getByTestId('videos-content')).toHaveAttribute('data-artist-name', '');
      expect(mockGetPublishedVideos.mock.calls).toEqual([[{ sort: 'desc', skip: 0, take: 5 }]]);
    }
  );

  it('should show 404 when the filter names no public artist, before prefetching', async () => {
    getPublicArtist.mockResolvedValueOnce(null);

    await expect(pageFor({ artist: 'hidden-artist' })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled();
  });

  describe('generateMetadata', () => {
    const metadataFor = (searchParams: SearchParams) =>
      generateMetadata({ searchParams: Promise.resolve(searchParams) });

    it('titles the unfiltered listing as videos', async () => {
      await expect(metadataFor({})).resolves.toEqual({
        title: 'Videos',
        description: 'Stream music videos and live session footage from the label.',
      });
    });

    it('titles a filtered listing with the artist', async () => {
      await expect(metadataFor({ artist: 'e2e-artist' })).resolves.toEqual({
        title: 'Videos by E2E Artist',
        description: 'Every video by E2E Artist.',
      });
    });

    it('titles a filter naming no public artist as not found', async () => {
      getPublicArtist.mockResolvedValueOnce(null);

      await expect(metadataFor({ artist: 'hidden-artist' })).resolves.toEqual({
        title: 'Artist Not Found',
      });
    });
  });

  it('should render VideosContent within the hydration boundary', async () => {
    const Page = await pageFor();
    render(Page);

    expect(screen.getByTestId('videos-content')).toBeInTheDocument();
  });

  it('should render the videos content on a kraft zine panel', async () => {
    const Page = await pageFor();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-kraft');
  });

  it('should render the videos heading as the wordmark image', async () => {
    const Page = await pageFor();
    render(Page);

    const heading = screen.getByRole('heading', { level: 1 });
    const headingImage = screen.getByRole('img', { name: /fake four inc videos/i });
    expect(heading).toContainElement(headingImage);
    expect(headingImage).toHaveAttribute('alt', 'fake four inc videos');
  });
});
