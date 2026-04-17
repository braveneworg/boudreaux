/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ToursPage from './page';

vi.mock('server-only', () => ({}));

// Mock TanStack Query SSR utilities — execute each queryFn so coverage sees the arrow functions
const mockPrefetchQuery = vi.fn().mockImplementation(async (opts: { queryFn?: () => unknown }) => {
  if (opts.queryFn) opts.queryFn();
});
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

// Mock child component
vi.mock('./components/tours-content', () => ({
  ToursContent: () => <div data-testid="tours-content">Tours Content</div>,
}));

describe('ToursPage', () => {
  it('should render page structure with heading', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(screen.getByRole('heading', { name: 'Tours' })).toBeInTheDocument();
    expect(
      screen.getByText('Search and browse upcoming and recent tour dates')
    ).toBeInTheDocument();
  });

  it('should prefetch tours data', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(mockPrefetchQuery).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        queryKey: ['tours', 'list'],
      })
    );
  });

  it('should render ToursContent within HydrationBoundary', async () => {
    const Page = await ToursPage();
    render(Page);

    expect(screen.getByTestId('tours-content')).toBeInTheDocument();
  });
});
