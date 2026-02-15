/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import useInfiniteTracksQuery from './use-infinite-tracks-query';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Helper to create a mock tracks response
 */
function createMockTracksResponse(options: {
  tracks: Array<{ id: string; title: string }>;
  totalCount: number;
  hasMore: boolean;
}) {
  return {
    tracks: options.tracks,
    count: options.tracks.length,
    totalCount: options.totalCount,
    hasMore: options.hasMore,
  };
}

/**
 * Helper to create a wrapper with QueryClientProvider
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useInfiniteTracksQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('initial fetch', () => {
    it('should fetch first page of tracks on mount', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [
          { id: 'track-1', title: 'Track 1' },
          { id: 'track-2', title: 'Track 2' },
        ],
        totalCount: 50,
        hasMore: true,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/tracks?skip=0&take=20');
      expect(result.current.tracks).toHaveLength(2);
      expect(result.current.totalCount).toBe(50);
    });

    it('should call API with correct skip and take params', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [],
        totalCount: 0,
        hasMore: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/tracks?skip=0&take=20');
    });
  });

  describe('data transformation', () => {
    it('should flatten tracks from all pages into single array', async () => {
      const page1Response = createMockTracksResponse({
        tracks: [
          { id: 'track-1', title: 'Track 1' },
          { id: 'track-2', title: 'Track 2' },
        ],
        totalCount: 4,
        hasMore: true,
      });

      const page2Response = createMockTracksResponse({
        tracks: [
          { id: 'track-3', title: 'Track 3' },
          { id: 'track-4', title: 'Track 4' },
        ],
        totalCount: 4,
        hasMore: false,
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Response),
        });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.tracks).toHaveLength(2);

      // Fetch next page
      await result.current.fetchNextPage();

      await waitFor(() => {
        expect(result.current.tracks).toHaveLength(4);
      });

      expect(result.current.tracks).toEqual([
        { id: 'track-1', title: 'Track 1' },
        { id: 'track-2', title: 'Track 2' },
        { id: 'track-3', title: 'Track 3' },
        { id: 'track-4', title: 'Track 4' },
      ]);
    });

    it('should deduplicate tracks with same ID across pages', async () => {
      const page1Response = createMockTracksResponse({
        tracks: [
          { id: 'track-1', title: 'Track 1' },
          { id: 'track-2', title: 'Track 2' },
        ],
        totalCount: 3,
        hasMore: true,
      });

      // Page 2 has track-2 duplicated (pagination shift scenario)
      const page2Response = createMockTracksResponse({
        tracks: [
          { id: 'track-2', title: 'Track 2' },
          { id: 'track-3', title: 'Track 3' },
        ],
        totalCount: 3,
        hasMore: false,
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Response),
        });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Fetch next page
      await result.current.fetchNextPage();

      await waitFor(() => {
        expect(result.current.tracks).toHaveLength(3);
      });

      // Should have only 3 tracks, not 4 (track-2 deduplicated)
      expect(result.current.tracks).toEqual([
        { id: 'track-1', title: 'Track 1' },
        { id: 'track-2', title: 'Track 2' },
        { id: 'track-3', title: 'Track 3' },
      ]);
    });

    it('should return total count from first page', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [{ id: 'track-1', title: 'Track 1' }],
        totalCount: 100,
        hasMore: true,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.totalCount).toBe(100);
    });

    it('should default to empty array when no data', async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      expect(result.current.tracks).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });
  });

  describe('pagination', () => {
    it('should indicate hasNextPage when more data available', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: Array.from({ length: 20 }, (_, i) => ({
          id: `track-${i + 1}`,
          title: `Track ${i + 1}`,
        })),
        totalCount: 50,
        hasMore: true,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.hasNextPage).toBe(true);
    });

    it('should indicate no next page when all data fetched', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [{ id: 'track-1', title: 'Track 1' }],
        totalCount: 1,
        hasMore: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.hasNextPage).toBe(false);
    });

    it('should fetch next page with correct offset', async () => {
      const page1Response = createMockTracksResponse({
        tracks: Array.from({ length: 20 }, (_, i) => ({
          id: `track-${i + 1}`,
          title: `Track ${i + 1}`,
        })),
        totalCount: 40,
        hasMore: true,
      });

      const page2Response = createMockTracksResponse({
        tracks: Array.from({ length: 20 }, (_, i) => ({
          id: `track-${i + 21}`,
          title: `Track ${i + 21}`,
        })),
        totalCount: 40,
        hasMore: false,
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Response),
        });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await result.current.fetchNextPage();

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(mockFetch).toHaveBeenLastCalledWith('/api/tracks?skip=20&take=20');
    });

    it('should not fetch when hasMore is false', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [{ id: 'track-1', title: 'Track 1' }],
        totalCount: 1,
        hasMore: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.hasNextPage).toBe(false);

      // Attempt to fetch next page
      await result.current.fetchNextPage();

      // Should not make additional API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Failed to fetch tracks');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
    });
  });

  describe('query configuration', () => {
    it('should use correct query key', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [],
        totalCount: 0,
        hasMore: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
        },
      });

      function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(QueryClientProvider, { client: queryClient }, children);
      }

      renderHook(() => useInfiniteTracksQuery(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      // Query should be cached with the correct key
      const queryState = queryClient.getQueryState(['tracksDataInfinite']);
      expect(queryState).toBeDefined();
    });

    it('should configure stale time of 5 minutes', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [{ id: 'track-1', title: 'Track 1' }],
        totalCount: 1,
        hasMore: false,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
        },
      });

      function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(QueryClientProvider, { client: queryClient }, children);
      }

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: Wrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Fetch count should be 1
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Re-render should not trigger another fetch due to stale time
      const { result: result2 } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: Wrapper,
      });

      await waitFor(() => {
        expect(result2.current.isSuccess).toBe(true);
      });

      // Should still be 1 due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading states', () => {
    it('should indicate fetching next page state', async () => {
      const page1Response = createMockTracksResponse({
        tracks: Array.from({ length: 20 }, (_, i) => ({
          id: `track-${i + 1}`,
          title: `Track ${i + 1}`,
        })),
        totalCount: 40,
        hasMore: true,
      });

      let resolveSecondPage: (value: unknown) => void;
      const secondPagePromise = new Promise((resolve) => {
        resolveSecondPage = resolve;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => secondPagePromise,
        });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Start fetching next page
      result.current.fetchNextPage();

      await waitFor(() => {
        expect(result.current.isFetchingNextPage).toBe(true);
      });

      // Resolve second page
      resolveSecondPage!(
        createMockTracksResponse({
          tracks: [{ id: 'track-21', title: 'Track 21' }],
          totalCount: 40,
          hasMore: false,
        })
      );

      await waitFor(() => {
        expect(result.current.isFetchingNextPage).toBe(false);
      });
    });
  });

  describe('return values', () => {
    it('should return all required properties', async () => {
      const mockResponse = createMockTracksResponse({
        tracks: [{ id: 'track-1', title: 'Track 1' }],
        totalCount: 1,
        hasMore: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { result } = renderHook(() => useInfiniteTracksQuery(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Check all expected properties exist
      expect(result.current).toHaveProperty('tracks');
      expect(result.current).toHaveProperty('totalCount');
      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isSuccess');
      expect(result.current).toHaveProperty('isError');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('hasNextPage');
      expect(result.current).toHaveProperty('fetchNextPage');
      expect(result.current).toHaveProperty('isFetchingNextPage');
    });
  });
});
