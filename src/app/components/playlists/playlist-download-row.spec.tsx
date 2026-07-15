/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { PlaylistDownloadRow } from './playlist-download-row';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const triggerDownloadMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/trigger-download', () => ({ triggerDownload: triggerDownloadMock }));

const fetchMock = vi.fn();

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const openPopover = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByRole('button', { name: 'Download playlist' }));
};

describe('PlaylistDownloadRow', () => {
  it('shows both free formats and the videos note in the popover', async () => {
    const user = userEvent.setup();
    render(<PlaylistDownloadRow playlistId="pl-1" />);

    await openPopover(user);

    expect(screen.getByRole('button', { name: 'Download MP3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download AAC' })).toBeInTheDocument();
    expect(screen.getByText('Videos are skipped in downloads')).toBeInTheDocument();
  });

  it('preflights then triggers the MP3 stream on ok', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, trackCount: 3, skippedCount: 1 })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(triggerDownloadMock).toHaveBeenCalledExactlyOnceWith(
        '/api/playlists/pl-1/download?format=MP3_320KBPS'
      )
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/playlists/pl-1/download?format=MP3_320KBPS&respond=preflight',
      { cache: 'no-store', credentials: 'same-origin' }
    );
  });

  it('closes the popover after a successful preflight', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, trackCount: 3, skippedCount: 0 })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Download MP3' })).not.toBeInTheDocument()
    );
  });

  it('toasts and never streams when the playlist has no downloadable tracks', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, trackCount: 0, skippedCount: 3 })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'This playlist has no downloadable tracks.'
      )
    );
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('suggests MP3 when the AAC quota is exhausted', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { ok: false, reason: 'QUOTA_EXCEEDED' }));
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download AAC' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'Free AAC download limit reached — MP3 is always free.'
      )
    );
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('shows the generic error for a non-quota failure status', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { ok: false }));
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'Download failed. Please try again.'
      )
    );
    expect(triggerDownloadMock).not.toHaveBeenCalled();
  });

  it('shows the generic error on network failure', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledExactlyOnceWith(
        'Download failed. Please try again.'
      )
    );
  });

  it('disables both format buttons while a preflight is in flight', async () => {
    const user = userEvent.setup();
    let resolvePreflight: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolvePreflight = resolve;
        })
    );
    render(<PlaylistDownloadRow playlistId="pl-1" />);
    await openPopover(user);

    await user.click(screen.getByRole('button', { name: 'Download MP3' }));

    expect(screen.getByRole('button', { name: 'Download MP3' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download AAC' })).toBeDisabled();

    resolvePreflight(jsonResponse(200, { ok: true, trackCount: 1, skippedCount: 0 }));
    await waitFor(() => expect(triggerDownloadMock).toHaveBeenCalledTimes(1));
  });

  it('disables the trigger when the row is disabled', () => {
    render(<PlaylistDownloadRow playlistId="pl-1" disabled />);

    expect(screen.getByRole('button', { name: 'Download playlist' })).toBeDisabled();
  });
});
