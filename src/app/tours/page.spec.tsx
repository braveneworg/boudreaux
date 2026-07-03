/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ToursPage from './page';

vi.mock('server-only', () => ({}));

// Mock TanStack Query SSR utilities — execute each queryFn so coverage sees the arrow functions
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

const mockFindAll = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/repositories/tours/tour-repository', () => ({
  TourRepository: {
    findAll: (...args: unknown[]) => mockFindAll(...args),
  },
}));

// Mock child component
vi.mock('./components/tours-content', () => ({
  ToursContent: () => <div data-testid="tours-content">Tours Content</div>,
}));

// Mock page shell components
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

describe('ToursPage', () => {
  it('should render page structure with heading', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /tours/i })).toHaveAttribute('alt', 'tours');
    expect(
      screen.getByText('Search and browse upcoming and recent tour dates')
    ).toBeInTheDocument();
  });

  it('should prefetch the first tours page as an infinite query', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['tours', 'infinite', ''],
        initialPageParam: 0,
      })
    );
  });

  it('prefetches via the repository (no self-HTTP) returning the paginated shape', async () => {
    mockFindAll.mockResolvedValue([{ id: 'tour-1', title: 'E2E Tour' }]);

    const Page = await ToursPage();
    render(Page);

    expect(mockFindAll).toHaveBeenCalledWith({ skip: 0, take: 24 });

    const [opts] = mockPrefetchInfiniteQuery.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await expect(opts.queryFn()).resolves.toEqual({
      rows: [{ id: 'tour-1', title: 'E2E Tour' }],
      // A short page (< take) signals the end of the list.
      nextSkip: null,
    });
  });

  it('should render ToursContent within HydrationBoundary', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(screen.getByTestId('tours-content')).toBeInTheDocument();
  });

  it('should render page structure with PageContainer and ContentContainer', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render BreadcrumbMenu with Tours', async () => {
    const Page = await ToursPage();
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    expect(breadcrumbs).toBeInTheDocument();
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    expect(items).toEqual([{ anchorText: 'Tours', url: '/tours', isActive: true }]);
  });

  it('should wrap the heading and tours content in a tan zine panel', async () => {
    const Page = await ToursPage();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-tan');

    const headingImage = screen.getByRole('img', { name: /tours/i });
    expect(panel).toContainElement(headingImage);
    expect(panel).toContainElement(screen.getByTestId('tours-content'));
  });
});
