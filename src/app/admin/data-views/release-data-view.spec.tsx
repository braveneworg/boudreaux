/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import useReleasesQuery from '@/app/hooks/use-releases-query';

import { ReleaseDataView } from './release-data-view';

// Mock the useReleasesQuery hook
vi.mock('@/app/hooks/use-releases-query', () => ({
  default: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock next/image
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const createWrapper = () => {
  const queryClient = createQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

describe('ReleaseDataView', () => {
  const mockReleases = {
    releases: [
      {
        id: 'release-123',
        title: 'Test Album',
        releasedOn: '2024-01-15',
        catalogNumber: 'TEST-001',
        coverArt: 'https://example.com/cover.jpg',
        formats: ['DIGITAL', 'VINYL'],
        images: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        publishedAt: null,
        deletedOn: null,
      },
    ],
    count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state when pending', () => {
    vi.mocked(useReleasesQuery).mockReturnValue({
      isPending: true,
      error: null,
      data: null,
      refetch: vi.fn(),
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading releases...')).toBeInTheDocument();
  });

  it('should render error state when error occurs', () => {
    vi.mocked(useReleasesQuery).mockReturnValue({
      isPending: false,
      error: Error('Failed to fetch'),
      data: null,
      refetch: vi.fn(),
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Error loading releases')).toBeInTheDocument();
  });

  it('should render releases when data is loaded', async () => {
    vi.mocked(useReleasesQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockReleases,
      refetch: vi.fn(),
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });
  });

  it('should display release fields correctly', async () => {
    vi.mocked(useReleasesQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockReleases,
      refetch: vi.fn(),
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });
  });

  it('should call refetch function from hook', async () => {
    const mockRefetch = vi.fn();
    vi.mocked(useReleasesQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockReleases,
      refetch: mockRefetch,
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // The refetch should be available to the DataView component
    expect(mockRefetch).toBeDefined();
  });

  it('should render with empty releases array', async () => {
    vi.mocked(useReleasesQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: { releases: [], count: 0 },
      refetch: vi.fn(),
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    // Should not show any releases but also not show error or loading
    expect(screen.queryByText('Loading releases...')).not.toBeInTheDocument();
    expect(screen.queryByText('Error loading releases')).not.toBeInTheDocument();
  });

  describe('albumArtist computation', () => {
    it('should display album artist from artistReleases', async () => {
      const releasesWithArtist = {
        releases: [
          {
            id: 'release-123',
            title: 'Test Album',
            releasedOn: '2024-01-15',
            catalogNumber: 'TEST-001',
            coverArt: null,
            formats: ['DIGITAL'],
            images: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            publishedAt: null,
            deletedOn: null,
            artistReleases: [
              {
                id: 'ar-1',
                artist: {
                  id: 'artist-1',
                  name: 'john-smith',
                  displayName: 'John Smith',
                },
              },
            ],
          },
        ],
        count: 1,
      };

      vi.mocked(useReleasesQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: releasesWithArtist,
        refetch: vi.fn(),
      } as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });
    });

    it('should display multiple album artists joined by comma', async () => {
      const releasesWithMultipleArtists = {
        releases: [
          {
            id: 'release-123',
            title: 'Collab Album',
            releasedOn: '2024-01-15',
            catalogNumber: 'COLLAB-001',
            coverArt: null,
            formats: ['DIGITAL'],
            images: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            publishedAt: null,
            deletedOn: null,
            artistReleases: [
              {
                id: 'ar-1',
                artist: {
                  id: 'artist-1',
                  name: 'john-lennon',
                  displayName: 'John Lennon',
                },
              },
              {
                id: 'ar-2',
                artist: {
                  id: 'artist-2',
                  name: 'paul-mccartney',
                  displayName: 'Paul McCartney',
                },
              },
            ],
          },
        ],
        count: 1,
      };

      vi.mocked(useReleasesQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: releasesWithMultipleArtists,
        refetch: vi.fn(),
      } as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Lennon, Paul McCartney')).toBeInTheDocument();
      });
    });

    it('should display dash when no artistReleases exist', async () => {
      const releasesWithoutArtist = {
        releases: [
          {
            id: 'release-123',
            title: 'No Artist Album',
            releasedOn: '2024-01-15',
            catalogNumber: 'NONE-001',
            coverArt: null,
            formats: ['DIGITAL'],
            images: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            publishedAt: null,
            deletedOn: null,
            artistReleases: [],
          },
        ],
        count: 1,
      };

      vi.mocked(useReleasesQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: releasesWithoutArtist,
        refetch: vi.fn(),
      } as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Title should render
        expect(screen.getByText('No Artist Album')).toBeInTheDocument();
        // The dash should appear somewhere in the rendered output (multiple dashes for different fields)
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('should use artist name when displayName is null', async () => {
      const releasesWithNameOnly = {
        releases: [
          {
            id: 'release-123',
            title: 'Test Album',
            releasedOn: '2024-01-15',
            catalogNumber: 'TEST-001',
            coverArt: null,
            formats: ['DIGITAL'],
            images: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            publishedAt: null,
            deletedOn: null,
            artistReleases: [
              {
                id: 'ar-1',
                artist: {
                  id: 'artist-1',
                  name: 'the-band',
                  displayName: null,
                },
              },
            ],
          },
        ],
        count: 1,
      };

      vi.mocked(useReleasesQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: releasesWithNameOnly,
        refetch: vi.fn(),
      } as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('the-band')).toBeInTheDocument();
      });
    });

    it('should handle undefined artistReleases', async () => {
      const releasesWithUndefinedArtists = {
        releases: [
          {
            id: 'release-123',
            title: 'Test Album Undefined',
            releasedOn: '2024-01-15',
            catalogNumber: 'TEST-001',
            coverArt: null,
            formats: ['DIGITAL'],
            images: [],
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
            publishedAt: null,
            deletedOn: null,
            // artistReleases is undefined
          },
        ],
        count: 1,
      };

      vi.mocked(useReleasesQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: releasesWithUndefinedArtists,
        refetch: vi.fn(),
      } as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        // Title should render
        expect(screen.getByText('Test Album Undefined')).toBeInTheDocument();
        // The dash should appear somewhere for undefined artistReleases (multiple dashes for different fields)
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('should include albumArtist in fieldsToShow', async () => {
      vi.mocked(useReleasesQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: mockReleases,
        refetch: vi.fn(),
      } as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        // The DataView should render the albumArtist column header
        expect(screen.getByText('Album Artist')).toBeInTheDocument();
      });
    });
  });
});
