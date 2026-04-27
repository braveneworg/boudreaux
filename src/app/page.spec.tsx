/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import ReactDOM from 'react-dom';

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
const mockGetQueryData = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchQuery: mockPrefetchQuery,
    getQueryData: mockGetQueryData,
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
  beforeEach(() => {
    mockGetQueryData.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('preloads first featured artist CDN cover art when available', async () => {
    const preloadSpy = vi.spyOn(ReactDOM, 'preload').mockImplementation(() => undefined);

    mockGetQueryData.mockReturnValue({
      featuredArtists: [
        {
          id: 'featured-1',
          isActive: true,
          sortOrder: 1,
          displayName: 'Jane Doe',
          coverArt: 'https://cdn.example.com/releases/cover.jpg',
          artists: [],
          release: { coverArt: 'https://cdn.example.com/releases/cover.jpg' },
        },
      ],
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(preloadSpy).toHaveBeenCalledTimes(1);
    expect(preloadSpy).toHaveBeenCalledWith(
      'https://cdn.example.com/releases/cover.jpg',
      expect.objectContaining({
        as: 'image',
        fetchPriority: 'high',
        imageSizes: '(max-width: 640px) 100vw, 576px',
      })
    );

    expect(preloadSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        imageSrcSet: expect.stringContaining('828w'),
      })
    );
  });

  it('does not preload when first cover art is a data URL', async () => {
    const preloadSpy = vi.spyOn(ReactDOM, 'preload').mockImplementation(() => undefined);

    mockGetQueryData.mockReturnValue({
      featuredArtists: [
        {
          id: 'featured-1',
          isActive: true,
          sortOrder: 1,
          displayName: 'Jane Doe',
          artists: [],
          release: { coverArt: 'data:image/jpeg;base64,abc123' },
        },
      ],
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(preloadSpy).not.toHaveBeenCalled();
  });

  it('does not preload when first cover art is a blob URL', async () => {
    const preloadSpy = vi.spyOn(ReactDOM, 'preload').mockImplementation(() => undefined);

    mockGetQueryData.mockReturnValue({
      featuredArtists: [
        {
          id: 'featured-1',
          isActive: true,
          sortOrder: 1,
          displayName: 'Jane Doe',
          artists: [],
          release: { coverArt: 'blob:https://example.com/1234' },
        },
      ],
    });

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(preloadSpy).not.toHaveBeenCalled();
  });
});
