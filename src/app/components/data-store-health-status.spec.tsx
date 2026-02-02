import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import DataStoreHealthStatus from './data-store-health-status';

import type { HealthStatus } from '../../lib/types/health-status';

// Mock child components
vi.mock('./health-status-icon', () => ({
  default: ({ status, isLoading }: { status: string | null; isLoading: boolean }) => (
    <span data-is-loading={isLoading} data-status={status} data-testid="health-status-icon">
      Icon
    </span>
  ),
}));

vi.mock('./health-status-message', () => ({
  default: ({
    healthStatus,
    isLoading,
  }: {
    healthStatus: HealthStatus | null;
    isLoading: boolean;
  }) => (
    <span
      data-is-loading={isLoading}
      data-status={healthStatus?.status ?? 'null'}
      data-testid="health-status-message"
    >
      {isLoading ? 'Loading...' : (healthStatus?.database ?? 'No status')}
    </span>
  ),
}));

// Mock database utils
vi.mock('../../lib/utils/database-utils', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

describe('DataStoreHealthStatus', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = mockFetch;
    // Mock console methods to reduce noise
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('renders DB health status label', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<DataStoreHealthStatus />);
      expect(screen.getByText(/DB health status:/i)).toBeInTheDocument();
    });

    it('renders health status icon', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      render(<DataStoreHealthStatus />);
      expect(screen.getByTestId('health-status-icon')).toBeInTheDocument();
    });

    it('renders health status message', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      render(<DataStoreHealthStatus />);
      expect(screen.getByTestId('health-status-message')).toBeInTheDocument();
    });

    it('renders with centered flex layout', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      const { container } = render(<DataStoreHealthStatus />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('flex-col');
      expect(wrapper).toHaveClass('justify-center');
      expect(wrapper).toHaveClass('items-center');
    });
  });

  describe('loading state', () => {
    it('shows loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      render(<DataStoreHealthStatus />);
      const icon = screen.getByTestId('health-status-icon');
      expect(icon).toHaveAttribute('data-is-loading', 'true');
    });

    it('passes isLoading to health status message', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));
      render(<DataStoreHealthStatus />);
      const message = screen.getByTestId('health-status-message');
      expect(message).toHaveAttribute('data-is-loading', 'true');
    });
  });

  describe('successful health check', () => {
    it('fetches health status on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'healthy',
            database: 'Connected',
          }),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/health',
          expect.objectContaining({
            cache: 'no-store',
            credentials: 'same-origin',
          })
        );
      });
    });

    it('updates status after successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'healthy',
            database: 'Connected',
          }),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-is-loading', 'false');
        expect(icon).toHaveAttribute('data-status', 'healthy');
      });
    });

    it('displays database status message on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'healthy',
            database: 'MongoDB Connected',
          }),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        const message = screen.getByTestId('health-status-message');
        expect(message).toHaveTextContent('MongoDB Connected');
      });
    });
  });

  describe('error handling', () => {
    it('sets error status when fetch fails with non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            status: 'error',
            database: 'Connection failed',
          }),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'error');
      });
    });

    it('handles malformed JSON response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'error');
      });
    });
  });

  describe('retry logic', () => {
    it('retries on 500 server errors', async () => {
      // First call fails with 500, second succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ status: 'error', database: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 'healthy',
              database: 'Connected',
            }),
        });

      render(<DataStoreHealthStatus />);

      // Wait for first call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance timer to trigger retry (500ms for first 3 attempts)
      vi.advanceTimersByTime(500);

      // Wait for retry
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('retries on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'healthy',
            database: 'Connected',
          }),
      });

      render(<DataStoreHealthStatus />);

      // Wait for first call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance timer for retry
      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('retries on abort/timeout errors', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValueOnce(abortError).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            status: 'healthy',
            database: 'Connected',
          }),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      vi.advanceTimersByTime(500);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('cleanup', () => {
    it('does not update state after unmount', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: () =>
                    Promise.resolve({
                      status: 'healthy',
                      database: 'Connected',
                    }),
                }),
              1000
            )
          )
      );

      const { unmount } = render(<DataStoreHealthStatus />);

      // Unmount before fetch completes
      unmount();

      // Advance time past when fetch would complete
      vi.advanceTimersByTime(2000);

      // No errors should be thrown (React would warn about updating unmounted component)
    });
  });
});
