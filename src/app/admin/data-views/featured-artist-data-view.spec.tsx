/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('FeaturedArtistDataView', () => {
  const mockFeaturedArtists = {
    featuredArtists: [
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
        deletedOn: null,
        artists: [],
        digitalFormat: null,
        release: null,
      },
    ],
    count: 1,
  };
  it('should render loading state when pending', () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: true,
      error: null,
      data: null,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading featured artists...')).toBeInTheDocument();
  });

  it('should render error state when error occurs', () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: Error('Failed to fetch'),
      data: null,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Error loading featured artists')).toBeInTheDocument();
  });

  it('should render featured artists data when loaded', async () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockFeaturedArtists,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Featured Artist Name')).toBeInTheDocument();
    });
  });

  it('should display correct fields for featured artist', async () => {
    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockFeaturedArtists,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Featured Artist Name')).toBeInTheDocument();
    });
  });

  it('should filter results when searching by nested artist displayName', async () => {
    const mockDataWithArtists = {
      featuredArtists: [
        {
          id: 'featured-with-artist',
          displayName: 'Featured With Artist',
          featuredOn: '2024-01-15T00:00:00.000Z',
          position: 1,
          description: 'Some description',
          coverArt: null,
          images: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          publishedOn: null,
          deletedOn: null,
          artists: [
            {
              id: 'artist-1',
              displayName: 'Jazzy McJazzface',
              firstName: 'Jazzy',
              surname: 'McJazzface',
            },
          ],
          digitalFormat: null,
          release: null,
          group: null,
        },
      ],
      count: 1,
    };

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockDataWithArtists,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Featured With Artist')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search featured artists...');

    // Search by nested artist name should show the featured artist
    fireEvent.change(searchInput, { target: { value: 'Jazzy McJazzface' } });

    await waitFor(() => {
      expect(screen.getByText('Featured With Artist')).toBeInTheDocument();
    });

    // Search for something unrelated should hide it
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Band XYZ' } });

    await waitFor(() => {
      expect(screen.queryByText('Featured With Artist')).not.toBeInTheDocument();
    });
  });

  it('should show resolved display name when displayName is null', async () => {
    const mockDataWithNullDisplayName = {
      featuredArtists: [
        {
          id: 'featured-no-display-name',
          displayName: null,
          featuredOn: '2024-03-01T00:00:00.000Z',
          position: 3,
          description: 'No display name set',
          coverArt: null,
          images: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          publishedOn: null,
          deletedOn: null,
          artists: [
            {
              id: 'artist-2',
              displayName: 'John Doe',
              firstName: 'John',
              surname: 'Doe',
            },
          ],
          digitalFormat: null,
          release: null,
          group: null,
        },
      ],
      count: 1,
    };

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockDataWithNullDisplayName,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    // The display name field should show the resolved name from getFeaturedArtistDisplayName
    // which returns the first artist's displayName when the featured artist has no displayName
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

  it('should filter results when searching by description', async () => {
    const mockDataWithDescription = {
      featuredArtists: [
        {
          id: 'featured-desc',
          displayName: 'Descriptive Artist',
          featuredOn: '2024-04-01T00:00:00.000Z',
          position: 4,
          description: 'Unique underwater jazz fusion performance',
          coverArt: null,
          images: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          publishedOn: null,
          deletedOn: null,
          artists: [],
          digitalFormat: null,
          release: null,
          group: null,
        },
      ],
      count: 1,
    };

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockDataWithDescription,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Descriptive Artist')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search featured artists...');

    // Search by a phrase from the description
    fireEvent.change(searchInput, { target: { value: 'underwater jazz fusion' } });

    await waitFor(() => {
      expect(screen.getByText('Descriptive Artist')).toBeInTheDocument();
    });

    // Search for something not in description should hide it
    fireEvent.change(searchInput, { target: { value: 'classical piano recital' } });

    await waitFor(() => {
      expect(screen.queryByText('Descriptive Artist')).not.toBeInTheDocument();
    });
  });

  it('should handle search on item with null displayName and null description', async () => {
    const mockDataNullFields = {
      featuredArtists: [
        {
          id: 'featured-null-fields',
          displayName: null,
          featuredOn: '2024-05-01T00:00:00.000Z',
          position: 5,
          description: null,
          coverArt: null,
          images: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          publishedOn: null,
          deletedOn: null,
          artists: [
            {
              id: 'artist-3',
              displayName: 'Searchable Artist Name',
              firstName: 'Searchable',
              surname: 'Artist',
            },
          ],
          digitalFormat: null,
          release: null,
          group: null,
        },
      ],
      count: 1,
    };

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockDataNullFields,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Searchable Artist Name')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search featured artists...');

    // Search by artist name should still find it despite null displayName and description
    fireEvent.change(searchInput, { target: { value: 'Searchable Artist Name' } });

    await waitFor(() => {
      expect(screen.getByText('Searchable Artist Name')).toBeInTheDocument();
    });
  });

  it('should handle search on item with null artists array', async () => {
    const mockDataNullArtists = {
      featuredArtists: [
        {
          id: 'featured-null-artists',
          displayName: 'Only Display Name',
          featuredOn: '2024-06-01T00:00:00.000Z',
          position: 6,
          description: null,
          coverArt: null,
          images: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          publishedOn: null,
          deletedOn: null,
          artists: null,
          digitalFormat: null,
          release: null,
          group: null,
        },
      ],
      count: 1,
    };

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockDataNullArtists,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Only Display Name')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search featured artists...');

    // Search by display name should find it even with null artists
    fireEvent.change(searchInput, { target: { value: 'Only Display Name' } });

    await waitFor(() => {
      expect(screen.getByText('Only Display Name')).toBeInTheDocument();
    });
  });

  it('should handle search on item with artist that has null displayName', async () => {
    const mockDataNullArtistName = {
      featuredArtists: [
        {
          id: 'featured-null-artist-name',
          displayName: 'Parent Featured Name',
          featuredOn: '2024-07-01T00:00:00.000Z',
          position: 7,
          description: null,
          coverArt: null,
          images: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          publishedOn: null,
          deletedOn: null,
          artists: [
            {
              id: 'artist-no-name',
              displayName: null,
              firstName: null,
              surname: null,
            },
          ],
          digitalFormat: null,
          release: null,
          group: null,
        },
      ],
      count: 1,
    };

    vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockDataNullArtistName,
      refetch: vi.fn(),
    } as never);

    render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Parent Featured Name')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search featured artists...');

    // Search by parent display name should find it
    fireEvent.change(searchInput, { target: { value: 'Parent Featured Name' } });

    await waitFor(() => {
      expect(screen.getByText('Parent Featured Name')).toBeInTheDocument();
    });

    // Search for random text should not find it since artist has no displayName
    fireEvent.change(searchInput, { target: { value: 'unknown musician xyz' } });

    await waitFor(() => {
      expect(screen.queryByText('Parent Featured Name')).not.toBeInTheDocument();
    });
  });

  describe('Publish to Landing Page button', () => {
    it('should render the publish button when data is loaded', () => {
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: mockFeaturedArtists,
        refetch: vi.fn(),
      } as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      expect(screen.getByRole('button', { name: /publish to landing page/i })).toBeInTheDocument();
    });

    it('should not render the publish button when loading', () => {
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        isPending: true,
        error: null,
        data: null,
        refetch: vi.fn(),
      } as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      expect(
        screen.queryByRole('button', { name: /publish to landing page/i })
      ).not.toBeInTheDocument();
    });

    it('should not render the publish button when there is an error', () => {
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        isPending: false,
        error: Error('Failed'),
        data: null,
        refetch: vi.fn(),
      } as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      expect(
        screen.queryByRole('button', { name: /publish to landing page/i })
      ).not.toBeInTheDocument();
    });

    it('should call the publish action and show success toast on click', async () => {
      const user = userEvent.setup();
      vi.mocked(publishFeaturedArtistsToSiteAction).mockResolvedValue({ success: true });
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: mockFeaturedArtists,
        refetch: vi.fn(),
      } as never);

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
      const user = userEvent.setup();
      vi.mocked(publishFeaturedArtistsToSiteAction).mockResolvedValue({
        success: false,
        error: 'Failed to publish',
      });
      vi.mocked(useFeaturedArtistsQuery).mockReturnValue({
        isPending: false,
        error: null,
        data: mockFeaturedArtists,
        refetch: vi.fn(),
      } as never);

      render(<FeaturedArtistDataView />, { wrapper: createWrapper() });

      const publishButton = screen.getByRole('button', { name: /publish to landing page/i });
      await user.click(publishButton);

      const { toast } = await import('sonner');
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to publish');
      });
    });
  });
});
