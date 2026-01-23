import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';

import useTracksQuery from '@/app/hooks/use-tracks-query';

import { TrackDataView } from './track-data-view';

// Mock the useTracksQuery hook
vi.mock('@/app/hooks/use-tracks-query', () => ({
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

describe('TrackDataView', () => {
  const mockTracks = {
    tracks: [
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
    ],
    count: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state when pending', () => {
    vi.mocked(useTracksQuery).mockReturnValue({
      isPending: true,
      error: null,
      data: null,
      refetch: vi.fn(),
    } as never);

    render(<TrackDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Loading tracks...')).toBeInTheDocument();
  });

  it('should render error state when error occurs', () => {
    vi.mocked(useTracksQuery).mockReturnValue({
      isPending: false,
      error: Error('Failed to fetch'),
      data: null,
      refetch: vi.fn(),
    } as never);

    render(<TrackDataView />, { wrapper: createWrapper() });

    expect(screen.getByText('Error loading tracks')).toBeInTheDocument();
  });

  it('should render tracks when data is available', async () => {
    vi.mocked(useTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockTracks,
      refetch: vi.fn(),
    } as never);

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
    vi.mocked(useTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockTracks,
      refetch: vi.fn(),
    } as never);

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create track/i })).toBeInTheDocument();
    });
  });

  it('should render search input', async () => {
    vi.mocked(useTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: mockTracks,
      refetch: vi.fn(),
    } as never);

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search track/i)).toBeInTheDocument();
    });
  });

  it('should render no data message when tracks array is empty', async () => {
    vi.mocked(useTracksQuery).mockReturnValue({
      isPending: false,
      error: null,
      data: { tracks: [], count: 0 },
      refetch: vi.fn(),
    } as never);

    render(<TrackDataView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });
  });
});
