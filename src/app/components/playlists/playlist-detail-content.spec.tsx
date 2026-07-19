/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';

import type { PlaylistDetailResponse, PlaylistItemPayload } from '@/lib/types/domain/playlist';

import { PlaylistDetailContent } from './playlist-detail-content';

const usePlaylistQueryMock = vi.hoisted(() => vi.fn());
vi.mock('./_hooks/use-playlist-query', () => ({ usePlaylistQuery: usePlaylistQueryMock }));
vi.mock('./playlist-player', () => ({
  PlaylistPlayer: ({ items, title }: { items: Array<{ id: string }>; title: string }) => (
    <div data-testid="player" data-order={items.map(({ id }) => id).join(',')}>
      {title}
    </div>
  ),
}));
vi.mock('./playlist-download-row', () => ({
  PlaylistDownloadRow: ({ playlistId, disabled }: { playlistId: string; disabled?: boolean }) => (
    <div data-testid="download-row" data-disabled={String(disabled ?? false)}>
      {playlistId}
    </div>
  ),
}));
vi.mock('./playlist-share-popover', () => ({
  PlaylistSharePopover: ({ children, isPublic }: { children: ReactNode; isPublic: boolean }) => (
    <div data-testid="share-popover" data-public={String(isPublic)}>
      {children}
    </div>
  ),
}));

const makeItem = (overrides: Partial<PlaylistItemPayload>): PlaylistItemPayload => ({
  id: 'item-a',
  itemType: 'track',
  sortOrder: 0,
  title: 'Track One',
  artistName: 'Ceschi',
  duration: 200,
  available: true,
  trackFileId: 'tf-1',
  releaseId: 'rel-1',
  releaseTitle: 'Broken Bone Ballads',
  videoId: null,
  coverArt: 'https://cdn.example.com/cover-1.jpg',
  s3Key: 'releases/rel-1/digital-formats/MP3_320KBPS/a.mp3',
  streamUrl: 'https://cdn.example.com/a.mp3',
  posterUrl: null,
  ...overrides,
});

const trackA = makeItem({});
const trackB = makeItem({ id: 'item-b', sortOrder: 1, title: 'Track Two', trackFileId: 'tf-2' });
const videoItem = makeItem({
  id: 'item-v',
  itemType: 'video',
  sortOrder: 0,
  title: 'Video One',
  trackFileId: null,
  releaseId: null,
  releaseTitle: null,
  videoId: 'vid-1',
  s3Key: null,
  streamUrl: 'https://signed.example.com/v.mp4',
  posterUrl: 'https://cdn.example.com/poster.jpg',
});

// Input order deliberately unsorted: item-b (sortOrder 1) BEFORE item-a (sortOrder 0).
const makeDetail = (overrides: Partial<PlaylistDetailResponse>): PlaylistDetailResponse => ({
  id: 'pl-1',
  title: 'Road Mix',
  isPublic: true,
  isOwner: false,
  coverImages: [],
  itemCount: 2,
  totalDuration: 400,
  items: [trackB, trackA],
  ...overrides,
});

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

describe('PlaylistDetailContent', () => {
  it('shows the loading status while pending', () => {
    mockQuery({ isPending: true });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading playlist…');
  });

  it('shows the error line when settled without data', () => {
    mockQuery({ isPending: false });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByText(/Couldn.t load playlist\./)).toBeInTheDocument();
  });

  it('renders the meta line, download row above the player, and sorted items', () => {
    mockQuery({ isPending: false, data: makeDetail({}) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByText('2 items · Public')).toBeInTheDocument();
    const row = screen.getByTestId('download-row');
    const player = screen.getByTestId('player');
    expect(row.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(player).toHaveAttribute('data-order', 'item-a,item-b'); // sorted by sortOrder
    expect(screen.getByTestId('share-popover')).toHaveAttribute('data-public', 'true');
  });

  it('singularises the meta line for a one-item private playlist', () => {
    mockQuery({ isPending: false, data: makeDetail({ itemCount: 1, isPublic: false }) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByText('1 item · Private')).toBeInTheDocument();
  });

  it('renders the labelled share trigger inside the popover', () => {
    mockQuery({ isPending: false, data: makeDetail({}) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByRole('button', { name: 'Share playlist' })).toBeInTheDocument();
  });

  it('deep-links the owner back into My Playlists', () => {
    mockQuery({ isPending: false, data: makeDetail({ isOwner: true }) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByRole('link', { name: 'Open in My Playlists' })).toHaveAttribute(
      'href',
      '/playlists?edit=pl-1'
    );
  });

  it('hides the owner deep link for non-owners', () => {
    mockQuery({ isPending: false, data: makeDetail({ isOwner: false }) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.queryByRole('link', { name: 'Open in My Playlists' })).not.toBeInTheDocument();
  });

  it('disables the download row for an all-video playlist', () => {
    mockQuery({ isPending: false, data: makeDetail({ items: [videoItem] }) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByTestId('download-row')).toHaveAttribute('data-disabled', 'true');
  });

  it('enables the download row when the playlist has tracks', () => {
    mockQuery({ isPending: false, data: makeDetail({}) });
    render(<PlaylistDetailContent playlistId="pl-1" />);

    expect(screen.getByTestId('download-row')).toHaveAttribute('data-disabled', 'false');
  });
});
