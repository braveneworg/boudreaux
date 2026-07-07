/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import type { Video } from '@/lib/types/domain/video';

import VideosPage from './page';

vi.mock('server-only', () => ({}));

// Mock auth — the server-side session gate.
const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock next/navigation — redirect must throw to halt execution like the real one.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
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
vi.mock('@/lib/services/video-service', () => ({
  VideoService: {
    getPublishedVideos: (...args: unknown[]) => mockGetPublishedVideos(...args),
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
  VideosContent: () => <div data-testid="videos-content">Videos Content</div>,
}));

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
  publishedAt: new Date('2026-01-02T00:00:00.000Z'),
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('VideosPage', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockGetPublishedVideos.mockResolvedValue({ success: true, data: [] });
  });

  it('should redirect to signin when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(VideosPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('should redirect to signin when the user has no id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    await expect(VideosPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
  });

  it('should not reach the prefetch when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(VideosPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled();
  });

  it('should prefetch the first published-videos page as an infinite query', async () => {
    const Page = await VideosPage();
    render(Page);

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['videos', 'publishedInfinite', 'desc'],
        initialPageParam: 0,
      })
    );
  });

  it('should read the video service directly for the first page', async () => {
    await VideosPage();

    expect(mockGetPublishedVideos).toHaveBeenCalledWith({ sort: 'desc', skip: 0, take: 5 });
  });

  it('should shape the prefetched first page with signed stream urls', async () => {
    mockGetPublishedVideos.mockResolvedValue({ success: true, data: [mockVideo] });

    await VideosPage();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({
      rows: [{ ...mockVideo, streamUrl: 'https://cdn.example.com/signed' }],
      nextSkip: null,
    });
  });

  it('should degrade to an empty first page when the service fails', async () => {
    mockGetPublishedVideos.mockResolvedValue({ success: false, error: 'Database unavailable' });

    await VideosPage();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [], nextSkip: null });
  });

  it('should render VideosContent within the hydration boundary', async () => {
    const Page = await VideosPage();
    render(Page);

    expect(screen.getByTestId('videos-content')).toBeInTheDocument();
  });

  it('should render the videos content on a kraft zine panel', async () => {
    const Page = await VideosPage();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-kraft');
  });

  it('should render the cutout heading with the page name', async () => {
    const Page = await VideosPage();
    render(Page);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Videos');
  });
});
