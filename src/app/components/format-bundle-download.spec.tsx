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

const makeSSEBody = (events: Array<{ event: string; data: Record<string, unknown> }>): string =>
  events.map((evt) => `event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`).join('');

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

const makeSSEResponse = (events = defaultSSEEvents) =>
  new Response(makeSSEBody(events), {
    headers: { 'Content-Type': 'text/event-stream' },
  });

const freeSSEEvents: Array<{ event: string; data: Record<string, unknown> }> = [
  {
    event: 'progress',
    data: { formatType: 'MP3_320KBPS', label: 'MP3 320kbps', status: 'zipping' },
  },
  { event: 'progress', data: { formatType: 'MP3_320KBPS', label: 'MP3 320kbps', status: 'done' } },
  { event: 'progress', data: { formatType: 'AAC', label: 'AAC', status: 'zipping' } },
  { event: 'progress', data: { formatType: 'AAC', label: 'AAC', status: 'done' } },
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

const makeFreeSSEResponse = (events = freeSSEEvents) =>
  new Response(makeSSEBody(events), {
    headers: { 'Content-Type': 'text/event-stream' },
  });

const makeThrowAfterReadyResponse = (events = defaultSSEEvents): Response => {
  const encoder = new TextEncoder();
  const chunk = encoder.encode(makeSSEBody(events));
  const read = vi
    .fn()
    .mockResolvedValueOnce({ done: false, value: chunk })
    .mockRejectedValueOnce(new Error('Reader interrupted after ready'));

  return {
    ok: true,
    body: {
      getReader: () => ({
        read,
      }),
    },
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

  /** Free-mode props: only FREE_FORMAT_TYPES (MP3, AAC) so SSE flow is exercised end-to-end. */
  const freeOnlyProps = {
    releaseId: 'release-123',
    availableFormats: [
      { formatType: 'MP3_320KBPS', fileName: 'album-mp3.zip' },
      { formatType: 'AAC', fileName: 'album-aac.zip' },
    ],
    downloadCount: 0,
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

  // Real timers by default: RTL waitFor/findBy then settle via MutationObserver
  // (microtask-fast) instead of being quantized to shouldAdvanceTime ticks.
  // The two tests that advance the component reset timer opt into fake timers
  // locally; afterEach restores real timers for the rest.
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await user.click(screen.getByRole('combobox'));
    const flacOption = screen.getAllByRole('option').find((o) => o.textContent?.includes('FLAC'));
    await user.click(flacOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Download 1 format$/ })).toBeEnabled();
  });

  it('should select all formats via "Select all"', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);

    const flacOption = screen
      .getAllByRole('option')
      .find((opt) => opt.textContent?.includes('FLAC'));
    await user.click(flacOption as HTMLElement);

    expect(screen.getByRole('button', { name: /Download 2 formats/ })).toBeInTheDocument();
  });

  it('should show singular "format" when only one is selected', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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

  it('triggers a streaming download via anchor click on paid mode', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    await waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/releases\/release-123\/download\/bundle\?formats=FLAC,WAV,MP3_320KBPS&respond=stream/
        )
      );
    });
    // Preflight is the only fetch before the anchor-based stream navigation.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toContain('respond=preflight');
  });

  it('should show "Preparing..." while downloads are in progress', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', () => new Promise(() => {}));

    render(
      <FormatBundleDownload
        {...defaultProps}
        availableFormats={[{ formatType: 'MP3_320KBPS', fileName: 'mp3.zip' }]}
        mode="free"
      />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('combobox'));
    const mp3 = screen.getAllByRole('option').find((o) => /MP3 320/i.test(o.textContent ?? ''));
    await user.click(mp3 as HTMLElement);
    await user.click(screen.getByRole('button', { name: /Download 1 format$/ }));

    expect(screen.getByRole('button', { name: /Preparing/ })).toBeDisabled();
  });

  it('should show per-format progress and "Download started!" on completion', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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

  it('keeps formats marked done after the global uploading event fires', async () => {
    // Regression: previously, the global `progress { status: "uploading" }`
    // event downgraded every per-format `done` back to a blue spinner —
    // visible as green-check → blue-spinner → spin-forever for premium
    // (lossless) bundles whose upload phase takes a long time.
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const eventsThroughUploading: Array<{ event: string; data: Record<string, unknown> }> = [
      { event: 'progress', data: { formatType: 'FLAC', label: 'FLAC', status: 'zipping' } },
      { event: 'progress', data: { formatType: 'WAV', label: 'WAV', status: 'zipping' } },
      {
        event: 'progress',
        data: { formatType: 'MP3_320KBPS', label: 'MP3 320kbps', status: 'zipping' },
      },
      { event: 'progress', data: { formatType: 'FLAC', label: 'FLAC', status: 'done' } },
      { event: 'progress', data: { formatType: 'WAV', label: 'WAV', status: 'done' } },
      {
        event: 'progress',
        data: { formatType: 'MP3_320KBPS', label: 'MP3 320kbps', status: 'done' },
      },
      { event: 'progress', data: { status: 'uploading' } },
    ];

    const encoder = new TextEncoder();
    const chunk = encoder.encode(makeSSEBody(eventsThroughUploading));
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: chunk })
      // Never resolves — simulates the long S3 upload phase.
      .mockReturnValue(new Promise(() => {}));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => ({ read }) },
      })
    );

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    // Each format should remain rendered with the `done` styling
    // (emerald text) — never reverted to a spinner.
    await waitFor(() => {
      const list = screen.getByRole('status');
      const items = within(list).getAllByRole('listitem');
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item.querySelector('span:last-child')).toHaveClass('text-emerald-600');
      }
    });
  });

  it('should trigger a single download for the combined ZIP', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    await waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledWith(
        expect.stringMatching(/respond=stream&mode=free/)
      );
      expect(triggerDownload).toHaveBeenCalledTimes(1);
    });
  });

  it('should not POST to confirm endpoint (server handles count)', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValueOnce(makeFreeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    await waitFor(() => {
      expect(triggerDownload).toHaveBeenCalledTimes(1);
    });

    // Only the SSE fetch should have been called, no confirm POST
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should call onDownloadComplete when download completes', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onDownloadComplete = vi.fn();
    const mockFetch = vi.fn().mockResolvedValueOnce(makeFreeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(
      <FormatBundleDownload
        {...freeOnlyProps}
        mode="free"
        onDownloadComplete={onDownloadComplete}
      />,
      { wrapper: createQueryWrapper() }
    );

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    await waitFor(() => {
      expect(onDownloadComplete).toHaveBeenCalledOnce();
    });
  });

  it('should not error when onDownloadComplete is not provided', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValueOnce(makeFreeSSEResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByText('Download started!')).toBeInTheDocument();
  });

  it('should show error message when download fetch fails', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Download failed');
  });

  it('should show error message when download fetch throws', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('shows an error when preflight rejects with a CAP_REACHED-style failure', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errorCode: 'CAP_REACHED',
            message: 'Free download limit reached for this release.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Free download limit reached for this release.'
    );
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('does not start a second request while download is already in progress', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);

    const downloadButton = screen.getByRole('button', { name: /Download 2 formats/ });
    await user.click(downloadButton);
    await user.click(downloadButton);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('treats SSE read errors after ready as success', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const onDownloadComplete = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(makeThrowAfterReadyResponse(freeSSEEvents))
    );

    render(
      <FormatBundleDownload
        {...freeOnlyProps}
        mode="free"
        onDownloadComplete={onDownloadComplete}
      />,
      { wrapper: createQueryWrapper() }
    );

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByText('Download started!')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onDownloadComplete).toHaveBeenCalledOnce();
  });

  it('should display unknown formatType when no label is found', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
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

  it('shows the server-supplied error message when preflight returns a non-ok response', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'DOWNLOAD_LIMIT',
            message: 'Download limit reached (5). Contact support.',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Download limit reached (5). Contact support.'
    );
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('shows the default error message when preflight is not ok but the body has no message', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    // not-ok preflight whose JSON body omits `message` — exercises the L192
    // false branch so the default "Download failed" copy is used.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errorCode: 'NOPE' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Download failed. Please try again.'
    );
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('uses raw formatType as progress label when label mapping is missing', async () => {
    // Custom (non-FREE) formats only render with a progress list when the
    // SSE flow is active. Drive this through `mode="free"` so the
    // free-format filter is bypassed (CUSTOM_XYZ is intentionally
    // not in FREE_FORMAT_TYPES). We use the paid SSE pathway by leaving
    // mode as default and stubbing fetch to satisfy the existing
    // SSE-style click handler.
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => {}))
    );

    render(
      <FormatBundleDownload
        {...defaultProps}
        availableFormats={[{ formatType: 'CUSTOM_XYZ', fileName: 'file.xyz' }]}
      />,
      { wrapper: createQueryWrapper() }
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /CUSTOM_XYZ/i }));
    await user.click(screen.getByRole('button', { name: /Download 1 format/i }));

    // Paid mode renders a progress entry for the selected format with the
    // raw formatType as fallback label.
    const progressRegion = await screen.findByRole('status');
    expect(within(progressRegion).getByText('CUSTOM_XYZ')).toBeInTheDocument();
  });

  it('clears pending reset timer on unmount after successful download', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(makeFreeSSEResponse()));

    const { unmount } = render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));
    await screen.findByText('Download started!');

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('does not call triggerDownload after unmount during preflight (T063 regression)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    // Preflight that never resolves — simulates a slow network where the
    // user navigates away before the gating check completes.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => undefined))
    );

    const { unmount } = render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    unmount();

    // Allow microtasks/timers to flush — an unmounted instance must NOT
    // invoke triggerDownload even if a stale preflight resolution were to
    // arrive after unmount.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('renders the iOS/Safari anchor fallback link after a completed download', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    render(<FormatBundleDownload {...freeOnlyProps} mode="free" />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 2 formats/ }));

    expect(await screen.findByText('Download started!')).toBeInTheDocument();

    // The captured stream URL is surfaced as a tappable fallback anchor; with
    // no fileName delivered the `download` attribute resolves to undefined.
    const fallback = screen.getByRole('link', { name: /Tap here/i });
    expect(fallback).toHaveAttribute('href', expect.stringContaining('respond=stream&mode=free'));
    expect(fallback).not.toHaveAttribute('download');
  });

  describe('mode="free"', () => {
    const freeProps = {
      releaseId: 'release-free',
      availableFormats: [
        { formatType: 'MP3_320KBPS', fileName: 'mp3.zip' },
        { formatType: 'AAC', fileName: 'aac.zip' },
        { formatType: 'FLAC', fileName: 'flac.zip' },
        { formatType: 'WAV', fileName: 'wav.zip' },
      ],
      downloadCount: 0,
    };

    it('restricts combobox options to FREE_FORMAT_TYPES intersected with availableFormats', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      render(<FormatBundleDownload {...freeProps} mode="free" />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByRole('combobox'));
      const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '');
      expect(labels.some((t) => /MP3 320/i.test(t))).toBe(true);
      expect(labels.some((t) => /AAC/i.test(t))).toBe(true);
      expect(labels.some((t) => /FLAC/i.test(t))).toBe(false);
      expect(labels.some((t) => /WAV/i.test(t))).toBe(false);
    });

    it('appends &mode=free to the bundle fetch URL', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      const mockFetch = vi.fn().mockResolvedValueOnce(makeSSEResponse());
      vi.stubGlobal('fetch', mockFetch);

      render(<FormatBundleDownload {...freeProps} mode="free" />, {
        wrapper: createQueryWrapper(),
      });

      await user.click(screen.getByRole('combobox'));
      const mp3 = screen.getAllByRole('option').find((o) => /MP3 320/i.test(o.textContent ?? ''));
      await user.click(mp3 as HTMLElement);

      await user.click(screen.getByRole('button', { name: /Download 1 format$/ }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('mode=free');
      expect(calledUrl).toContain('formats=MP3_320KBPS');
    });

    it('defaults to paid mode when prop omitted (uses streaming, not SSE)', async () => {
      const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
      const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);

      render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });
      await selectAll(user);
      await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

      await waitFor(() => {
        expect(triggerDownload).toHaveBeenCalled();
      });
      const calledUrl = (triggerDownload as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('respond=stream');
      expect(calledUrl).not.toContain('mode=free');
      // Paid mode issues exactly one preflight fetch — no SSE body read.
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0]?.[0]).toContain('respond=preflight');
      expect(mockFetch.mock.calls[0]?.[0]).not.toContain('mode=free');
    });
  });

  describe('autoStart', () => {
    it('hides the combobox / button and renders the "Preparing your download..." status', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => new Promise(() => {}))
      );

      render(
        <FormatBundleDownload
          {...freeOnlyProps}
          mode="free"
          initialSelectedFormats={['MP3_320KBPS']}
          autoStart
        />,
        { wrapper: createQueryWrapper() }
      );

      // Combobox is hidden in autoStart mode.
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      // The "Preparing your download..." status renders while isDownloading.
      expect(await screen.findByText(/Preparing your download/i)).toBeInTheDocument();
      // The download button is also hidden in autoStart mode.
      expect(
        screen.queryByRole('button', { name: /Download \d+ format/i })
      ).not.toBeInTheDocument();
    });

    it('does NOT auto-start when initialSelectedFormats is empty', () => {
      const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
      vi.stubGlobal('fetch', fetchMock);

      render(
        <FormatBundleDownload
          {...freeOnlyProps}
          mode="free"
          initialSelectedFormats={[]}
          autoStart
        />,
        { wrapper: createQueryWrapper() }
      );

      // No preflight should fire when there are no preselected formats.
      expect(fetchMock).not.toHaveBeenCalled();
      // Auto-start hides the picker even when no formats are preselected.
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('does NOT auto-start when no formats are available at all', () => {
      const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
      vi.stubGlobal('fetch', fetchMock);

      render(
        <FormatBundleDownload
          releaseId="release-123"
          availableFormats={[]}
          downloadCount={0}
          mode="free"
          initialSelectedFormats={['MP3_320KBPS']}
          autoStart
        />,
        { wrapper: createQueryWrapper() }
      );

      // Auto-start should not have triggered the preflight endpoint.
      const preflightCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('respond=preflight')
      );
      expect(preflightCalls).toHaveLength(0);
    });

    it('filters initialSelectedFormats by what is available on mount', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => new Promise(() => {}))
      );

      // 'NOT_AVAILABLE' must be filtered out, leaving MP3_320KBPS as the
      // sole selected format. This exercises the L84 false-branch where
      // both initialSelectedFormats and initialFormats are non-empty.
      render(
        <FormatBundleDownload
          {...freeOnlyProps}
          mode="free"
          initialSelectedFormats={['MP3_320KBPS', 'NOT_AVAILABLE']}
          autoStart
        />,
        { wrapper: createQueryWrapper() }
      );

      // Preparing status implies download started with the filtered subset.
      expect(await screen.findByText(/Preparing your download/i)).toBeInTheDocument();
    });
  });
});
