/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { triggerDownload } from '@/lib/utils/trigger-download';
import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { FormatBundleDownload } from './format-bundle-download';

vi.mock('@/lib/utils/trigger-download', () => ({
  triggerDownload: vi.fn(),
}));

function makeSSEBody(events: Array<{ event: string; data: Record<string, unknown> }>): string {
  return events.map((evt) => `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`).join('');
}

const defaultSSEEvents: Array<{ event: string; data: Record<string, unknown> }> = [
  { event: 'progress', data: { formatType: 'FLAC', label: 'FLAC', status: 'zipping' } },
  { event: 'progress', data: { formatType: 'FLAC', label: 'FLAC', status: 'done' } },
  { event: 'progress', data: { formatType: 'WAV', label: 'WAV', status: 'zipping' } },
  { event: 'progress', data: { formatType: 'WAV', label: 'WAV', status: 'done' } },
  {
    event: 'progress',
    data: { formatType: 'MP3_320KBPS', label: 'MP3 320kbps', status: 'zipping' },
  },
  { event: 'progress', data: { formatType: 'MP3_320KBPS', label: 'MP3 320kbps', status: 'done' } },
  { event: 'progress', data: { status: 'uploading' } },
  {
    event: 'ready',
    data: {
      downloadUrl: 'https://s3.example.com/bundle.zip',
      fileName: 'Test Album.zip',
    },
  },
  { event: 'complete', data: {} },
];

function makeSSEResponse(events = defaultSSEEvents) {
  return new Response(makeSSEBody(events), {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

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

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
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

    const combobox = screen.getByRole('combobox');
    expect(combobox).toHaveTextContent('3 formats selected');

    const pills = screen.getByRole('list', { name: /Selected formats/ });
    expect(within(pills).getByText('FLAC')).toBeInTheDocument();
    expect(within(pills).getByText('WAV')).toBeInTheDocument();
    expect(within(pills).getByText('MP3 320kbps')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();
  });

  it('should deselect all formats via "Deselect all"', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();

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

    const flacOption = screen
      .getAllByRole('option')
      .find((opt) => opt.textContent?.includes('FLAC'));
    await user.click(flacOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Download 2 formats/ })).toBeInTheDocument();
  });

  it('should show singular "format" when only one is selected', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

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

    expect(screen.getByRole('status')).toBeInTheDocument();

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

    const combobox = await screen.findByRole('combobox');
    expect(combobox).toHaveTextContent('Select formats...');

    expect(screen.getByRole('button', { name: /Select at least one format/ })).toBeDisabled();
  });

  it('should call fetch with respond=json on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValue(makeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/releases\/release-123\/download\/bundle\?formats=FLAC,WAV,MP3_320KBPS&respond=json/
        )
      );
    });
  });

  it('should show "Preparing..." while downloads are in progress', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', () => new Promise(() => {}));

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(screen.getByRole('button', { name: /Preparing/ })).toBeDisabled();
  });

  it('should show per-format progress and "Download started!" on completion', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValueOnce(makeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByText('Download started!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();
  });

  it('should trigger a single download for the combined ZIP', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValueOnce(makeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    await waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledWith(
        'https://s3.example.com/bundle.zip',
        'Test Album.zip'
      );
      expect(triggerDownload).toHaveBeenCalledTimes(1);
    });
  });

  it('should not POST to confirm endpoint (server handles count)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValueOnce(makeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    await waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledTimes(1);
    });

    // Only the SSE fetch should have been called, no confirm POST
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should call onDownloadComplete when download completes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDownloadComplete = vi.fn();
    const mockFetch = vi.fn().mockResolvedValueOnce(makeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} onDownloadComplete={onDownloadComplete} />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    await waitFor(() => {
      expect(onDownloadComplete).toHaveBeenCalledOnce();
    });
  });

  it('should not error when onDownloadComplete is not provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValueOnce(makeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByText('Download started!')).toBeInTheDocument();
  });

  it('should show error message when download fetch fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Download failed');
  });

  it('should show error message when download fetch throws', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
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

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('CUSTOM_XYZ')).toBeInTheDocument();
  });

  it('should remove a format when clicking the X on its pill', async () => {
    const user = userEvent.setup();
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();

    const removeFlac = screen.getByRole('button', { name: /Remove FLAC/ });
    await user.click(removeFlac);

    expect(screen.getByRole('button', { name: /Download 2 formats/ })).toBeInTheDocument();
    const pills = screen.getByRole('list', { name: /Selected formats/ });
    expect(within(pills).queryByText('FLAC')).not.toBeInTheDocument();
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
});
