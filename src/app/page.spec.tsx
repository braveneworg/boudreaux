/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import Home from './page';

vi.mock('server-only', () => ({}));

// next/headers returns a Promise in Next.js 15+; the page reads the user-agent to pick a variant width.
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: () => '' }),
}));

// Override setupTests.ts next/server stub to expose userAgentFromString.
vi.mock('next/server', () => ({
  userAgentFromString: () => ({ device: { type: 'desktop' } }),
}));

// Mock TanStack Query SSR utilities — execute each queryFn so coverage sees the arrow functions
const mockPrefetchQuery = vi
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
    prefetchQuery: mockPrefetchQuery,
    getQueryData: vi.fn().mockReturnValue(undefined),
  }),
}));

vi.mock('@/lib/utils/fetch-api', () => ({
  fetchApi: vi.fn(),
}));

// Mock child components
vi.mock('./components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('./components/home-content', () => ({
  HomeContent: () => <div data-testid="home-content">Home Content</div>,
}));

describe('Home Page', () => {
  it('should render page structure', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('should prefetch featured artists and banners data', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(mockPrefetchQuery).toHaveBeenCalledTimes(2);
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['featuredArtists', 'active'],
      })
    );
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['banners', 'active'],
      })
    );
  });

  it('should render HomeContent within HydrationBoundary', async () => {
    const HomeComponent = await Home();
    render(HomeComponent);

    expect(screen.getByTestId('home-content')).toBeInTheDocument();
  });
});
