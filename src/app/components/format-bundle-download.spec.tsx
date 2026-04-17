/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { FormatBundleDownload } from './format-bundle-download';

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

  const stubWindowOpen = () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    return openSpy;
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

  it('should navigate to the bundle API URL synchronously on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const openSpy = stubWindowOpen();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/releases\/release-123\/download\/bundle\?formats=FLAC,WAV,MP3_320KBPS/
      ),
      '_self'
    );
  });

  it('should show "Preparing download..." while the navigation is in flight', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubWindowOpen();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(screen.getByRole('button', { name: /Preparing download/ })).toBeDisabled();
  });

  it('should re-enable the download button after the preparing timeout', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubWindowOpen();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(screen.getByRole('button', { name: /Preparing download/ })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeEnabled();
  });

  it('should call onDownloadComplete after the preparing timeout', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDownloadComplete = vi.fn();
    stubWindowOpen();

    render(<FormatBundleDownload {...defaultProps} onDownloadComplete={onDownloadComplete} />, {
      wrapper: createQueryWrapper(),
    });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(onDownloadComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onDownloadComplete).toHaveBeenCalledOnce();
  });

  it('should not error when onDownloadComplete is not provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubWindowOpen();

    render(<FormatBundleDownload {...defaultProps} />, { wrapper: createQueryWrapper() });

    await selectAll(user);
    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(() =>
      act(() => {
        vi.advanceTimersByTime(3000);
      })
    ).not.toThrow();
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
