/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ReleasesPage from './page';

vi.mock('server-only', () => ({}));

// Mock TanStack Query SSR utilities
const mockPrefetchQuery = vi.fn().mockResolvedValue(undefined);
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchQuery: mockPrefetchQuery,
  }),
}));

vi.mock('@/lib/utils/fetch-api', () => ({
  fetchApi: vi.fn(),
}));

// Mock child components
vi.mock('@/app/components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
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

  it('should render Heading', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('heading')).toBeInTheDocument();
  });

  it('should prefetch published releases data', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(mockPrefetchQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['releases', 'published'],
      })
    );
  });

  it('should render ReleasesContent within HydrationBoundary', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('releases-content')).toBeInTheDocument();
  });
});
