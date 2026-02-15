/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import useTracksQuery from './use-tracks-query';

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

describe('useTracksQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return isPending true initially', () => {
    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise(() => {
          // Never resolve to keep pending
        })
    );

    const { result } = renderHook(() => useTracksQuery(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('should fetch tracks successfully', async () => {
    const mockTracks = {
      tracks: [
        {
          id: 'track-123',
          title: 'Test Track',
          duration: 180,
          audioUrl: 'https://example.com/track.mp3',
          position: 1,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      count: 1,
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockTracks),
    } as Response);

    const { result } = renderHook(() => useTracksQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.data).toEqual(mockTracks);
    expect(global.fetch).toHaveBeenCalledWith('/api/tracks');
  });

  it('should return error when fetch fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useTracksQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
  });

  it('should provide refetch function', async () => {
    const mockTracks = { tracks: [], count: 0 };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTracks),
    } as Response);

    const { result } = renderHook(() => useTracksQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});
