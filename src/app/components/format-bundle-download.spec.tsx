/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormatBundleDownload } from './format-bundle-download';

describe('FormatBundleDownload', () => {
  const defaultProps = {
    releaseId: 'release-123',
    releaseTitle: 'Test Album',
    availableFormats: [
      { formatType: 'FLAC', fileName: 'album-flac.zip' },
      { formatType: 'WAV', fileName: 'album-wav.zip' },
      { formatType: 'MP3_320KBPS', fileName: 'album-mp3.zip' },
    ],
    downloadCount: 1,
  };

  it('should render format toggle buttons for all available formats', () => {
    render(<FormatBundleDownload {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Select FLAC/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select WAV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select MP3 320kbps/ })).toBeInTheDocument();
  });

  it('should show download count', () => {
    render(<FormatBundleDownload {...defaultProps} />);

    expect(screen.getByText('1/5 downloads used')).toBeInTheDocument();
  });

  it('should pre-select all formats by default', () => {
    render(<FormatBundleDownload {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Download 3 formats/ })).toBeInTheDocument();
  });

  it('should update the download button label when a format is deselected', async () => {
    const user = userEvent.setup();

    render(<FormatBundleDownload {...defaultProps} />);

    // Deselect one format
    await user.click(screen.getByRole('button', { name: /Select FLAC/ }));

    expect(screen.getByRole('button', { name: /Download 2 formats/ })).toBeInTheDocument();
  });

  it('should show singular "format" when only one is selected', async () => {
    const user = userEvent.setup();

    render(<FormatBundleDownload {...defaultProps} />);

    // Deselect two formats
    await user.click(screen.getByRole('button', { name: /Select FLAC/ }));
    await user.click(screen.getByRole('button', { name: /Select WAV/ }));

    expect(screen.getByRole('button', { name: /Download 1 format$/ })).toBeInTheDocument();
  });

  it('should disable the download button when no formats are selected', async () => {
    const user = userEvent.setup();

    render(<FormatBundleDownload {...defaultProps} />);

    // Deselect all formats
    await user.click(screen.getByRole('button', { name: /Select FLAC/ }));
    await user.click(screen.getByRole('button', { name: /Select WAV/ }));
    await user.click(screen.getByRole('button', { name: /Select MP3 320kbps/ }));

    const downloadBtn = screen.getByRole('button', { name: /Select at least one format/ });
    expect(downloadBtn).toBeDisabled();
  });

  it('should disable the download button when at download limit', () => {
    render(<FormatBundleDownload {...defaultProps} downloadCount={5} />);

    const downloadBtn = screen.getByRole('button', { name: /Download 3 formats/ });
    expect(downloadBtn).toBeDisabled();
  });

  it('should show a message when no formats are available', () => {
    render(<FormatBundleDownload {...defaultProps} availableFormats={[]} />);

    expect(screen.getByText('No digital formats available for download.')).toBeInTheDocument();
  });

  it('should trigger a download when the button is clicked', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.fn();
    const appendChildSpy = vi.spyOn(document.body, 'appendChild');

    render(<FormatBundleDownload {...defaultProps} />);

    // Mock the anchor element click
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      }
      return el;
    });

    await user.click(screen.getByRole('button', { name: /Download 3 formats/ }));

    expect(clickSpy).toHaveBeenCalled();
    expect(appendChildSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('should display unknown formatType when no label is found', () => {
    render(
      <FormatBundleDownload
        {...defaultProps}
        availableFormats={[{ formatType: 'CUSTOM_XYZ', fileName: 'file.xyz' }]}
      />
    );

    expect(screen.getByText('CUSTOM_XYZ')).toBeInTheDocument();
  });
});
