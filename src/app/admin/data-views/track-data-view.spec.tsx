/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import useInfiniteTracksQuery from '@/app/hooks/use-infinite-tracks-query';

import { TrackDataView } from './track-data-view';

// Mock the useInfiniteTracksQuery hook
vi.mock('@/app/hooks/use-infinite-tracks-query', () => ({
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

interface TracksResponse {
  tracks: Array<Record<string, unknown>>;
  count: number;
  totalCount: number;
  hasMore: boolean;
}

describe('TrackDataView', () => {
  const mockTracks = [
    {
      id: 'track-123',
      title: 'Test Track',
      duration: 225,
      audioUrl: 'https://example.com/audio.mp3',
      position: 1,
      images: [],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
      publishedOn: null,
      deletedOn: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state when pending', () => {
    vi.mocked(useInfiniteTracksQuery).mockReturnValue({
      isPending: true,
      error: null,
      tracks: [],
      refetch: vi.fn(),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      totalCount: 0,
      data: undefined,
      status: 'pending',
      fetchStatus: 'fetching',
      isError: false,
      isSuccess: false,
      isLoading: true,
      isFetching: true,
      isRefetching: false,
      isLoadingError: false,
      isRefetchError: false,
      isPaused: false,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      dataUpdatedAt: 0,
      isPlaceholderData: false,
      isFetchNextPageError: false,
      isFetchPreviousPageError: false,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isInitialLoading: true,
      isStale: false,
      isEnabled: true,
      promise: Promise.resolve(undefined) as unknown as Promise<InfiniteData<TracksResponse>>,
    });

    render(<TrackDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading tracks...')).toBeInTheDocument();
  });

  it('should render error state when error occurs', () => {
    vi.mocked(useInfiniteTracksQuery).mockReturnValue({
      isPending: false,
      error: Error('Failed to fetch'),
      tracks: [],
      refetch: vi.fn(),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      totalCount: 0,
      data: undefined,
      status: 'error',
      fetchStatus: 'idle',
      isError: true,
      isSuccess: false,
      isLoading: false,
      isFetching: false,
      isRefetching: false,
      isLoadingError: true,
      isRefetchError: false,
      isPaused: false,
      failureCount: 1,
      failureReason: Error('Failed to fetch'),
      errorUpdateCount: 1,
      errorUpdatedAt: Date.now(),
      dataUpdatedAt: 0,
      isPlaceholderData: false,
      isFetchNextPageError: false,
      isFetchPreviousPageError: false,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      isStale: false,
      isEnabled: true,
      promise: Promise.reject(Error('Failed to fetch')).catch(() => {}) as unknown as Promise<
        InfiniteData<TracksResponse>
      >,
    });

    render(<TrackDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Error loading tracks')).toBeInTheDocument();
  });

  it('should render tracks when data is available', async () => {
    vi.mocked(useInfiniteTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      tracks: mockTracks,
      refetch: vi.fn(),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      totalCount: 1,
      data: {
        pages: [{ tracks: mockTracks, count: 1, totalCount: 1, hasMore: false }],
        pageParams: [0],
      },
      status: 'success',
      fetchStatus: 'idle',
      isError: false,
      isSuccess: true,
      isLoading: false,
      isFetching: false,
      isRefetching: false,
      isLoadingError: false,
      isRefetchError: false,
      isPaused: false,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      dataUpdatedAt: Date.now(),
      isPlaceholderData: false,
      isFetchNextPageError: false,
      isFetchPreviousPageError: false,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      isStale: false,
      isEnabled: true,
      promise: Promise.resolve({
        pages: [{ tracks: mockTracks, count: 1, totalCount: 1, hasMore: false }],
        pageParams: [0],
      }) as Promise<InfiniteData<TracksResponse>>,
    });

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Test Track/)).toBeInTheDocument();
    });

    // Check for track fields
    expect(screen.getByText(/Title/)).toBeInTheDocument();
    expect(screen.getByText(/Duration/)).toBeInTheDocument();
    expect(screen.getByText(/Audio Url/)).toBeInTheDocument();
  });

  it('should render create track button', async () => {
    vi.mocked(useInfiniteTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      tracks: mockTracks,
      refetch: vi.fn(),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      totalCount: 1,
      data: {
        pages: [{ tracks: mockTracks, count: 1, totalCount: 1, hasMore: false }],
        pageParams: [0],
      },
      status: 'success',
      fetchStatus: 'idle',
      isError: false,
      isSuccess: true,
      isLoading: false,
      isFetching: false,
      isRefetching: false,
      isLoadingError: false,
      isRefetchError: false,
      isPaused: false,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      dataUpdatedAt: Date.now(),
      isPlaceholderData: false,
      isFetchNextPageError: false,
      isFetchPreviousPageError: false,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      isStale: false,
      isEnabled: true,
      promise: Promise.resolve({
        pages: [{ tracks: mockTracks, count: 1, totalCount: 1, hasMore: false }],
        pageParams: [0],
      }) as Promise<InfiniteData<TracksResponse>>,
    });

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create track/i })).toBeInTheDocument();
    });
  });

  it('should render search input', async () => {
    vi.mocked(useInfiniteTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      tracks: mockTracks,
      refetch: vi.fn(),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      totalCount: 1,
      data: {
        pages: [{ tracks: mockTracks, count: 1, totalCount: 1, hasMore: false }],
        pageParams: [0],
      },
      status: 'success',
      fetchStatus: 'idle',
      isError: false,
      isSuccess: true,
      isLoading: false,
      isFetching: false,
      isRefetching: false,
      isLoadingError: false,
      isRefetchError: false,
      isPaused: false,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      dataUpdatedAt: Date.now(),
      isPlaceholderData: false,
      isFetchNextPageError: false,
      isFetchPreviousPageError: false,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      isStale: false,
      isEnabled: true,
      promise: Promise.resolve({
        pages: [{ tracks: mockTracks, count: 1, totalCount: 1, hasMore: false }],
        pageParams: [0],
      }) as Promise<InfiniteData<TracksResponse>>,
    });

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search track/i)).toBeInTheDocument();
    });
  });

  it('should render no data message when tracks array is empty', async () => {
    vi.mocked(useInfiniteTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      tracks: [],
      refetch: vi.fn(),
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      totalCount: 0,
      data: {
        pages: [{ tracks: [], count: 0, totalCount: 0, hasMore: false }],
        pageParams: [0],
      },
      status: 'success',
      fetchStatus: 'idle',
      isError: false,
      isSuccess: true,
      isLoading: false,
      isFetching: false,
      isRefetching: false,
      isLoadingError: false,
      isRefetchError: false,
      isPaused: false,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      dataUpdatedAt: Date.now(),
      isPlaceholderData: false,
      isFetchNextPageError: false,
      isFetchPreviousPageError: false,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
      isFetched: true,
      isFetchedAfterMount: true,
      isInitialLoading: false,
      isStale: false,
      isEnabled: true,
      promise: Promise.resolve({
        pages: [{ tracks: [], count: 0, totalCount: 0, hasMore: false }],
        pageParams: [0],
      }) as Promise<InfiniteData<TracksResponse>>,
    });

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });
  });
});
