/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import CDNStatusBanner from './cdn-status-banner';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CDNStatusBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when loading', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { container } = render(<CDNStatusBanner />);

    // Should not render anything while loading
    expect(container.firstChild).toBeNull();
  });

  it('returns null when status is "ready"', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 'ready', message: 'CDN is ready' }),
    });

    const { container } = render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('shows banner when status is "invalidating"', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'invalidating',
          message: 'CDN cache is being invalidated',
          estimatedMinutesRemaining: 5,
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('Site Update in Progress')).toBeInTheDocument();
    });
  });

  it('shows error banner when status is "error"', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'error',
          message: 'Failed to check CDN status',
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('CDN Status Unknown')).toBeInTheDocument();
    });
  });

  it('shows default banner for unknown status', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'unknown',
          message: 'Site was recently updated',
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('Site Recently Updated')).toBeInTheDocument();
    });
  });

  it('displays estimated time remaining when available', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'invalidating',
          message: 'CDN cache is being invalidated',
          estimatedMinutesRemaining: 10,
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Estimated time remaining: ~10 minutes/)).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(<CDNStatusBanner />);

    await waitFor(() => {
      // Should not show anything on error during loading
      expect(container.firstChild).toBeNull();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to check CDN status:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('displays the status message', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'invalidating',
          message: 'Updating image cache across all regions',
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('Updating image cache across all regions')).toBeInTheDocument();
    });
  });

  it('does not display estimated time when estimatedMinutesRemaining is 0', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'invalidating',
          message: 'CDN cache is being invalidated',
          estimatedMinutesRemaining: 0,
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.queryByText(/Estimated time remaining/)).not.toBeInTheDocument();
    });
  });

  it('does not show progress bar when estimatedMinutesRemaining is undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'invalidating',
          message: 'CDN cache is being invalidated',
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('Site Update in Progress')).toBeInTheDocument();
    });

    // Progress bar should not be rendered
    const progressBar = screen.queryByRole('progressbar');
    expect(progressBar).not.toBeInTheDocument();
  });

  it('does not show progress bar when status is not invalidating even with estimatedMinutesRemaining', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'error',
          message: 'CDN status check failed',
          estimatedMinutesRemaining: 5,
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('CDN Status Unknown')).toBeInTheDocument();
    });

    // Progress bar should not be rendered because status is 'error', not 'invalidating'
    const progressBar = screen.queryByRole('progressbar');
    expect(progressBar).not.toBeInTheDocument();
  });

  it('does not show invalidation warning when status is not invalidating', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          status: 'unknown',
          message: 'Site was recently updated',
          estimatedMinutesRemaining: 3,
        }),
    });

    render(<CDNStatusBanner />);

    await waitFor(() => {
      expect(screen.getByText('Site Recently Updated')).toBeInTheDocument();
    });

    // Should not show the "Some assets may be temporarily unavailable" message
    expect(
      screen.queryByText(/Some assets may be temporarily unavailable/)
    ).not.toBeInTheDocument();
  });
});
