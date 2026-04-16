/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ArtistDetailPage, { generateMetadata } from './page';

vi.mock('server-only', () => ({}));

// Mock notFound
const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

// Mock ArtistService (still used by generateMetadata)
const mockGetArtistBySlugWithReleases = vi.fn();
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtistBySlugWithReleases: (...args: unknown[]) => mockGetArtistBySlugWithReleases(...args),
  },
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: {
    displayName?: string | null;
    firstName: string;
    surname: string;
  }) => artist.displayName ?? `${artist.firstName} ${artist.surname}`,
}));

// Mock TanStack Query SSR utilities
const mockSetQueryData = vi.fn();
const mockDehydratedState = { queries: [], mutations: [] };
vi.mock('@tanstack/react-query', () => ({
  dehydrate: () => mockDehydratedState,
  HydrationBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/utils/get-query-client', () => ({
  getQueryClient: () => ({
    setQueryData: mockSetQueryData,
  }),
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

vi.mock('@/app/components/artist-detail-content', () => ({
  ArtistDetailContent: ({
    slug,
    initialReleaseId,
  }: {
    slug: string;
    initialReleaseId?: string;
  }) => (
    <div
      data-testid="artist-detail-content"
      data-slug={slug}
      data-initial-release-id={initialReleaseId ?? ''}
    >
      Artist Detail
    </div>
  ),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ArtistDetailPage', () => {
  const mockArtistData = {
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: null,
    shortBio: 'A talented musician',
    slug: 'john-doe',
  };

  const defaultParams = Promise.resolve({ slug: 'john-doe' });
  const defaultSearchParams = Promise.resolve({} as Record<string, string | string[] | undefined>);

  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockArtistData),
    });
    mockGetArtistBySlugWithReleases.mockResolvedValue({
      success: true,
      data: mockArtistData,
    });
  });

  it('should render page structure', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should fetch artist data with correct URL', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/artists/slug/john-doe?withReleases=true',
      { cache: 'no-store' }
    );
  });

  it('should set query data on successful fetch', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockSetQueryData).toHaveBeenCalledWith(
      ['artists', 'bySlug', 'john-doe'],
      mockArtistData
    );
  });

  it('should call notFound when artist returns 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });

    await ArtistDetailPage({ params: defaultParams, searchParams: defaultSearchParams });

    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should not set query data on 500 error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockSetQueryData).not.toHaveBeenCalled();
  });

  it('should render ArtistDetailContent with slug', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const content = screen.getByTestId('artist-detail-content');
    expect(content).toHaveAttribute('data-slug', 'john-doe');
  });

  it('should pass initialReleaseId from search params', async () => {
    const releaseSearchParams = Promise.resolve({
      release: 'release-2',
    } as Record<string, string | string[] | undefined>);

    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: releaseSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-detail-content')).toHaveAttribute(
      'data-initial-release-id',
      'release-2'
    );
  });

  it('should not pass initialReleaseId when release param is missing', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-detail-content')).toHaveAttribute(
      'data-initial-release-id',
      ''
    );
  });

  it('should ignore non-string release search param', async () => {
    const arraySearchParams = Promise.resolve({
      release: ['release-1', 'release-2'],
    } as Record<string, string | string[] | undefined>);

    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: arraySearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-detail-content')).toHaveAttribute(
      'data-initial-release-id',
      ''
    );
  });

  it('should URL-encode the slug in fetch URL', async () => {
    const specialParams = Promise.resolve({ slug: 'artist/special&slug' });
    const Page = await ArtistDetailPage({
      params: specialParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('artist%2Fspecial%26slug'),
      expect.anything()
    );
  });

  describe('generateMetadata', () => {
    it('should return artist name as title', async () => {
      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.title).toBe('John Doe');
    });

    it('should return shortBio as description', async () => {
      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('A talented musician');
    });

    it('should return fallback description when shortBio is missing', async () => {
      mockGetArtistBySlugWithReleases.mockResolvedValue({
        success: true,
        data: { ...mockArtistData, shortBio: null },
      });

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('Listen to releases by John Doe.');
    });

    it('should return fallback description when shortBio is empty string', async () => {
      mockGetArtistBySlugWithReleases.mockResolvedValue({
        success: true,
        data: { ...mockArtistData, shortBio: '' },
      });

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('Listen to releases by John Doe.');
    });

    it('should return "Artist Not Found" when service fails', async () => {
      mockGetArtistBySlugWithReleases.mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.title).toBe('Artist Not Found');
    });
  });
});
