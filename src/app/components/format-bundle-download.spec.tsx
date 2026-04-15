/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { FormatBundleDownload } from './format-bundle-download';

/** Builds a mock fetch Response that returns JSON (matching the new bundle API shape). */
const mockBundleJsonResponse = (overrides?: {
  ok?: boolean;
  status?: number;
  body?: Record<string, unknown>;
}): Response => {
  const { ok = true, status = 200, body } = overrides ?? {};
  const defaultBody = ok
    ? {
        success: true,
        downloadUrl: 'https://s3.example.com/presigned-bundle',
        fileName: 'Test Album.zip',
      }
    : { success: false, message: 'Error' };
  return {
    ok,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body ?? defaultBody,
  } as unknown as Response;
};

describe('FormatBundleDownload', () => {
  const defaultProps = {
    releaseId: 'release-123',
    availableFormats: [
      { formatType: 'FLAC', fileName: 'album-flac.zip' },
      { formatType: 'WAV', fileName: 'album-wav.zip' },
      { formatType: 'MP3_320KBPS', fileName: 'album-mp3.zip' },
    ],
    downloadCount: 1,
  };

  /** Opens the combobox and clicks "Select all". */
  const selectAll = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('combobox'));
    const selectAllOption = screen
      .getAllByRole('option')
      .find((o) => /Select all/i.test(o.textContent ?? ''));
    expect(selectAllOption).toBeDefined();
    await user.click(selectAllOption as HTMLElement);
  };

  /** Stubs fetch and window.open for bundle download tests. */
  const stubDownloadApis = (responseOverrides?: Parameters<typeof mockBundleJsonResponse>[0]) => {
    const fetchSpy = vi.fn().mockResolvedValue(mockBundleJsonResponse(responseOverrides));
    vi.stubGlobal('fetch', fetchSpy);

    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    return { fetchSpy, openSpy };
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should render a combobox with placeholder when no formats are selected', () => {
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    const combobox = screen.getByRole('combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveTextContent('Select formats...');
  });

  it('should start with no formats selected and download button disabled', () => {
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    const downloadBtn = screen.getByRole('button', { name: /Select at least one format/ });
    expect(downloadBtn).toBeDisabled();
  });

  it('should select a single format from the combobox', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await user.click(screen.getByRole('combobox'));
    const flacOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('FLAC'));
    await user.click(flacOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Download 1 format$/ })).toBeEnabled();
  });

  it('should select all formats via "Select all"', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);

    // Trigger shows count
    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveTextContent('3 formats selected');

    // Pills rendered below combobox
    const pills = screen.getByRole('list', { name: /Selected formats/ });
    expect(within(pills).getByText('FLAC')).toBeInTheDocument();
    expect(within(pills).getByText('WAV')).toBeInTheDocument();
    expect(within(pills).getByText('MP3 320kbps')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();
  });

  it('should deselect all formats via "Deselect all"', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    // Select all first
    await selectAll(user);
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();

    // Now deselect all
    const deselectOption = screen
      .getAllByRole('option')
      .find((o) => /Deselect all/i.test(o.textContent ?? ''));
    expect(deselectOption).toBeDefined();
    await user.click(deselectOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Select at least one format/ })).toBeDisabled();
  });

  it('should update the download button label when a format is deselected', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);

    // Deselect FLAC
    const flacOption = screen
      .getAllByRole('option')
      .find((opt) => opt.textContent?.includes('FLAC'));
    await user.click(flacOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Download 2 formats/ })).toBeInTheDocument();
  });

  it('should show singular "format" when only one is selected', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    // Select just one
    await user.click(screen.getByRole('combobox'));
    const wavOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('WAV'));
    await user.click(wavOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Download 1 format$/ })).toBeInTheDocument();
  });

  it('should disable the download button when at download limit', () => {
    render(<FormatBundleDownload {...defaultProps} downloadCount={5} />, {
      wrapper: createQueryWrapper(),
    });

    const downloadBtn = screen.getByRole('button', { name: /Select at least one format/ });
    expect(downloadBtn).toBeDisabled();
  });

  it('should show a loading spinner then empty message when no formats are available', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ formats: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} availableFormats={[]} />, {
      wrapper: createQueryWrapper(),
    });

    // Initially shows loading spinner
    expect(screen.getByRole('status')).toBeInTheDocument();

    // After fetch resolves, shows empty message
    expect(
      await screen.findByText('No digital formats available for download.')
    ).toBeInTheDocument();
  });

  it('should fetch formats from API when prop is empty and display combobox', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        formats: [
          { formatType: 'FLAC', fileName: 'album-flac.zip' },
          { formatType: 'WAV', fileName: 'album-wav.zip' },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} availableFormats={[]} />, {
      wrapper: createQueryWrapper(),
    });

    // After fetch, combobox should appear with placeholder (nothing selected)
    const combobox = await screen.findByRole('combobox');
    expect(combobox).toHaveTextContent('Select formats...');

    // Download button disabled until user selects
    expect(screen.getByRole('button', { name: /Select at least one format/ })).toBeDisabled();
  });

  it('should fetch bundle URL and open presigned URL via window.open', async () => {
    const user = userEvent.setup();
    const { fetchSpy, openSpy } = stubDownloadApis();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    // fetch was called with the bundle URL
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/releases/release-123/download/bundle?formats='),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    // After the server responds, window.open triggers the browser download
    await screen.findByText('Download complete');
    expect(openSpy).toHaveBeenCalledWith('https://s3.example.com/presigned-bundle', '_self');
  });

  it('should display unknown formatType when no label is found', async () => {
    const user = userEvent.setup();
    render(
      <FormatBundleDownload
        {...defaultProps}
        availableFormats={[{ formatType: 'CUSTOM_XYZ', fileName: 'file.xyz' }]}
      />,
      { wrapper: createQueryWrapper() }
    );

    // Open combobox to see the option label
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('CUSTOM_XYZ')).toBeInTheDocument();
  });

  it('should call onDownloadComplete after the download finishes', async () => {
    const user = userEvent.setup();
    const onDownloadComplete = vi.fn();
    stubDownloadApis();

    render(<FormatBundleDownload {...defaultProps} onDownloadComplete={onDownloadComplete} />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    await screen.findByText('Download complete');
    expect(onDownloadComplete).toHaveBeenCalledOnce();
  });

  it('should not error when onDownloadComplete is not provided', async () => {
    const user = userEvent.setup();
    stubDownloadApis();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByText('Download complete')).toBeInTheDocument();
  });

  it('should show error message when fetch response is not ok', async () => {
    const user = userEvent.setup();
    stubDownloadApis({
      ok: false,
      status: 403,
      body: { success: false, message: 'Purchase required to download.' },
    });

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Purchase required to download.');
  });

  it('should show generic error when fetch throws', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Download failed. Please try again.'
    );
  });

  it('should remove a format when clicking the X on its pill', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();

    // Click the remove button on the FLAC pill
    const removeFlac = screen.getByRole('button', { name: /Remove FLAC/ });
    await user.click(removeFlac);

    expect(screen.getByRole('button', { name: /Download 2 formats/ })).toBeInTheDocument();
    const pills = screen.getByRole('list', { name: /Selected formats/ });
    expect(within(pills).queryByText('FLAC')).not.toBeInTheDocument();
  });

  it('should re-enable the download button after completion', async () => {
    const user = userEvent.setup();
    stubDownloadApis();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    // Wait for completion
    await screen.findByText('Download complete');

    // Button should be re-enabled
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();
  });

  it('should show fallback message when API fetch fails for empty availableFormats', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<FormatBundleDownload {...defaultProps} availableFormats={[]} />, {
      wrapper: createQueryWrapper(),
    });

    expect(
      await screen.findByText('No digital formats available for download.')
    ).toBeInTheDocument();
  });

  it('should show fallback message when API fetch throws for empty availableFormats', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<FormatBundleDownload {...defaultProps} availableFormats={[]} />, {
      wrapper: createQueryWrapper(),
    });

    expect(
      await screen.findByText('No digital formats available for download.')
    ).toBeInTheDocument();
  });

  it('should show generic error when response json() throws', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: vi.fn().mockRejectedValue(new Error('invalid json')),
      } as unknown as Response)
    );

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Download failed. Please try again.'
    );
  });

  it('should silently ignore AbortError without showing an error message', async () => {
    const user = userEvent.setup();

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    // Wait for isDownloading to become false — the button should re-enable
    await screen.findByRole('button', { name: /Download 3 formats/ });

    // No error alert should be present
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // No "Download complete" either — it was aborted
    expect(screen.queryByText('Download complete')).not.toBeInTheDocument();
  });

  it('should show error when response is ok but success is false', async () => {
    const user = userEvent.setup();
    stubDownloadApis({
      ok: true,
      status: 200,
      body: { success: false, message: 'No files found.' },
    });

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No files found.');
  });

  it('should show error when response is successful but downloadUrl is missing', async () => {
    const user = userEvent.setup();
    const { openSpy } = stubDownloadApis({
      ok: true,
      status: 200,
      body: { success: true, fileName: 'Test Album.zip' },
    });

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Download link is unavailable. Please try again.'
    );
    expect(openSpy).not.toHaveBeenCalled();
  });
});
