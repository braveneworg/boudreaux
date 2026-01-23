import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import useFeaturedArtistsQuery from '@/app/hooks/use-featured-artists-query';

import { FeaturedArtistDataView } from './featured-artist-data-view';

// Mock the useFeaturedArtistsQuery hook
vi.mock('@/app/hooks/use-featured-artists-query', () => ({
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
        track: null,
        release: null,
        group: null,
      },
    ],
    count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
