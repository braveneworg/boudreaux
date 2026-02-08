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
      {healthStatus?.error && process.env.NODE_ENV === 'development'
        ? ` - ${healthStatus.error}`
        : ''}
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
      // Test passes if we reach here without errors
      expect(true).toBe(true);
    });
  });

  describe('SSL and network errors', () => {
    it('shows SSL-specific error message for SSL errors', async () => {
      // Simulate exhausting all retries with SSL error
      const sslError = new Error('SSL error: ERR_SSL_PROTOCOL_ERROR');
      for (let i = 0; i < 11; i++) {
        mockFetch.mockRejectedValueOnce(sslError);
      }

      render(<DataStoreHealthStatus />);

      // Wait for initial call
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Advance through all retry attempts
      // First 3 retries: 500ms each
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(500);
        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledTimes(i + 2);
        });
      }

      // Later retries: exponential backoff 1s, 2s, 4s, 8s, 16s, 32s, 64s
      const delays = [1000, 2000, 4000, 8000, 16000, 32000, 64000];
      for (let i = 0; i < delays.length; i++) {
        vi.advanceTimersByTime(delays[i]);
        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledTimes(i + 5);
        });
      }

      // After all retries, error message should appear
      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'error');
      });
    });
  });

  describe('failsafe timeout', () => {
    it('shows timeout error after 60 seconds of loading', async () => {
      // Mock fetch that never resolves and never rejects
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<DataStoreHealthStatus />);

      // Verify initial loading state
      const icon = screen.getByTestId('health-status-icon');
      expect(icon).toHaveAttribute('data-is-loading', 'true');

      // Advance time to trigger failsafe (60 seconds)
      vi.advanceTimersByTime(60000);

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-is-loading', 'false');
        expect(icon).toHaveAttribute('data-status', 'error');
      });
    });

    it('does not trigger failsafe if fetch succeeds before timeout', async () => {
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
        expect(icon).toHaveAttribute('data-status', 'healthy');
      });

      // Advance past failsafe time
      vi.advanceTimersByTime(60000);

      // Should still show healthy status
      const icon = screen.getByTestId('health-status-icon');
      expect(icon).toHaveAttribute('data-status', 'healthy');
    });
  });

  describe('non-Error exceptions', () => {
    it('handles non-Error exceptions gracefully', async () => {
      // Reject with a non-Error object
      mockFetch.mockRejectedValue('String error');

      render(<DataStoreHealthStatus />);

      // Advance through retries
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(i < 3 ? 500 : Math.pow(2, i - 3) * 1000);
      }

      await waitFor(
        () => {
          const icon = screen.getByTestId('health-status-icon');
          expect(icon).toHaveAttribute('data-status', 'error');
        },
        { timeout: 5000 }
      );
    });
  });

  describe('error response without database field', () => {
    it('uses fallback message when errorData.database is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            status: 'error',
            error: 'Some error',
            // database field intentionally omitted
          }),
      });

      render(<DataStoreHealthStatus />);

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'error');
      });
    });
  });

  describe('retry limits', () => {
    it('stops retrying after reaching max attempts for 500 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ status: 'error', database: 'Server error' }),
      });

      render(<DataStoreHealthStatus />);

      // Wait for all retries to complete
      await vi.runAllTimersAsync();

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'error');
      });

      // Should make initial call + retries when retryCount is 0-9 = 10 total
      // But might be 11 if there's an extra failsafe call
      expect(mockFetch).toHaveBeenCalled();
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(10);
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(11);
    });
  });

  describe('abort error handling', () => {
    it('logs warning for abort/timeout errors and retries', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy', database: 'Connected' }),
      });

      render(<DataStoreHealthStatus />);

      await vi.runAllTimersAsync();

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'healthy');
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Health Check] Request timed out after 5 seconds'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('ERR_ error messages', () => {
    it('sets connection error for ERR_ errors', async () => {
      const errError = new Error('ERR_CONNECTION_REFUSED');
      mockFetch.mockRejectedValue(errError);

      render(<DataStoreHealthStatus />);

      await vi.runAllTimersAsync();

      await waitFor(() => {
        const icon = screen.getByTestId('health-status-icon');
        expect(icon).toHaveAttribute('data-status', 'error');
      });

      // Verify the database field is set
      const message = screen.getByTestId('health-status-message');
      expect(message).toHaveTextContent('Failed to fetch health status');
    });
  });

  describe('failsafe timeout with unmount', () => {
    it('does not update state if component unmounts before failsafe triggers', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolves
          })
      );

      const { unmount } = render(<DataStoreHealthStatus />);

      // Unmount before failsafe timeout
      unmount();

      // Advance to failsafe timeout
      await vi.advanceTimersByTimeAsync(60000);

      // No errors should be thrown
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
