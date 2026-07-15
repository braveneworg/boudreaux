/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistDetailResponse } from '@/lib/types/domain/playlist';

import { PlaylistPlayerDialog } from './playlist-player-dialog';

const usePlaylistQueryMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-playlist-query', () => ({ usePlaylistQuery: usePlaylistQueryMock }));

vi.mock('./playlist-download-row', () => ({
  PlaylistDownloadRow: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="playlist-download-row" data-playlist-id={playlistId} />
  ),
}));

vi.mock('./playlist-player', () => ({
  PlaylistPlayer: ({ items, title }: { items: unknown[]; title: string }) => (
    <div data-testid="playlist-player" data-title={title} data-item-count={items.length} />
  ),
}));

const detail: PlaylistDetailResponse = {
  id: 'pl-1',
  title: 'Road Mix',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 2,
  totalDuration: 400,
  items: [],
};

const mockQuery = ({
  isPending,
  data,
}: {
  isPending: boolean;
  data?: PlaylistDetailResponse;
}): void => {
  usePlaylistQueryMock.mockReturnValue({
    isPending,
    error: Error('Unknown error'),
    data,
    refetch: vi.fn(),
  });
};

describe('PlaylistPlayerDialog', () => {
  it('gates the detail query while the dialog is closed', () => {
    mockQuery({ isPending: true });
    render(<PlaylistPlayerDialog playlistId="pl-1" open={false} onOpenChange={vi.fn()} />);

    expect(usePlaylistQueryMock).toHaveBeenCalledWith('pl-1', { enabled: false });
  });

  it('enables the query when open with a playlist id', () => {
    mockQuery({ isPending: true });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(usePlaylistQueryMock).toHaveBeenCalledWith('pl-1', { enabled: true });
  });

  it('shows skeletons while the detail is pending', () => {
    mockQuery({ isPending: true });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getAllByTestId('playlist-player-dialog-skeleton')).toHaveLength(3);
  });

  it('shows an error line when the detail fails to load', () => {
    mockQuery({ isPending: false });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/Couldn.t load playlist\./)).toBeInTheDocument();
  });

  it('titles the dialog with the playlist title', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Road Mix')).toBeInTheDocument();
  });

  it('stacks the download row above the player', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    const row = screen.getByTestId('playlist-download-row');
    const player = screen.getByTestId('playlist-player');

    expect(row.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('passes the fetched items and title to the player', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('playlist-player')).toHaveAttribute('data-title', 'Road Mix');
    expect(screen.getByTestId('playlist-download-row')).toHaveAttribute('data-playlist-id', 'pl-1');
  });

  it('unmounts the player subtree when closed', () => {
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId('playlist-player')).not.toBeInTheDocument();
  });

  it('forwards dismissal through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    mockQuery({ isPending: false, data: detail });
    render(<PlaylistPlayerDialog playlistId="pl-1" open onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
