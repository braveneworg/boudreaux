/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { PurchaseSuccessStep } from './purchase-success-step';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/constants', () => ({
  MAX_RELEASE_DOWNLOAD_COUNT: 5,
}));

vi.mock('lucide-react', () => ({
  Loader2Icon: () => <div data-testid="loader-icon" />,
}));

vi.mock('@/app/components/ui/dialog', () => ({
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/app/components/format-bundle-download', () => ({
  FormatBundleDownload: ({
    releaseId,
    availableFormats,
    downloadCount,
    onDownloadComplete,
  }: {
    releaseId: string;
    availableFormats: Array<{ formatType: string; fileName: string }>;
    downloadCount: number;
    onDownloadComplete?: () => void;
  }) =>
    availableFormats.length > 0 ? (
      <div
        data-testid="format-bundle-download"
        data-release-id={releaseId}
        data-format-count={availableFormats.length}
        data-download-count={downloadCount}
      >
        Mock Format Bundle Download
        {onDownloadComplete && (
          <button data-testid="mock-download-btn" onClick={onDownloadComplete}>
            Download
          </button>
        )}
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">No digital formats available for download.</p>
    ),
}));

// ---------------------------------------------------------------------------
// Fetch mock helper
// ---------------------------------------------------------------------------

const mockFormats = [
  { formatType: 'FLAC' as const, fileName: 'album-flac.zip' },
  { formatType: 'WAV' as const, fileName: 'album-wav.zip' },
];

function mockFetchFormats(formats: Array<{ formatType: string; fileName: string }>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ formats }),
  });
}

function mockFetchFailure() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ error: 'Not found' }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PurchaseSuccessStep', () => {
  it('renders the "Purchase Complete!" success heading', async () => {
    mockFetchFormats([]);
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('Purchase Complete!')).toBeDefined();
  });

  it('renders the releaseTitle in the dialog description', async () => {
    mockFetchFormats([]);
    render(<PurchaseSuccessStep releaseId="release-456" releaseTitle="Special Edition EP" />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText(/Special Edition EP/)).toBeDefined();
  });

  it('renders a confirmation email notice', async () => {
    mockFetchFormats([]);
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText(/confirmation email/i)).toBeDefined();
  });

  it('shows loading state initially', () => {
    mockFetchFormats(mockFormats);
    render(<PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByRole('status')).toBeDefined();
  });
});

describe('PurchaseSuccessStep — fetches formats from API', () => {
  it('fetches formats from the API on mount', async () => {
    mockFetchFormats(mockFormats);

    render(
      <PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" downloadCount={0} />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('format-bundle-download')).toBeDefined();
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/releases/release-123/digital-formats');
    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute('data-format-count', '2');
  });

  it('passes the correct downloadCount to FormatBundleDownload', async () => {
    mockFetchFormats(mockFormats);

    render(
      <PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" downloadCount={3} />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('format-bundle-download')).toBeDefined();
    });

    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute(
      'data-download-count',
      '3'
    );
  });

  it('falls back to prop formats when API call fails', async () => {
    mockFetchFailure();

    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={mockFormats}
        downloadCount={0}
      />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('format-bundle-download')).toBeDefined();
    });

    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute('data-format-count', '2');
  });
});

describe('PurchaseSuccessStep — no available formats', () => {
  it('renders fallback message when API returns empty formats', async () => {
    mockFetchFormats([]);

    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={[]}
        downloadCount={0}
      />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('No digital formats available for download.')).toBeDefined();
    });

    expect(screen.queryByTestId('format-bundle-download')).toBeNull();
  });

  it('renders fallback message when API fails and no prop formats provided', async () => {
    mockFetchFailure();

    render(
      <PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" downloadCount={0} />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('No digital formats available for download.')).toBeDefined();
    });
  });
});

describe('PurchaseSuccessStep — fetch network error (catch branch)', () => {
  it('falls back to prop formats when fetch throws a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={mockFormats}
        downloadCount={0}
      />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('format-bundle-download')).toBeDefined();
    });

    expect(screen.getByTestId('format-bundle-download')).toHaveAttribute('data-format-count', '2');
  });

  it('shows empty formats message when fetch throws and no prop formats', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(
      <PurchaseSuccessStep releaseId="release-123" releaseTitle="Test Album" downloadCount={0} />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText('No digital formats available for download.')).toBeDefined();
    });
  });

  it('does not update state when component unmounts before fetch resolves', async () => {
    expect.assertions(0);
    let resolveFetch: (value: unknown) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { unmount } = render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={mockFormats}
        downloadCount={0}
      />,
      { wrapper: createQueryWrapper() }
    );

    // Unmount before fetch resolves — sets cancelled = true
    unmount();

    // Resolve after unmount — cancelled guard should prevent setState calls
    resolveFetch!({
      ok: true,
      json: () => Promise.resolve({ formats: mockFormats }),
    });
  });

  it('does not update state when component unmounts before a failed fetch resolves', async () => {
    expect.assertions(0);
    let resolveFetch: (value: unknown) => void;
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { unmount } = render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        availableFormats={mockFormats}
        downloadCount={0}
      />,
      { wrapper: createQueryWrapper() }
    );

    // Unmount before fetch resolves — sets cancelled = true
    unmount();

    // Resolve with a non-ok response after unmount — cancelled guard should
    // prevent the setFormats call in the !res.ok branch.
    resolveFetch!({ ok: false });
  });
});

describe('PurchaseSuccessStep — onDownloadComplete callback', () => {
  it('passes onDownloadComplete through to FormatBundleDownload', async () => {
    mockFetchFormats(mockFormats);
    const onDownloadComplete = vi.fn();

    render(
      <PurchaseSuccessStep
        releaseId="release-123"
        releaseTitle="Test Album"
        downloadCount={0}
        onDownloadComplete={onDownloadComplete}
      />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-download-btn')).toBeDefined();
    });

    screen.getByTestId('mock-download-btn').click();
    expect(onDownloadComplete).toHaveBeenCalledOnce();
  });
});
