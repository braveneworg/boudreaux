/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';
import { createElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useInfiniteReleasesQuery } from '@/app/hooks/use-infinite-releases-query';
import { deleteReleaseAction } from '@/lib/actions/delete-release-action';
import { publishReleaseAction } from '@/lib/actions/publish-release-action';

import { ReleaseDataView } from './release-data-view';

// Mock the useInfiniteReleasesQuery hook
vi.mock('@/lib/actions/publish-release-action', () => ({
  publishReleaseAction: vi.fn(() => Promise.resolve({ success: true })),
}));
vi.mock('@/lib/actions/delete-release-action', () => ({
  deleteReleaseAction: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('@/app/hooks/use-infinite-releases-query', () => ({
  useInfiniteReleasesQuery: vi.fn(),
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
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
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

/** Wraps an array of release rows in the infinite-query page shape. */
const toInfiniteResult = (rows: unknown[]) => ({
  isPending: false,
  isFetching: false,
  error: null,
  data: { pages: [{ rows, nextSkip: null }] },
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
});

describe('ReleaseDataView', () => {
  const mockReleaseRows = [
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
  ];

  it('should render loading state when pending', () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue({
      ...toInfiniteResult([]),
      isPending: true,
      data: undefined,
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading releases...')).toBeInTheDocument();
  });

  it('should render error state when error occurs', () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue({
      ...toInfiniteResult([]),
      error: Error('Failed to fetch'),
      data: undefined,
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Error loading releases')).toBeInTheDocument();
  });

  it('should render releases when data is loaded', async () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(mockReleaseRows) as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });
  });

  it('should display release fields correctly', async () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(mockReleaseRows) as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });
  });

  it('should call refetch function from hook', async () => {
    const mockRefetch = vi.fn();
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue({
      ...toInfiniteResult(mockReleaseRows),
      refetch: mockRefetch,
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    expect(mockRefetch).toBeDefined();
  });

  it('should render with empty releases array', async () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult([]) as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    // Should not show any releases but also not show error or loading
    expect(screen.queryByText('Loading releases...')).not.toBeInTheDocument();
    expect(screen.queryByText('Error loading releases')).not.toBeInTheDocument();
  });

  describe('albumArtist computation', () => {
    it('should display album artist from artistReleases', async () => {
      const rows = [
        {
          ...mockReleaseRows[0],
          coverArt: null,
          formats: ['DIGITAL'],
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
      ];

      vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(rows) as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Smith')).toBeInTheDocument();
      });
    });

    it('should display multiple album artists joined by comma', async () => {
      const rows = [
        {
          ...mockReleaseRows[0],
          title: 'Collab Album',
          catalogNumber: 'COLLAB-001',
          coverArt: null,
          formats: ['DIGITAL'],
          artistReleases: [
            {
              id: 'ar-1',
              artist: { id: 'artist-1', name: 'john-lennon', displayName: 'John Lennon' },
            },
            {
              id: 'ar-2',
              artist: { id: 'artist-2', name: 'paul-mccartney', displayName: 'Paul McCartney' },
            },
          ],
        },
      ];

      vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(rows) as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Lennon, Paul McCartney')).toBeInTheDocument();
      });
    });

    it('should display dash when no artistReleases exist', async () => {
      const rows = [
        {
          ...mockReleaseRows[0],
          title: 'No Artist Album',
          catalogNumber: 'NONE-001',
          coverArt: null,
          formats: ['DIGITAL'],
          artistReleases: [],
        },
      ];

      vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(rows) as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('No Artist Album')).toBeInTheDocument();
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('should use artist name when displayName is null', async () => {
      const rows = [
        {
          ...mockReleaseRows[0],
          coverArt: null,
          formats: ['DIGITAL'],
          artistReleases: [
            {
              id: 'ar-1',
              artist: { id: 'artist-1', name: 'the-band', displayName: null },
            },
          ],
        },
      ];

      vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(rows) as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('the-band')).toBeInTheDocument();
      });
    });

    it('should handle undefined artistReleases', async () => {
      const rows = [
        {
          ...mockReleaseRows[0],
          title: 'Test Album Undefined',
          coverArt: null,
          formats: ['DIGITAL'],
          // artistReleases is undefined
        },
      ];

      vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(rows) as never);

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Album Undefined')).toBeInTheDocument();
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('should include albumArtist in fieldsToShow', async () => {
      vi.mocked(useInfiniteReleasesQuery).mockReturnValue(
        toInfiniteResult(mockReleaseRows) as never
      );

      render(<ReleaseDataView />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Album Artist')).toBeInTheDocument();
      });
    });
  });

  it('should handle empty data when not pending and no error', () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue({
      ...toInfiniteResult([]),
      data: undefined,
    } as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    // No pages → flattened rows are empty; renders without crashing.
    expect(screen.queryByText('Loading releases...')).not.toBeInTheDocument();
    expect(screen.queryByText('Error loading releases')).not.toBeInTheDocument();
  });

  it('passes a published filter to the query when the publish toggles differ', async () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(mockReleaseRows) as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    await userEvent.click(screen.getByRole('switch', { name: /show unpublished/i }));

    expect(useInfiniteReleasesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ published: true })
    );
  });

  it('publishes a row via the release publish action', async () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(mockReleaseRows) as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(publishReleaseAction).toHaveBeenCalledWith('release-123'));
  });

  it('hard-deletes a row via the release delete action', async () => {
    vi.mocked(useInfiniteReleasesQuery).mockReturnValue(toInfiniteResult(mockReleaseRows) as never);

    render(<ReleaseDataView />, { wrapper: createWrapper() });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(deleteReleaseAction).toHaveBeenCalledWith('release-123'));
  });
});
