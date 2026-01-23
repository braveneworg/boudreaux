import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import useFeaturedArtistsQuery from './use-featured-artists-query';

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

describe('useFeaturedArtistsQuery', () => {
  const mockFeaturedArtists = {
    featuredArtists: [
      {
        id: 'featured-123',
        displayName: 'Featured Artist Name',
        featuredOn: '2024-01-15T00:00:00.000Z',
        position: 1,
        description: 'A featured artist description',
        coverArt: 'https://example.com/cover.jpg',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        publishedOn: null,
        deletedOn: null,
      },
    ],
    count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch featured artists successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFeaturedArtists,
    } as Response);

    const { result } = renderHook(() => useFeaturedArtistsQuery(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.data).toEqual(mockFeaturedArtists);
    expect(result.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/featured-artists');
  });

  it('should handle fetch error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useFeaturedArtistsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to fetch featured artists');
  });

  it('should provide refetch function', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockFeaturedArtists,
    } as Response);

    const { result } = renderHook(() => useFeaturedArtistsQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');

    // Call refetch and verify it works
    await result.current.refetch();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
