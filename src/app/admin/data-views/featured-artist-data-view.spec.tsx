/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useFeaturedArtistsQuery } from '@/app/hooks/use-featured-artists-query';
import { publishFeaturedArtistsToSiteAction } from '@/lib/actions/publish-featured-artists-action';

import { FeaturedArtistDataView } from './featured-artist-data-view';

// Mock the useFeaturedArtistsQuery hook
vi.mock('@/app/hooks/use-featured-artists-query', () => ({
  useFeaturedArtistsQuery: vi.fn(),
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

// Mock publish action
vi.mock('@/lib/actions/publish-featured-artists-action', () => ({
  publishFeaturedArtistsToSiteAction: vi.fn(),
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

/** Wraps an array of featured-artist rows in the infinite-query page shape. */
const toInfiniteResult = (rows: unknown[]) => ({
  isPending: false,
  error: null,
  data: { pages: [{ rows, nextSkip: null }] },
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
});

describe('FeaturedArtistDataView', () => {
  const mockRows = [
    {
      id: 'featured-123',
      displayName: 'Featured Artist Name',
      featuredOn: '2024-01-15T00:00:00.000Z',
      position: 1,
      description: 'A featured artist description',
      coverArt: 'https://example.com/cover.jpg',
      images: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      publishedOn: null,
      artists: [],
      digitalFormat: null,
      release: null,
    },
  ];

  it('should render loading state when pending', () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      ...toInfiniteResult([]),
      isPending: true,
      data: undefined,
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading featured artists...')).toBeInTheDocument();
  });

  it('should render error state when error occurs', () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      ...toInfiniteResult([]),
      error: Error('Failed to fetch'),
      data: undefined,
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Error loading featured artists')).toBeInTheDocument();
  });

  it('should render featured artists data when loaded', async () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Featured Artist Name')).toBeInTheDocument();
    });
  });

  it('should display correct fields for featured artist', async () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Featured Artist Name')).toBeInTheDocument();
    });
  });

  it('should render rows with nested artist data', async () => {
    const rows = [
      {
        ...mockRows[0],
        id: 'featured-with-artist',
        displayName: 'Featured With Artist',
        artists: [
          {
            id: 'artist-1',
            displayName: 'Jazzy McJazzface',
            firstName: 'Jazzy',
            surname: 'McJazzface',
          },
        ],
      },
    ];

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(rows) as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Featured With Artist')).toBeInTheDocument();
    });
  });

  it('should show resolved display name when displayName is null', async () => {
    const rows = [
      {
        ...mockRows[0],
        id: 'featured-no-display-name',
        displayName: null,
        position: 3,
        description: 'No display name set',
        coverArt: null,
        artists: [{ id: 'artist-2', displayName: 'John Doe', firstName: 'John', surname: 'Doe' }],
      },
    ];

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(rows) as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    // The display name field should show the resolved name from getFeaturedArtistDisplayName
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Ensure '-' is NOT shown as the display name fallback
    const displayNameLabels = screen.getAllByText(/Display Name/);
    for (const label of displayNameLabels) {
      const parentSpan = label.closest('span');
      expect(parentSpan?.textContent).not.toContain(': -');
    }
  });

  it('renders the controlled search input', async () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search featured artists...')).toBeInTheDocument();
    });
  });

  describe('Publish to Landing Page button', () => {
    it('should render the publish button when data is loaded', () => {
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /publish to landing page/i })).toBeInTheDocument();
    });

    it('should not render the publish button when loading', () => {
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        ...toInfiniteResult([]),
        isPending: true,
        data: undefined,
      } as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      expect(
        screen.queryByRole('button', { name: /publish to landing page/i })
      ).not.toBeInTheDocument();
    });

    it('should not render the publish button when there is an error', () => {
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        ...toInfiniteResult([]),
        error: Error('Failed'),
        data: undefined,
      } as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      expect(
        screen.queryByRole('button', { name: /publish to landing page/i })
      ).not.toBeInTheDocument();
    });

    it('should call the publish action and show success toast on click', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      vi.mocked(publishFeaturedArtistsToSiteAction).mockResolvedValue({ success: true });
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      const publishButton = screen.getByRole('button', { name: /publish to landing page/i });
      await user.click(publishButton);

      const { toast } = await import('sonner');
      await waitFor(() => {
        expect(publishFeaturedArtistsToSiteAction).toHaveBeenCalledOnce();
        expect(toast.success).toHaveBeenCalledWith('Featured artists published to landing page');
      });
    });

    it('should show error toast when publish action fails', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      vi.mocked(publishFeaturedArtistsToSiteAction).mockResolvedValue({
        success: false,
        error: 'Failed to publish',
      });
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      const publishButton = screen.getByRole('button', { name: /publish to landing page/i });
      await user.click(publishButton);

      const { toast } = await import('sonner');
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to publish');
      });
    });

    it('should show fallback error toast when publish action fails without an error message', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      vi.mocked(publishFeaturedArtistsToSiteAction).mockResolvedValue({
        success: false,
      });
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(mockRows) as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      await user.click(screen.getByRole('button', { name: /publish to landing page/i }));

      const { toast } = await import('sonner');
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to publish');
      });
    });
  });

  it('should fall back to "Unnamed" when getFeaturedArtistDisplayName resolves to null', async () => {
    const rows = [
      {
        ...mockRows[0],
        id: 'featured-unnamed',
        displayName: null,
        position: 8,
        description: null,
        coverArt: null,
        // No connected artists — display name resolution returns null,
        // exercising the `?? 'Unnamed'` fallback branch.
        artists: [],
      },
    ];

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue(toInfiniteResult(rows) as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Unnamed')).toBeInTheDocument();
    });
  });
});
