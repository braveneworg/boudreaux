/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { AddToPlaylistPanel } from './add-to-playlist-panel';

import type { UseAddToPlaylistResult } from './use-add-to-playlist';

const usePlaylistsQueryMock = vi.hoisted(() => vi.fn());
const useAddToPlaylistMock = vi.hoisted(() => vi.fn());

vi.mock('./_hooks/use-playlists-query', () => ({
  usePlaylistsQuery: usePlaylistsQueryMock,
}));

vi.mock('./use-add-to-playlist', () => ({
  useAddToPlaylist: useAddToPlaylistMock,
}));

interface TilesStubProps {
  images: string[];
  alt: string;
  size?: 'sm' | 'lg';
}

vi.mock('./playlist-cover-tiles', () => ({
  PlaylistCoverTiles: ({ images, alt, size }: TilesStubProps) => (
    <span
      data-testid="cover-tiles"
      data-images={images.join('|')}
      data-alt={alt}
      data-size={size}
    />
  ),
}));

const makeRow = (id: string, title: string): PlaylistListRow => ({
  id,
  title,
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const ROAD_TRIP = makeRow('pl-1', 'Road Trip');
const CHILL_MIX = makeRow('pl-2', 'Chill Mix');

const ITEM: PlaylistSearchItem = {
  key: 'track:trk-1',
  itemType: 'track',
  title: 'Midnight Drive',
  artistName: 'The Wanderers',
  coverArt: null,
  duration: 210,
  source: { trackFileId: 'trk-1', releaseId: 'rel-1' },
};

const mockRows = (rows: PlaylistListRow[]): void => {
  usePlaylistsQueryMock.mockReturnValue({
    isPending: false,
    error: null,
    rows,
    nextSkip: null,
    loadMore: vi.fn(),
    isLoadingMore: false,
    refetch: vi.fn(),
  });
};

const mockFlow = (overrides: Partial<UseAddToPlaylistResult> = {}): UseAddToPlaylistResult => {
  const flow: UseAddToPlaylistResult = {
    add: vi.fn(),
    duplicateItemTitle: null,
    confirmDuplicate: vi.fn(),
    dismissDuplicate: vi.fn(),
    ...overrides,
  };
  useAddToPlaylistMock.mockReturnValue(flow);
  return flow;
};

type PanelProps = Parameters<typeof AddToPlaylistPanel>[0];

const renderPanel = (overrides: Partial<PanelProps> = {}) => {
  const props: PanelProps = { item: ITEM, onCreatePlaylist: vi.fn(), ...overrides };
  return { ...render(<AddToPlaylistPanel {...props} />), props };
};

describe('AddToPlaylistPanel', () => {
  it('carries the playlists accent, since its popover is portaled out of the page panel', () => {
    mockRows([]);
    mockFlow();
    const { container } = renderPanel();

    expect(container.firstElementChild).toHaveClass('zine-accent-kraft');
  });

  it('adds the item to the picked playlist, naming it for the toast', async () => {
    const user = userEvent.setup();
    mockRows([ROAD_TRIP, CHILL_MIX]);
    const flow = mockFlow();
    renderPanel();

    await user.click(screen.getByRole('option', { name: 'Chill Mix' }));

    expect(vi.mocked(flow.add).mock.calls).toEqual([
      [{ item: ITEM, playlistId: 'pl-2', playlistTitle: 'Chill Mix' }],
    ]);
  });

  it('calls onAdded once the hook reports an add', () => {
    mockRows([]);
    mockFlow();
    const onAdded = vi.fn();
    renderPanel({ onAdded });

    const [{ onAdded: reportAdded }] = useAddToPlaylistMock.mock.calls.at(-1) as [
      { onAdded: () => void },
    ];
    reportAdded();

    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('focuses the picker input on mount', () => {
    // The panel is lazy-loaded inside an already-open popover, so Radix
    // FocusScope's mount-time autofocus has already run against the loading
    // fallback — the panel must place focus itself when it lands.
    mockRows([ROAD_TRIP]);
    mockFlow();
    renderPanel();

    expect(screen.getByPlaceholderText('Find a playlist…')).toHaveFocus();
  });

  it('calls onCreatePlaylist when the "Create playlist" button is clicked', async () => {
    const user = userEvent.setup();
    mockRows([]);
    mockFlow();
    const { props } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Create playlist' }));

    expect(props.onCreatePlaylist).toHaveBeenCalledTimes(1);
  });

  it('opens the duplicate-confirm dialog with the title when duplicateItemTitle is set', () => {
    mockRows([]);
    mockFlow({ duplicateItemTitle: 'Midnight Drive' });
    renderPanel();

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      screen.getByText('"Midnight Drive" is already in this playlist. Add it again?')
    ).toBeInTheDocument();
  });
});
