/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

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

  // Prevent jsdom "Not implemented: navigation" errors from programmatic anchor.click()
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        (el as HTMLAnchorElement).click = vi.fn();
      }
      return el;
    });
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
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByText('MP3 320kbps')).toBeInTheDocument();
      expect(screen.getByText('FLAC')).toBeInTheDocument();
    });

    it('should show empty message when no formats available', () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={[]} />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByText('No digital formats available for download.')).toBeInTheDocument();
    });

    it('should render format selection label', () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

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
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

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
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

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
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(
          screen.getByText('An unexpected error occurred. Please try again.')
        ).toBeInTheDocument();
      });
    });

    it('should trigger browser download on success', async () => {
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

      const openSpy = vi.fn();
      window.open = openSpy;

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith(
          'https://s3.example.com/presigned',
          '_blank',
          'noopener,noreferrer'
        );
      });
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
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

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

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

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

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

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
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('3 free downloads remaining')).toBeInTheDocument();
      });
    });

    it('should skip quota check when user has purchased', async () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} hasPurchased />, {
        wrapper: createQueryWrapper(),
      });

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

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      // Buttons should still be enabled
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });

    it('should handle quota endpoint returning non-OK response', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: false,
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      // Buttons should still be enabled — non-OK quota response is silently ignored
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        buttons.forEach((button) => {
          expect(button).not.toBeDisabled();
        });
      });

      // Remaining quota text should not appear
      expect(screen.queryByText(/free download/)).not.toBeInTheDocument();
    });

    it('should handle quota response with success: false', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: false }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      // Buttons should still be enabled — success: false means quota data is not applied
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        buttons.forEach((button) => {
          expect(button).not.toBeDisabled();
        });
      });

      // Remaining quota text should not appear since data.success was false
      expect(screen.queryByText(/free download/)).not.toBeInTheDocument();
    });

    it('should show singular "download" text when remainingQuota is 1', async () => {
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                remainingQuota: 1,
                uniqueDownloads: 4,
                maxQuota: 5,
                downloadedReleaseIds: [],
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByText('1 free download remaining')).toBeInTheDocument();
      });
    });
  });

  describe('Download error messages', () => {
    it('should show default error when response has no message field', async () => {
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
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(screen.getByText('Download failed. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('FORMAT_LABELS fallback', () => {
    it('should display raw formatType when no label exists', () => {
      const unknownFormat = [{ formatType: 'UNKNOWN_FORMAT_XYZ', fileName: 'album.xyz' }];

      render(<FormatDownloadList releaseId={mockReleaseId} formats={unknownFormat} />, {
        wrapper: createQueryWrapper(),
      });

      expect(screen.getByText('UNKNOWN_FORMAT_XYZ')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show spinner on the clicked button while download is in progress', async () => {
      let resolveDownload: (value: Response) => void;
      const downloadPromise = new Promise<Response>((resolve) => {
        resolveDownload = resolve;
      });

      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return downloadPromise;
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));

      // While loading, the clicked button should be disabled
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons[0]).toBeDisabled();
      });

      // Resolve the download to clean up
      resolveDownload!({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            downloadUrl: 'https://s3.example.com/presigned',
            fileName: 'album.mp3',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          }),
      } as Response);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons[0]).not.toBeDisabled();
      });
    });

    it('should not disable other format buttons while one is downloading', async () => {
      let resolveDownload: (value: Response) => void;
      const downloadPromise = new Promise<Response>((resolve) => {
        resolveDownload = resolve;
      });

      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        return downloadPromise;
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));

      // The FLAC button should remain enabled
      await waitFor(() => {
        expect(screen.getByText('FLAC').closest('button')).not.toBeDisabled();
      });

      resolveDownload!({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            downloadUrl: 'https://s3.example.com/presigned',
            fileName: 'album.mp3',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          }),
      } as Response);

      await waitFor(() => {
        expect(screen.getByText('MP3 320kbps').closest('button')).not.toBeDisabled();
      });
    });
  });

  describe('Anchor element behavior', () => {
    it('should open the presigned URL in a new window', async () => {
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

      const openSpy = vi.fn();
      window.open = openSpy;

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));

      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith(
          'https://s3.example.com/presigned-url',
          '_blank',
          'noopener,noreferrer'
        );
      });
    });
  });

  describe('Download response edge cases', () => {
    it('should show error when response is ok but success is false', async () => {
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
              success: false,
              message: 'Quota exceeded for this release.',
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('FLAC'));

      await waitFor(() => {
        expect(screen.getByText('Quota exceeded for this release.')).toBeInTheDocument();
      });
    });

    it('should clear previous error when starting a new download', async () => {
      let callCount = 0;
      vi.mocked(global.fetch).mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr === '/api/user/download-quota') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockQuotaResponse),
          } as Response);
        }
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ success: false, message: 'First download failed.' }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              downloadUrl: 'https://s3.example.com/presigned',
              fileName: 'album.flac',
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            }),
        } as Response);
      });

      const user = userEvent.setup();
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByText('MP3 320kbps'));
      await waitFor(() => {
        expect(screen.getByText('First download failed.')).toBeInTheDocument();
      });

      await user.click(screen.getByText('FLAC'));
      await waitFor(() => {
        expect(screen.queryByText('First download failed.')).not.toBeInTheDocument();
      });
    });
  });

  describe('Quota display with hasPurchased', () => {
    it('should not show remaining quota text when hasPurchased is true', async () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} hasPurchased />, {
        wrapper: createQueryWrapper(),
      });

      // Give time for any async effects to settle
      await waitFor(() => {
        expect(screen.queryByText(/free download/)).not.toBeInTheDocument();
      });
    });

    it('should not show quota exceeded message when hasPurchased is true', async () => {
      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} hasPurchased />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.queryByTestId('quota-exceeded-message')).not.toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toBeDisabled();
      });
    });
  });

  describe('Quota with undefined downloadedReleaseIds', () => {
    it('should handle missing downloadedReleaseIds in quota response', async () => {
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
                // downloadedReleaseIds intentionally omitted
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      // Should set quotaExceeded since downloadedReleaseIds?.includes returns undefined (falsy)
      await waitFor(() => {
        expect(screen.getByTestId('quota-exceeded-message')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Quota text visibility when exceeded', () => {
    it('should not show remaining quota text when quota is exceeded', async () => {
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

      render(<FormatDownloadList releaseId={mockReleaseId} formats={mockFormats} />, {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('quota-exceeded-message')).toBeInTheDocument();
      });

      // "0 free downloads remaining" should NOT appear because quotaExceeded hides it
      expect(screen.queryByText(/free downloads? remaining/)).not.toBeInTheDocument();
    });
  });
});
