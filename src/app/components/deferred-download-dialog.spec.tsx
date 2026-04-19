/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DeferredDownloadDialog } from './deferred-download-dialog';

const mockUseReleaseUserStatusQuery = vi.fn();

vi.mock('@/app/hooks/use-release-user-status-query', () => ({
  useReleaseUserStatusQuery: (...args: unknown[]) => mockUseReleaseUserStatusQuery(...args),
}));

// Mock next/dynamic to render synchronously — no Promises involved.
// The real next/dynamic lazy-loads DownloadDialog with { ssr: false }, which
// defers rendering via React.lazy. This mock bypasses the async loader entirely
// and returns a synchronous component that mirrors the DownloadDialog interface
// so that getByTestId assertions work without awaiting.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (_loader: unknown) => {
    const DynamicComponent = ({
      artistName,
      releaseId,
      releaseTitle,
      hasPurchase,
      purchasedAt,
      downloadCount,
      availableFormats,
      openOnMount,
      children,
    }: {
      artistName: string;
      releaseId: string;
      releaseTitle: string;
      hasPurchase: boolean;
      purchasedAt: Date | null;
      downloadCount: number;
      availableFormats: Array<{ formatType: string; fileName: string }>;
      openOnMount: boolean;
      children: React.ReactNode;
    }) => (
      <div
        data-testid="download-dialog"
        data-artist={artistName}
        data-release-id={releaseId}
        data-release-title={releaseTitle}
        data-has-purchase={String(hasPurchase)}
        data-purchased-at={purchasedAt ? purchasedAt.toISOString() : ''}
        data-download-count={String(downloadCount)}
        data-format-count={String(availableFormats.length)}
        data-open-on-mount={String(openOnMount)}
      >
        {children}
      </div>
    );
    DynamicComponent.displayName = 'DynamicComponent';
    return DynamicComponent;
  },
}));

vi.mock('./download-trigger-button', () => ({
  DownloadTriggerButton: ({
    label,
    onClick,
    ...props
  }: {
    label: string;
    className?: string;
    onClick?: () => void;
  } & Record<string, unknown>) => (
    <button data-testid="download-trigger" onClick={onClick} {...props}>
      {label}
    </button>
  ),
}));

const defaultProps = {
  artistName: 'Test Artist',
  releaseId: 'release-123',
  releaseTitle: 'Test Release',
};

describe('DeferredDownloadDialog', () => {
  beforeEach(() => {
    mockUseReleaseUserStatusQuery.mockReturnValue({ data: undefined });
  });

  it('should render the trigger button initially', () => {
    render(<DeferredDownloadDialog {...defaultProps} />);

    const trigger = screen.getByTestId('download-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Download');
  });

  it('should call useReleaseUserStatusQuery with the releaseId', () => {
    render(<DeferredDownloadDialog {...defaultProps} />);

    expect(mockUseReleaseUserStatusQuery).toHaveBeenCalledWith('release-123');
  });

  it('should render DownloadDialog after clicking the trigger button', async () => {
    const user = userEvent.setup();

    render(<DeferredDownloadDialog {...defaultProps} />);

    await user.click(screen.getByTestId('download-trigger'));

    const dialog = screen.getByTestId('download-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('data-artist', 'Test Artist');
    expect(dialog).toHaveAttribute('data-release-id', 'release-123');
    expect(dialog).toHaveAttribute('data-release-title', 'Test Release');
    expect(dialog).toHaveAttribute('data-open-on-mount', 'true');
  });

  it('should pass default values when userStatus is undefined', async () => {
    const user = userEvent.setup();
    mockUseReleaseUserStatusQuery.mockReturnValue({ data: undefined });

    render(<DeferredDownloadDialog {...defaultProps} />);
    await user.click(screen.getByTestId('download-trigger'));

    const dialog = screen.getByTestId('download-dialog');
    expect(dialog).toHaveAttribute('data-has-purchase', 'false');
    expect(dialog).toHaveAttribute('data-purchased-at', '');
    expect(dialog).toHaveAttribute('data-download-count', '0');
    expect(dialog).toHaveAttribute('data-format-count', '0');
  });

  it('should pass purchase data from userStatus to DownloadDialog', async () => {
    const user = userEvent.setup();
    mockUseReleaseUserStatusQuery.mockReturnValue({
      data: {
        hasPurchase: true,
        purchasedAt: '2025-06-15T12:00:00.000Z',
        downloadCount: 3,
        availableFormats: [
          { formatType: 'FLAC', fileName: 'album.flac.zip' },
          { formatType: 'MP3_320KBPS', fileName: 'album.mp3.zip' },
        ],
      },
    });

    render(<DeferredDownloadDialog {...defaultProps} />);
    await user.click(screen.getByTestId('download-trigger'));

    const dialog = screen.getByTestId('download-dialog');
    expect(dialog).toHaveAttribute('data-has-purchase', 'true');
    expect(dialog).toHaveAttribute('data-purchased-at', '2025-06-15T12:00:00.000Z');
    expect(dialog).toHaveAttribute('data-download-count', '3');
    expect(dialog).toHaveAttribute('data-format-count', '2');
  });

  it('should pass null purchasedAt when userStatus has no purchasedAt', async () => {
    const user = userEvent.setup();
    mockUseReleaseUserStatusQuery.mockReturnValue({
      data: {
        hasPurchase: false,
        purchasedAt: null,
        downloadCount: 0,
        availableFormats: [],
      },
    });

    render(<DeferredDownloadDialog {...defaultProps} />);
    await user.click(screen.getByTestId('download-trigger'));

    const dialog = screen.getByTestId('download-dialog');
    expect(dialog).toHaveAttribute('data-has-purchase', 'false');
    expect(dialog).toHaveAttribute('data-purchased-at', '');
  });

  it('should render the trigger button inside DownloadDialog as children', async () => {
    const user = userEvent.setup();

    render(<DeferredDownloadDialog {...defaultProps} />);
    await user.click(screen.getByTestId('download-trigger'));

    const dialog = screen.getByTestId('download-dialog');
    const innerTrigger = dialog.querySelector('[data-testid="download-trigger"]');
    expect(innerTrigger).toBeInTheDocument();
  });
});
