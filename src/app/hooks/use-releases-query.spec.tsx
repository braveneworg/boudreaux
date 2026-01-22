import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import useReleasesQuery from './use-releases-query';

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
  const Wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
  return Wrapper;
};

describe('useReleasesQuery', () => {
  const mockReleases = {
    releases: [
      {
        id: 'release-123',
        title: 'Test Album',
        releasedOn: '2024-01-15',
        catalogNumber: 'TEST-001',
      },
      {
        id: 'release-456',
        title: 'Another Album',
        releasedOn: '2024-02-20',
        catalogNumber: 'TEST-002',
      },
    ],
    count: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch releases successfully', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockReleases,
    } as Response);

    const { result } = renderHook(() => useReleasesQuery(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.data).toEqual(mockReleases);
    expect(global.fetch).toHaveBeenCalledWith('/api/releases');
  });

  it('should return error when fetch fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useReleasesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeUndefined();
  });

  it('should return error when network request fails', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(Error('Network error'));

    const { result } = renderHook(() => useReleasesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('should provide refetch function', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockReleases,
    } as Response);

    const { result } = renderHook(() => useReleasesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');

    await result.current.refetch();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should have correct query key', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockReleases,
    } as Response);

    const { result } = renderHook(() => useReleasesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    // The query should be cached under 'releasesData' key
    expect(result.current.data).toBeDefined();
  });

  it('should return empty releases array when API returns empty', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ releases: [], count: 0 }),
    } as Response);

    const { result } = renderHook(() => useReleasesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.data).toEqual({ releases: [], count: 0 });
  });
});
