/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ReleasesPage from './page';

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

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchInfiniteQuery: mockPrefetchInfiniteQuery,
  }),
}));

const mockGetPublishedReleases = vi.fn().mockResolvedValue({ success: true, data: [] });
vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getPublishedReleases: (...args: unknown[]) => mockGetPublishedReleases(...args),
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
  ReleasesContent: () => <div data-testid="releases-content">Releases Content</div>,
}));

describe('ReleasesPage', () => {
  it('should render page structure with PageContainer and ContentContainer', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render BreadcrumbMenu with Releases', async () => {
    const Page = await ReleasesPage();
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    expect(breadcrumbs).toBeInTheDocument();
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    expect(items).toEqual([{ anchorText: 'Releases', url: '/releases', isActive: true }]);
  });

  it('should render the releases heading as an image', async () => {
    const Page = await ReleasesPage();
    render(Page);

    const headingImage = screen.getByRole('img', { name: /releases/i });
    expect(headingImage).toHaveAttribute('alt', 'releases');
  });

  it('should cap the heading image width instead of spanning the panel', async () => {
    const Page = await ReleasesPage();
    render(Page);

    const headingImage = screen.getByRole('img', { name: /releases/i });
    expect(headingImage).toHaveClass('sm:max-w-md');
    expect(headingImage).not.toHaveClass('w-full');
  });

  it('should trail the heading with squares in its background color', async () => {
    const Page = await ReleasesPage();
    const { container } = render(Page);

    const trail = container.querySelector('[data-slot="zine-square-trail"]');
    // Tinted to match the RELEASES wordmark's cyan block; squares read the
    // color via bg-current. Hidden on mobile where the image fills the row.
    // The negative margin tucks the scatter under the image's right edge —
    // past its transparent fringe — so squares start out from behind the
    // wordmark's color block itself.
    expect(trail).toHaveClass('text-[#45fefc]', 'hidden', 'sm:block', 'sm:-ml-6');

    const headingImage = screen.getByRole('img', { name: /releases/i });
    const row = trail?.parentElement;
    expect(row).toHaveClass('sm:flex', 'sm:items-center');
    expect(row).not.toHaveClass('sm:gap-6');
    expect(row).toContainElement(headingImage);
  });

  it('should wrap the heading and releases content in a cyan zine panel', async () => {
    const Page = await ReleasesPage();
    const { container } = render(Page);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-cyan');

    const headingImage = screen.getByRole('img', { name: /releases/i });
    expect(panel).toContainElement(headingImage);
    expect(panel).toContainElement(screen.getByTestId('releases-content'));
  });

  it('should prefetch the first published-releases page as an infinite query', async () => {
    mockGetPublishedReleases.mockResolvedValue({
      success: true,
      data: [{ id: 'release-1', title: 'E2E Release' }],
    });

    const Page = await ReleasesPage();
    render(Page);

    expect(mockPrefetchInfiniteQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['releases', 'publishedInfinite', ''],
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

  it('should render ReleasesContent within HydrationBoundary', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('releases-content')).toBeInTheDocument();
  });
});
