/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import { PurchaseSuccessStep } from './purchase-success-step';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/constants', () => ({
  MAX_RELEASE_DOWNLOAD_COUNT: 5,
}));

vi.mock('lucide-react', () => ({
  DownloadIcon: () => null,
}));

vi.mock('@/app/components/ui/dialog', () => ({
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    asChild,
    ...rest
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (asChild ? <>{children}</> : <button {...rest}>{children}</button>),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/app/components/format-bundle-download', () => ({
  FormatBundleDownload: ({
    releaseId,
    availableFormats,
    downloadCount,
  }: {
    releaseId: string;
    releaseTitle: string;
    availableFormats: Array<{ formatType: string; fileName: string }>;
    downloadCount: number;
  }) =>
    availableFormats.length > 0 ? (
      <div
        data-testid="format-bundle-download"
        data-release-id={releaseId}
        data-format-count={availableFormats.length}
        data-download-count={downloadCount}
      >
        Mock Format Bundle Download
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">No digital formats available for download.</p>
    ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PurchaseSuccessStep', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the "Purchase Complete!" success heading', () => {
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />);

    expect(screen.getByText('Purchase Complete!')).toBeDefined();
  });

  it('renders the releaseTitle in the dialog description', () => {
    render(<PurchaseSuccessStep releaseId="release-456" releaseTitle="Special Edition EP" />);

    expect(screen.getByText(/Special Edition EP/)).toBeDefined();
  });

  it('renders a confirmation email notice', () => {
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />);

    expect(screen.getByText(/confirmation email/i)).toBeDefined();
  });
});

describe('PurchaseSuccessStep — with available formats', () => {
  const formats = [
    { formatType: 'FLAC' as const, fileName: 'album-flac.zip' },
    { formatType: 'WAV' as const, fileName: 'album-wav.zip' },
  ];

  beforeEach(() => vi.clearAllMocks());

  it('renders FormatBundleDownload instead of legacy download link when formats are available', () => {
    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={formats}
        downloadCount={0}
      />
    );

    expect(screen.getByTestId('format-bundle-download')).toBeDefined();
    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute(
      'data-release-id',
      'release-123'
    );
    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute('data-format-count', '2');
    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute(
      'data-download-count',
      '0'
    );
    // Legacy download link should NOT be present
    expect(screen.queryByRole('link', { name: /download now/i })).toBeNull();
  });

  it('passes the correct downloadCount to FormatBundleDownload', () => {
    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={formats}
        downloadCount={3}
      />
    );

    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute(
      'data-download-count',
      '3'
    );
  });
});

describe('PurchaseSuccessStep — no available formats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders fallback message when availableFormats is empty', () => {
    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={[]}
        downloadCount={0}
      />
    );

    expect(screen.getByText('No digital formats available for download.')).toBeDefined();
    expect(screen.queryByTestId('format-bundle-download')).toBeNull();
    expect(screen.queryByRole('link', { name: /download now/i })).toBeNull();
  });

  it('renders legacy download link when availableFormats is not provided', () => {
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />);

    const link = screen.getByRole('link', { name: /download now/i });
    expect(link).toBeDefined();
    expect((link as HTMLAnchorElement).href).toContain('/api/releases/release-123/download');
  });
});
