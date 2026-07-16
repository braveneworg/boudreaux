/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { AddToPlaylistPanel } from './add-to-playlist-panel';

import type { UseAddToPlaylistFlowResult } from './use-add-to-playlist-flow';

const usePlaylistsQueryMock = vi.hoisted(() => vi.fn());
const useAddToPlaylistFlowMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-playlists-query', () => ({
  usePlaylistsQuery: usePlaylistsQueryMock,
}));

vi.mock('./use-add-to-playlist-flow', () => ({
  useAddToPlaylistFlow: useAddToPlaylistFlowMock,
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

const mockFlow = (
  overrides: Partial<UseAddToPlaylistFlowResult> = {}
): UseAddToPlaylistFlowResult => {
  const flow: UseAddToPlaylistFlowResult = {
    pickPlaylist: vi.fn(),
    duplicateItemTitle: null,
    confirmDuplicate: vi.fn(),
    dismissDuplicate: vi.fn(),
    isAdding: false,
    ...overrides,
  };
  useAddToPlaylistFlowMock.mockReturnValue(flow);
  return flow;
};

type PanelProps = Parameters<typeof AddToPlaylistPanel>[0];

const renderPanel = (overrides: Partial<PanelProps> = {}) => {
  const props: PanelProps = { item: ITEM, onCreatePlaylist: vi.fn(), ...overrides };
  return { ...render(<AddToPlaylistPanel {...props} />), props };
};

describe('AddToPlaylistPanel', () => {
  it('calls pickPlaylist with the selected row when a picker option is clicked', async () => {
    const user = userEvent.setup();
    mockRows([ROAD_TRIP, CHILL_MIX]);
    const flow = mockFlow();
    renderPanel();

    await user.click(screen.getByRole('option', { name: 'Chill Mix' }));

    expect(flow.pickPlaylist).toHaveBeenCalledTimes(1);
    expect(flow.pickPlaylist).toHaveBeenCalledWith(CHILL_MIX);
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
