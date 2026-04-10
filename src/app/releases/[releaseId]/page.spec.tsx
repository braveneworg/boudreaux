/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ReleasePlayerPage from './page';

vi.mock('server-only', () => ({}));

// Mock notFound
const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

// Mock TanStack Query SSR utilities
const mockPrefetchQuery = vi.fn().mockResolvedValue(undefined);
const mockSetQueryData = vi.fn();
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    prefetchQuery: mockPrefetchQuery,
    setQueryData: mockSetQueryData,
  }),
}));

vi.mock('@/lib/utils/fetch-api', () => ({
  fetchApi: vi.fn(),
}));

vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: (path: string) => `http://localhost:3000${path}`,
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

vi.mock('@/app/components/release-detail-content', () => ({
  ReleaseDetailContent: ({ releaseId, autoPlay }: { releaseId: string; autoPlay: boolean }) => (
    <div
      data-testid="release-detail-content"
      data-release-id={releaseId}
      data-auto-play={String(autoPlay)}
    >
      Release Detail
    </div>
  ),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ReleasePlayerPage', () => {
  const defaultParams = Promise.resolve({ releaseId: 'release-1' });
  const defaultSearchParams = Promise.resolve({} as Record<string, string | string[] | undefined>);
  const autoPlaySearchParams = Promise.resolve({
    autoplay: 'true',
  } as Record<string, string | string[] | undefined>);

  const mockReleaseData = { id: 'release-1', title: 'Test Album' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockReleaseData),
    });
  });

  it('should render page structure', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should fetch release data with correct URL', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/releases/release-1?withTracks=true',
      { cache: 'no-store' }
    );
  });

  it('should set query data on successful fetch', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['releases', 'detail', 'release-1'],
      mockReleaseData
    );
  });

  it('should call notFound when release returns 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });

    await ReleasePlayerPage({ params: defaultParams, searchParams: defaultSearchParams });

    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should not set query data on 500 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it('should prefetch supplementary data in parallel', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockPrefetchQuery).toHaveBeenCalledTimes(3);
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['releases', 'userStatus', 'release-1'],
      })
    );
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['releases', 'digitalFormats', 'release-1'],
      })
    );
    expect(mockPrefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['releases', 'related', 'release-1'],
      })
    );
  });

  it('should render ReleaseDetailContent with releaseId and autoPlay=false', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const content = screen.getByTestId('release-detail-content');
    expect(content).toHaveAttribute('data-release-id', 'release-1');
    expect(content).toHaveAttribute('data-auto-play', 'false');
  });

  it('should pass autoPlay=true when ?autoplay=true', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: autoPlaySearchParams,
    });
    render(Page);

    const content = screen.getByTestId('release-detail-content');
    expect(content).toHaveAttribute('data-auto-play', 'true');
  });

  it('should URL-encode the releaseId in fetch URL', async () => {
    const specialParams = Promise.resolve({ releaseId: 'release/special&id' });
    const Page = await ReleasePlayerPage({
      params: specialParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('release%2Fspecial%26id'),
      expect.anything()
    );
  });
});
