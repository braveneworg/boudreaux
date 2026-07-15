/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import type { PlaylistsResponse } from '@/lib/types/domain/playlist';

import PlaylistsPage from './page';

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

const mockGetMyPlaylists = vi.fn();
vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    getMyPlaylists: (...args: unknown[]) => mockGetMyPlaylists(...args),
  },
}));

const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: mockLoggerError } },
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

vi.mock('@/app/components/playlists/playlists-content', () => ({
  PlaylistsContent: () => <div data-testid="playlists-content">Playlists Content</div>,
}));

const RESPONSE: PlaylistsResponse = {
  rows: [
    {
      id: 'pl-1',
      title: 'Road Trip',
      isPublic: false,
      coverImages: ['https://cdn.example.com/a.jpg'],
      itemCount: 3,
      totalDuration: 540,
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
  ],
  nextSkip: null,
};

describe('PlaylistsPage', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
    mockGetMyPlaylists.mockResolvedValue({ rows: [], nextSkip: null });
  });

  it('should redirect to signin when there is no session', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(PlaylistsPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockRedirect).toHaveBeenCalledWith('/signin');
  });

  it('should redirect to signin when the user has no id', async () => {
    mockAuth.mockResolvedValue({ user: {} });

    await expect(PlaylistsPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
  });

  it('should not reach the prefetch when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(PlaylistsPage()).rejects.toThrow('NEXT_REDIRECT:/signin');
    expect(mockPrefetchInfiniteQuery).not.toHaveBeenCalled();
  });

  it('should prefetch the My Playlists list under the mine key', async () => {
    const Page = await PlaylistsPage();
    render(Page);

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['playlists', 'mine'],
        initialPageParam: 0,
      })
    );
  });

  it('should read the playlist service with the client query pagination', async () => {
    await PlaylistsPage();

    expect(mockGetMyPlaylists).toHaveBeenCalledExactlyOnceWith('user-1', { skip: 0, take: 24 });
  });

  it('should prefetch the exact wire shape the client query resolves to', async () => {
    mockGetMyPlaylists.mockResolvedValue(RESPONSE);

    await PlaylistsPage();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual(RESPONSE);
  });

  it('should degrade to an empty list when the service throws', async () => {
    mockGetMyPlaylists.mockRejectedValue(new Error('Database unavailable'));

    await PlaylistsPage();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [], nextSkip: null });
  });

  it('should log the prefetch failure when the service throws', async () => {
    const failure = new Error('Database unavailable');
    mockGetMyPlaylists.mockRejectedValue(failure);

    await PlaylistsPage();

    expect(mockLoggerError).toHaveBeenCalledWith('Playlists prefetch failed', failure);
  });

  it('should render PlaylistsContent within the hydration boundary', async () => {
    const Page = await PlaylistsPage();
    render(Page);

    expect(screen.getByTestId('playlists-content')).toBeInTheDocument();
  });

  it('should render the content on a kraft zine panel', async () => {
    const Page = await PlaylistsPage();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-kraft');
  });

  it('should render the cutout strip heading with the page name', async () => {
    const Page = await PlaylistsPage();
    render(Page);

    const heading = screen.getByRole('heading', { level: 1 });
    const strip = heading.querySelector('[data-slot="zine-heading"]');
    expect(strip).toHaveTextContent('My Playlists');
  });

  it('should render the Home and My Playlists breadcrumbs', async () => {
    const Page = await PlaylistsPage();
    render(Page);

    const nav = screen.getByTestId('breadcrumb-menu');
    expect(JSON.parse(nav.getAttribute('data-items') ?? '[]')).toEqual([
      { anchorText: 'Home', url: '/', isActive: false },
      { anchorText: 'My Playlists', url: '/playlists', isActive: true },
    ]);
  });
});
