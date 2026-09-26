/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import type { ArtistListingRow } from '@/lib/types/domain/artist';

import ArtistsIndexPage from './page';

vi.mock('server-only', () => ({}));

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

const mockListPublishedArtists = vi.fn();
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    listPublishedArtists: (...args: unknown[]) => mockListPublishedArtists(...args),
  },
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

vi.mock('@/app/components/artists-content', () => ({
  ArtistsContent: () => <div data-testid="artists-content">Artists Content</div>,
}));

const mockRow: ArtistListingRow = {
  id: 'artist-1',
  slug: 'e2e-artist',
  firstName: 'E2E',
  middleName: null,
  surname: 'Artist',
  title: null,
  suffix: null,
  displayName: 'E2E Artist',
  akaNames: null,
  genres: null,
  instruments: null,
  shortBio: null,
  bornOn: null,
  diedOn: null,
  formedOn: null,
  bioImages: [],
  members: [],
  memberOf: [],
  releaseCount: 1,
  newestRelease: { id: 'r-1', title: 'LP', releasedOn: new Date('2024-01-01T00:00:00.000Z') },
};

describe('ArtistsIndexPage', () => {
  beforeEach(() => {
    mockListPublishedArtists.mockResolvedValue({ success: true, data: [] });
  });

  // The page is public: no session is mocked anywhere in this spec, and the
  // page must never redirect an anonymous visitor.
  it('should never redirect to signin', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('should render page structure with PageContainer and ContentContainer', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should pass only the Artists crumb (BreadcrumbMenu adds Home itself)', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    // BreadcrumbMenu renders the Home crumb itself; passing one too doubled it.
    expect(items).toEqual([{ anchorText: 'Artists', url: '/artists', isActive: true }]);
  });

  it('should render the artists heading as an image', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    const heading = screen.getByRole('heading', { level: 1 });
    const headingImage = screen.getByRole('img', { name: /artists/i });
    expect(heading).toContainElement(headingImage);
    expect(headingImage).toHaveAttribute('alt', 'artists');
  });

  it('gives the wordmark 16px of air above the toolbar, without moving sibling pages', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('mb-4');
    expect(heading).not.toHaveClass('mb-1.5');
  });

  it('should wrap the heading and content in a hot-pink zine panel', async () => {
    const Page = await ArtistsIndexPage();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toHaveClass('zine-accent-hot-pink');
    expect(panel).toContainElement(screen.getByRole('img', { name: /artists/i }));
    expect(panel).toContainElement(screen.getByTestId('artists-content'));
  });

  it('should render the breadcrumb inside the zine panel', async () => {
    const Page = await ArtistsIndexPage();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toContainElement(screen.getByTestId('breadcrumb-menu'));
  });

  it('should no longer link to a separate search page', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.queryByRole('link', { name: /search artists/i })).not.toBeInTheDocument();
  });

  it('should prefetch the first A–Z page as an infinite query', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['artists', 'publishedInfinite', 'alpha', ''],
        initialPageParam: 0,
      })
    );
  });

  it('should read the artist service directly for the first page of current artists', async () => {
    await ArtistsIndexPage();

    expect(mockListPublishedArtists).toHaveBeenCalledWith({
      sort: 'alpha',
      roster: 'current',
      skip: 0,
      take: 24,
    });
  });

  it('should shape the prefetched first page exactly like the listing route', async () => {
    mockListPublishedArtists.mockResolvedValue({ success: true, data: [mockRow] });

    await ArtistsIndexPage();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [mockRow], nextSkip: null });
  });

  it('should degrade to an empty first page when the service fails', async () => {
    mockListPublishedArtists.mockResolvedValue({ success: false, error: 'Database unavailable' });

    await ArtistsIndexPage();

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({ rows: [], nextSkip: null });
  });

  it('should render ArtistsContent within the hydration boundary', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.getByTestId('artists-content')).toBeInTheDocument();
  });
});
