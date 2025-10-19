import { render, screen, waitFor } from '@testing-library/react';
import Home from './page';

// Mock the dependencies
vi.mock('./components/auth/auth-toolbar', () => ({
  default: () => <div data-testid="auth-toolbar">Auth Toolbar</div>,
}));

vi.mock('./lib/utils/database-utils', () => ({
  getApiBaseUrl: vi.fn(() => 'http://localhost:3000'),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));

describe('Home Page - Health Check', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Health Check', () => {
    it('should display loading state initially', () => {
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolve - simulate loading
          })
      );

      render(<Home />);

      expect(screen.getByText('Checking database connection...')).toBeInTheDocument();
      expect(screen.getByText(/DB health status:/)).toBeInTheDocument();
    });

    it('should display success status after successful health check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          database: 'connected',
          latency: 100,
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/connected/)).toBeInTheDocument();
          expect(screen.getByText(/100ms/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );
    });

    it('should clear failsafe timeout on successful health check', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          database: 'connected',
          latency: 100,
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/connected/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      // Should have cleared the failsafe timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should display success icon after successful health check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          database: 'connected',
          latency: 100,
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          const heading = screen.getByRole('heading', { name: /DB health status/ });
          expect(heading.textContent).toContain('✅');
        },
        { timeout: 10000 }
      );
    });

    it('should display latency when available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          database: 'connected',
          latency: 250,
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/250ms/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );
    });
  });

  describe('Failed Health Check', () => {
    it('should display error after failed health check with non-500 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          database: 'Not found',
          error: 'Endpoint not found',
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/Not found/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );
    });

    it('should clear failsafe timeout after error', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          database: 'Not found',
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/Not found/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should show error icon after failed health check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          database: 'Not found',
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          const heading = screen.getByRole('heading', { name: /DB health status/ });
          expect(heading.textContent).toContain('❌');
        },
        { timeout: 10000 }
      );
    });

    it('should not retry on 404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ status: 'error', database: 'Not found' }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/Not found/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      // Should only have made 1 attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 500 errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ status: 'error', database: 'Server error' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'healthy',
            database: 'connected',
            latency: 100,
          }),
        });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/connected/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      // Should have retried
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Note: Full retry exhaustion test (10 attempts with exponential backoff)
    // would take ~128 seconds to complete, so we skip it in unit tests.
    // This is tested via integration tests or manual testing.
  });

  describe('Network Errors', () => {
    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: 'healthy',
            database: 'connected',
            latency: 100,
          }),
        });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/connected/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Note: Testing full retry exhaustion (10 attempts) would take ~128 seconds
    // These scenarios are covered by integration tests
  });

  describe('API URL Construction', () => {
    it('should use getApiBaseUrl to construct API URL', async () => {
      const { getApiBaseUrl } = await import('./lib/utils/database-utils');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          database: 'connected',
          latency: 100,
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(getApiBaseUrl).toHaveBeenCalled();
          expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3000/api/health',
            expect.objectContaining({
              cache: 'no-store',
              credentials: 'same-origin',
            })
          );
        },
        { timeout: 10000 }
      );
    });

    it('should include no-cache headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          database: 'connected',
          latency: 100,
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              headers: {
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
              },
            })
          );
        },
        { timeout: 10000 }
      );
    });
  });

  describe('Component Lifecycle', () => {
    it('should clear failsafe timeout on component unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolve
          })
      );

      const { unmount } = render(<Home />);

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('UI State Display', () => {
    it('should show loading icon during health check', () => {
      mockFetch.mockImplementation(
        () =>
          new Promise(() => {
            // Never resolve - simulate loading
          })
      );

      render(<Home />);

      const heading = screen.getByRole('heading', { name: /DB health status/ });
      expect(heading.textContent).toContain('⏳');
    });

    it('should display error details in development mode', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          status: 'error',
          database: 'Not found',
          error: 'Detailed error message',
        }),
      });

      render(<Home />);

      await waitFor(
        () => {
          expect(screen.getByText(/Detailed error message/)).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      vi.unstubAllEnvs();
    });
  });
});
