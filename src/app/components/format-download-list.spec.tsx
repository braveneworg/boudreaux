/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormatDownloadList } from './format-download-list';

const mockReleaseId = '507f1f77bcf86cd799439011';

const mockFormats = [
  { formatType: 'MP3_320KBPS', fileName: 'album.mp3' },
  { formatType: 'FLAC', fileName: 'album.flac' },
];

describe('FormatDownloadList', () => {
  const mockQuotaResponse = {
    success: true,
    remainingQuota: 3,
    uniqueDownloads: 2,
    maxQuota: 5,
    downloadedReleaseIds: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/user/download-quota') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockQuotaResponse),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);
    });
  });

  describe('Rendering', () => {
    it('should render download buttons for each available format', () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      expect(screen.getByText('MP3 320kbps')).toBeInTheDocument();
      expect(screen.getByText('FLAC')).toBeInTheDocument();
    });

    it('should show empty message when no formats available', () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={[]} />);

      expect(screen.getByText('No digital formats available for download.')).toBeInTheDocument();
    });

    it('should render format selection label', () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      expect(screen.getByText('Choose a format:')).toBeInTheDocument();
    });
  });

  describe('Download flow', () => {
    it('should call download API when format button is clicked', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              downloadUrl: 'https://s3.example.com/presigned-url',
              fileName: 'album.mp3',
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await user.click(screen.getByText('MP3 320kbps'));

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/releases/${mockReleaseId}/download/MP3_320KBPS`
      );
    });

    it('should show error message when download fails', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              success: false,
              message: 'You must be logged in to download releases.',
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(screen.getByText('You must be logged in to download releases.')).toBeInTheDocument();
      });
    });

    it('should show generic error on network failure', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return Promise.reject(new Error('Network error'));
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(
          screen.getByText('An unexpected error occurred. Please try again.')
        ).toBeInTheDocument();
      });
    });

    it('should trigger browser download on success', async () => {
      const mockClick = vi.fn();
      const originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          const anchor = originalCreateElement('a');
          anchor.click = mockClick;
          return anchor;
        }
        return originalCreateElement(tagName);
      });

      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              downloadUrl: 'https://s3.example.com/presigned',
              fileName: 'album.mp3',
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(mockClick).toHaveBeenCalled();
      });

      vi.restoreAllMocks();
    });

    it('should show error alert with role attribute', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              success: false,
              message: 'Download failed.',
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Quota enforcement', () => {
    it('should disable buttons when quota is exceeded for new release', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                remainingQuota: 0,
                uniqueDownloads: 5,
                maxQuota: 5,
                downloadedReleaseIds: ['other-1', 'other-2', 'other-3', 'other-4', 'other-5'],
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await waitFor(() => {
        expect(screen.getByTestId('quota-exceeded-message')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('should allow download when release was already downloaded even at quota limit', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                remainingQuota: 0,
                uniqueDownloads: 5,
                maxQuota: 5,
                downloadedReleaseIds: [mockReleaseId, 'other-2', 'other-3', 'other-4', 'other-5'],
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      // Wait for quota fetch to complete — buttons should NOT be disabled
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        buttons.forEach((button) => {
          expect(button).not.toBeDisabled();
        });
      });

      expect(screen.queryByTestId('quota-exceeded-message')).not.toBeInTheDocument();
    });

    it('should show remaining quota count', async () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      await waitFor(() => {
        expect(screen.getByText('3 free downloads remaining')).toBeInTheDocument();
      });
    });

    it('should skip quota check when user has purchased', async () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} hasPurchased />);

      // Should never call the quota endpoint
      const fetchCalls = vi.mocked(global.fetch).mock.calls;
      const quotaCalls = fetchCalls.filter(
        (call) => typeof call[0] === 'string' && call[0] === '/api/user/download-quota'
      );
      expect(quotaCalls).toHaveLength(0);
    });

    it('should still render buttons when quota fetch fails silently', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />);

      // Buttons should still be enabled
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });
});
