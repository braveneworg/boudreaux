/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { deletePurchaseAction } from '@/lib/actions/collection-actions';
import { getReleaseCoverArt } from '@/lib/utils/release-helpers';
import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { CollectionList } from './collection-list';

vi.mock('@/lib/actions/collection-actions', () => ({
  deletePurchaseAction: vi.fn(),
}));

vi.mock('@/lib/utils/release-helpers', () => ({
  getReleaseCoverArt: vi.fn(),
}));

vi.mock('next/image', () => ({
  // eslint-disable-next-line jsx-a11y/alt-text, @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

function buildPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'purchase-1',
    amountPaid: 1000,
    currency: 'usd',
    purchasedAt: new Date('2026-01-15'),
    release: {
      id: 'rel-1',
      title: 'Test Album',
      coverArt: 'https://example.com/cover.jpg',
      images: [{ id: 'img-1', src: 'https://example.com/img.jpg', altText: 'Cover', sortOrder: 0 }],
      artistReleases: [
        {
          artist: {
            id: 'artist-1',
            firstName: 'John',
            surname: 'Doe',
            displayName: 'JDoe',
          },
        },
      ],
      digitalFormats: [
        { formatType: 'FLAC', files: [{ fileName: 'track.flac' }] },
        { formatType: 'WAV', files: [{ fileName: 'track.wav' }] },
      ],
      releaseDownloads: [{ downloadCount: 2 }],
    },
    ...overrides,
  };
}

describe('CollectionList', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.mocked(getReleaseCoverArt).mockReturnValue({
      src: 'https://example.com/cover.jpg',
      alt: 'Cover',
    });
  });

  it('renders purchase list with title, artist, and price', () => {
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByText('JDoe')).toBeInTheDocument();
    expect(screen.getByText(/\$10\.00/)).toBeInTheDocument();
  });

  it('renders cover art image when available', () => {
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByAltText('Cover')).toBeInTheDocument();
  });

  it('renders placeholder when no cover art', () => {
    vi.mocked(getReleaseCoverArt).mockReturnValue(null);

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('No art')).toBeInTheDocument();
  });

  it('shows artist displayName when available', () => {
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('JDoe')).toBeInTheDocument();
  });

  it('falls back to firstName + surname when no displayName', () => {
    const purchase = buildPurchase();
    purchase.release.artistReleases = [
      {
        artist: {
          id: 'a-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: null as unknown as string,
        },
      },
    ];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('shows Unknown Artist when no artist releases', () => {
    const purchase = buildPurchase();
    purchase.release.artistReleases = [];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
  });

  it('does not show delete button when not admin', () => {
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.queryByRole('button', { name: /delete purchase/i })).not.toBeInTheDocument();
  });

  it('shows delete button for admin users', () => {
    render(<CollectionList purchases={[buildPurchase()]} isAdmin />, {
      wrapper: createQueryWrapper(),
    });

    expect(
      screen.getByRole('button', { name: /delete purchase for test album/i })
    ).toBeInTheDocument();
  });

  it('calls deletePurchaseAction on delete confirmation', async () => {
    vi.mocked(deletePurchaseAction).mockResolvedValue({ success: true });

    render(<CollectionList purchases={[buildPurchase()]} isAdmin />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /delete purchase for test album/i }));
    await user.click(screen.getByRole('button', { name: /delete$/i }));

    expect(deletePurchaseAction).toHaveBeenCalledWith('purchase-1');
  });

  it('handles delete action failure gracefully', async () => {
    vi.mocked(deletePurchaseAction).mockResolvedValue({
      success: false,
      error: 'Not found',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<CollectionList purchases={[buildPurchase()]} isAdmin />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /delete purchase for test album/i }));
    await user.click(screen.getByRole('button', { name: /delete$/i }));

    expect(errorSpy).toHaveBeenCalledWith('Failed to delete purchase:', 'Not found');
    errorSpy.mockRestore();
  });

  it('handles delete action exception gracefully', async () => {
    vi.mocked(deletePurchaseAction).mockRejectedValue(new Error('Network error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<CollectionList purchases={[buildPurchase()]} isAdmin />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /delete purchase for test album/i }));
    await user.click(screen.getByRole('button', { name: /delete$/i }));

    expect(errorSpy).toHaveBeenCalledWith('Failed to delete purchase:', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('uses fallback download count of 0 when no download records', () => {
    const purchase = buildPurchase();
    purchase.release.releaseDownloads = [];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByRole('button', { name: /download test album/i })).toBeInTheDocument();
  });

  it('filters out formats with no files from available formats', async () => {
    const purchase = buildPurchase();
    purchase.release.digitalFormats = [
      { formatType: 'FLAC', files: [] },
      { formatType: 'WAV', files: [{ fileName: 'track.wav' }] },
    ];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.queryByRole('button', { name: /select flac/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select wav/i })).toBeInTheDocument();
  });

  it('shows no formats message when all formats have empty files', async () => {
    const purchase = buildPurchase();
    purchase.release.digitalFormats = [
      { formatType: 'FLAC', files: [] },
      { formatType: 'WAV', files: [] },
    ];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText(/no digital formats/i)).toBeInTheDocument();
  });

  it('uses firstName only when surname is empty', () => {
    const purchase = buildPurchase();
    purchase.release.artistReleases = [
      {
        artist: {
          id: 'a-1',
          firstName: 'Jane',
          surname: '',
          displayName: null as unknown as string,
        },
      },
    ];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText('Jane')).toBeInTheDocument();
  });
});

describe('CollectionDownloadDialog', () => {
  const mockDownloads = [
    {
      formatType: 'FLAC',
      label: 'FLAC',
      files: [{ downloadUrl: 'https://s3.example.com/track.flac', fileName: 'track.flac' }],
    },
    {
      formatType: 'WAV',
      label: 'WAV',
      files: [{ downloadUrl: 'https://s3.example.com/track.wav', fileName: 'track.wav' }],
    },
  ];

  function makeBundleResponse(formats = mockDownloads) {
    return {
      ok: true,
      json: async () => ({ success: true, downloads: formats }),
    };
  }

  function makeConfirmResponse() {
    return {
      ok: true,
      json: async () => ({ success: true }),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(window, 'open').mockReturnValue(null);
    vi.mocked(getReleaseCoverArt).mockReturnValue({
      src: 'https://example.com/cover.jpg',
      alt: 'Cover',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens download dialog when download button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText('Select formats for')).toBeInTheDocument();
  });

  it('shows all format toggle buttons', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByRole('button', { name: /select flac/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select wav/i })).toBeInTheDocument();
  });

  it('shows download limit message when at limit', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const purchase = buildPurchase();
    purchase.release.releaseDownloads = [{ downloadCount: 5 }];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText(/download limit reached/i)).toBeInTheDocument();
  });

  it('shows no formats message when no digital formats', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const purchase = buildPurchase();
    purchase.release.digitalFormats = [];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText(/no digital formats/i)).toBeInTheDocument();
  });

  it('calls fetch with respond=json on submit', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeBundleResponse())
      .mockResolvedValueOnce(makeConfirmResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/api\/releases\/rel-1\/download\/bundle\?formats=FLAC,WAV&respond=json/
        )
      );
    });
  });

  it('shows Downloading while fetch is in flight', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', () => new Promise(() => {}));

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    expect(screen.getByRole('button', { name: /downloading/i })).toBeDisabled();
  });

  it('shows Downloads started and re-enables the download button after timeout', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeBundleResponse())
      .mockResolvedValueOnce(makeConfirmResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    expect(await screen.findByText('Downloads started!')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('button', { name: /download 2 formats/i })).toBeEnabled();
  });

  it('calls window.open for each format file', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeBundleResponse())
      .mockResolvedValueOnce(makeConfirmResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith('https://s3.example.com/track.flac', '_self');
      expect(window.open).toHaveBeenCalledWith('https://s3.example.com/track.wav', '_self');
      expect(window.open).toHaveBeenCalledTimes(2);
    });
  });

  it('POSTs to confirm endpoint after all downloads', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeBundleResponse())
      .mockResolvedValueOnce(makeConfirmResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/releases/rel-1/download/confirm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ formats: ['FLAC', 'WAV'] }),
        })
      );
    });
  });

  it('shows singular "format" for single selection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const purchase = buildPurchase();
    purchase.release.digitalFormats = [{ formatType: 'FLAC', files: [{ fileName: 'track.flac' }] }];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText(/download 1 format$/i)).toBeInTheDocument();
  });

  it('shows download count usage', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText(/2\/5 downloads used/i)).toBeInTheDocument();
  });

  it('shows raw formatType when no label mapping exists', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const purchase = buildPurchase();
    purchase.release.digitalFormats = [
      { formatType: 'CUSTOM_XYZ', files: [{ fileName: 'custom.zip' }] },
    ];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByText('CUSTOM_XYZ')).toBeInTheDocument();
  });

  it('disables download button when all formats are deselected', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const purchase = buildPurchase();
    purchase.release.digitalFormats = [{ formatType: 'FLAC', files: [{ fileName: 'track.flac' }] }];

    render(<CollectionList purchases={[purchase]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    // Deselect the only format
    await user.click(screen.getByRole('button', { name: /select flac/i }));

    expect(screen.getByRole('button', { name: /select at least one format/i })).toBeDisabled();
  });

  it('resets the download state when dialog reopens', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeBundleResponse())
      .mockResolvedValueOnce(makeConfirmResponse());
    vi.stubGlobal('fetch', mockFetch);

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));
    expect(await screen.findByText('Downloads started!')).toBeInTheDocument();

    // Close and reopen dialog — should reset to idle
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /download test album/i }));

    expect(screen.getByRole('button', { name: /download 2 formats/i })).toBeEnabled();
  });

  it('shows error message when download fetch fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, message: 'Download failed. Please try again.' }),
      })
    );

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Download failed');
  });

  it('shows error message when download fetch throws', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    render(<CollectionList purchases={[buildPurchase()]} isAdmin={false} />, {
      wrapper: createQueryWrapper(),
    });

    await user.click(screen.getByRole('button', { name: /download test album/i }));
    await user.click(screen.getByRole('button', { name: /download 2 formats/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
