// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { useAddToOtherPlaylist } from './use-add-to-other-playlist';

const addPlaylistItemAsyncMock = vi.hoisted(() => vi.fn());
const isAddingPlaylistItemMock = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/mutations/use-playlist-mutations', () => ({
  useAddPlaylistItemMutation: () => ({
    addPlaylistItemAsync: addPlaylistItemAsyncMock,
    get isAddingPlaylistItem() {
      return isAddingPlaylistItemMock.value;
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ITEM_A: PlaylistSearchItem = {
  key: 'track:tf-a',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 125,
  source: { trackFileId: 'tf-a', releaseId: 'rel-a' },
};

const ITEM_B: PlaylistSearchItem = {
  key: 'video:vid-b',
  itemType: 'video',
  title: 'Battlefields',
  artistName: 'Sole',
  coverArt: null,
  duration: 210,
  source: { videoId: 'vid-b' },
};

const PLAYLIST_ROW: PlaylistListRow = {
  id: 'pl-1',
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  isAddingPlaylistItemMock.value = false;
  addPlaylistItemAsyncMock.mockResolvedValue({ success: true, data: {} });
});

describe('useAddToOtherPlaylist', () => {
  it('ignores pickPlaylist while an add is in flight', () => {
    isAddingPlaylistItemMock.value = true;
    const { result } = renderHook(() => useAddToOtherPlaylist());
    act(() => result.current.togglePicker(ITEM_A));

    act(() => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(addPlaylistItemAsyncMock).not.toHaveBeenCalled();
    isAddingPlaylistItemMock.value = false;
  });

  it('keeps a newly opened picker open when a stale add for another row succeeds', async () => {
    let resolveAdd: (r: { success: true; data: unknown }) => void = () => undefined;
    addPlaylistItemAsyncMock.mockReturnValue(new Promise((resolve) => (resolveAdd = resolve)));
    const { result } = renderHook(() => useAddToOtherPlaylist());
    act(() => result.current.togglePicker(ITEM_A));
    act(() => result.current.pickPlaylist(PLAYLIST_ROW)); // add for row A in flight
    act(() => result.current.togglePicker(ITEM_B)); // user opens row B meanwhile

    await act(async () => resolveAdd({ success: true, data: {} }));

    expect(result.current.openPickerKey).toBe(ITEM_B.key); // NOT nulled by row A's success
  });
});
