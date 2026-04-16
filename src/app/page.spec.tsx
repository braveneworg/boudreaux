/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import Home from './page';

vi.mock('server-only', () => ({}));

// Mock TanStack Query SSR utilities
const mockPrefetchQuery = vi.fn().mockResolvedValue(undefined);
const mockGetQueryData = vi.fn();
const mockDehydratedState = { queries: [], mutations: [] };
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

vi.mock('@/lib/utils/cloudfront-loader', () => ({
  buildBannerPreloadSrcSet: vi.fn(
    (filename: string) =>
      `https://cdn.fakefourrecords.com/media/banners/${filename}?w=640&q=75&f=webp 640w, https://cdn.fakefourrecords.com/media/banners/${filename}?w=1920&q=75&f=webp 1920w`
  ),
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

  it('should include a preload link when banner data is available', async () => {
    mockGetQueryData.mockReturnValue({
      banners: [{ imageFilename: 'hero.jpg' }],
    });

    const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(buildBannerPreloadSrcSet).toHaveBeenCalledWith('hero.jpg');
    expect(mockGetQueryData).toHaveBeenCalledWith(['banners', 'active']);
  });

  it('should not call buildBannerPreloadSrcSet when no banners exist', async () => {
    mockGetQueryData.mockReturnValue({ banners: [] });

    const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(buildBannerPreloadSrcSet).not.toHaveBeenCalled();
  });

  it('should not call buildBannerPreloadSrcSet when banner data is undefined', async () => {
    mockGetQueryData.mockReturnValue(undefined);

    const { buildBannerPreloadSrcSet } = await import('@/lib/utils/cloudfront-loader');

    const HomeComponent = await Home();
    render(HomeComponent);

    expect(buildBannerPreloadSrcSet).not.toHaveBeenCalled();
  });
});
