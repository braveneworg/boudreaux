/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ArtistSearchPage from './page';

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
vi.mock('@/app/components/artist-search-input', () => ({
  ArtistSearchInput: () => <div data-testid="artist-search-input">Search Input</div>,
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <nav data-testid="breadcrumb-menu">Breadcrumbs</nav>,
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/heading', () => ({
  Heading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock('@/app/components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

describe('ArtistSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render page structure', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
    expect(screen.getByTestId('artist-search-input')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search Artists' })).toBeInTheDocument();
  });

  it('should prefetch search results when query is provided', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    expect(mockPrefetchQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['artists', 'search', 'john'],
      })
    );
  });

  it('should not prefetch when query is empty', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({}),
    });
    render(Page);

    expect(mockPrefetchQuery).not.toHaveBeenCalled();
  });

  it('should not prefetch when q is not a string', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: ['john', 'doe'] }),
    });
    render(Page);

    expect(mockPrefetchQuery).not.toHaveBeenCalled();
  });
});
