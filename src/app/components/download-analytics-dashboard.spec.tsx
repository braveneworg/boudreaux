/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { DownloadAnalyticsDashboard } from './download-analytics-dashboard';

// Mock Radix Select with a native <select> so jsdom can handle value changes
vi.mock('@/app/components/ui/select', () => {
  let onValueChangeFn: ((value: string) => void) | undefined;
  return {
    Select: ({
      children,
      value,
      onValueChange,
    }: {
      children: ReactNode;
      value: string;
      onValueChange: (v: string) => void;
    }) => {
      onValueChangeFn = onValueChange;
      return (
        <div data-testid="select-root" data-value={value}>
          {children}
        </div>
      );
    },
    SelectTrigger: ({ children, ...props }: Record<string, unknown> & { children: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    SelectValue: () => <span data-testid="select-value">All Time</span>,
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
      <button data-testid={`select-option-${value}`} onClick={() => onValueChangeFn?.(value)}>
        {children}
      </button>
    ),
  };
});

const mockReleaseId = '507f1f77bcf86cd799439011';

const mockAnalyticsData = {
  totalDownloads: 142,
  uniqueUsers: 38,
  formatBreakdown: [
    { formatType: 'MP3_320KBPS', count: 60 },
    { formatType: 'FLAC', count: 50 },
    { formatType: 'WAV', count: 32 },
  ],
};

describe('DownloadAnalyticsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockFetchSuccess(data = mockAnalyticsData) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response);
  }

  function mockFetchFailure() {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    } as Response);
  }

  describe('Loading state', () => {
    it('should display loading indicator while fetching analytics', () => {
      global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByTestId('loading')).toBeInTheDocument();
      expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should display error message when fetch fails', async () => {
      mockFetchFailure();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeInTheDocument();
      });
      expect(screen.getByText('Failed to load analytics')).toBeInTheDocument();
    });
  });

  describe('Success state', () => {
    it('should display total downloads count', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('total-downloads')).toHaveTextContent('142');
      });
    });

    it('should display unique users count', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('unique-users')).toHaveTextContent('38');
      });
    });

    it('should display format count', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('format-count')).toHaveTextContent('3');
      });
    });

    it('should render format breakdown table with all formats', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('format-row-MP3_320KBPS')).toBeInTheDocument();
      });
      expect(screen.getByTestId('format-row-FLAC')).toBeInTheDocument();
      expect(screen.getByTestId('format-row-WAV')).toBeInTheDocument();
    });

    it('should show human-readable format labels in table', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('MP3 320kbps')).toBeInTheDocument();
      });
      expect(screen.getByText('FLAC')).toBeInTheDocument();
      expect(screen.getByText('WAV')).toBeInTheDocument();
    });

    it('should calculate and display format share percentages', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        // 60/142 total format downloads = 42.3%
        expect(screen.getByText('42.3%')).toBeInTheDocument();
      });
    });

    it('should not render format table when no formats available', async () => {
      mockFetchSuccess({ totalDownloads: 0, uniqueUsers: 0, formatBreakdown: [] });

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('total-downloads')).toHaveTextContent('0');
      });
      expect(screen.queryByText('Downloads by Format')).not.toBeInTheDocument();
    });
  });

  describe('Date range selection', () => {
    it('should render date range selector', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('date-range-select')).toBeInTheDocument();
      });
    });

    it('should fetch analytics for all time by default', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/releases/${mockReleaseId}/download-analytics`
        );
      });
    });

    it('should render the date range select trigger with default value', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('total-downloads')).toBeInTheDocument();
      });

      // Default date range label should be "All Time"
      expect(screen.getByTestId('select-value')).toHaveTextContent('All Time');
    });
  });

  describe('API integration', () => {
    it('should pass releaseId in the API URL', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(mockReleaseId));
      });
    });

    it('should refetch with date range params when date range is changed', async () => {
      mockFetchSuccess();

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('total-downloads')).toBeInTheDocument();
      });

      // Click on "Last 7 Days" option using the mocked SelectItem
      fireEvent.click(screen.getByTestId('select-option-7d'));

      await waitFor(() => {
        const calls = vi.mocked(global.fetch).mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(String(lastCall[0])).toContain('startDate');
        expect(String(lastCall[0])).toContain('endDate');
      });
    });

    it('should display 0% share when totalFormatDownloads is zero', async () => {
      mockFetchSuccess({
        totalDownloads: 0,
        uniqueUsers: 0,
        formatBreakdown: [{ formatType: 'FLAC', count: 0 }],
      });

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('format-row-FLAC')).toBeInTheDocument();
      });
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should render format breakdown table with unknown format label fallback', async () => {
      mockFetchSuccess({
        totalDownloads: 10,
        uniqueUsers: 5,
        formatBreakdown: [{ formatType: 'UNKNOWN_FMT', count: 10 }],
      });

      render(<DownloadAnalyticsDashboard releaseId={mockReleaseId} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('UNKNOWN_FMT')).toBeInTheDocument();
      });
    });
  });
});
