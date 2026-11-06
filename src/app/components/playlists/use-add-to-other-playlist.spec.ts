// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { useAddToOtherPlaylist } from './use-add-to-other-playlist';

import type { AddToPlaylistTarget, UseAddToPlaylistArgs } from './use-add-to-playlist';

const addMock = vi.hoisted(() => vi.fn());
const useAddToPlaylistMock = vi.hoisted(() => vi.fn());

vi.mock('./use-add-to-playlist', () => ({
  useAddToPlaylist: useAddToPlaylistMock,
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

/** Report a successful add the way `useAddToPlaylist` does, through `onAdded`. */
const reportAdded = (target: AddToPlaylistTarget): void => {
  const [args] = useAddToPlaylistMock.mock.calls.at(-1) as [UseAddToPlaylistArgs];
  args.onAdded?.(target);
};

beforeEach(() => {
  useAddToPlaylistMock.mockReturnValue({
    add: addMock,
    duplicateItemTitle: null,
    confirmDuplicate: vi.fn(),
    dismissDuplicate: vi.fn(),
  });
});

describe('useAddToOtherPlaylist', () => {
  it('starts with every picker closed', () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());

    expect(result.current.openPickerKey).toBeNull();
  });

  it('opens one row picker at a time', () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());

    act(() => result.current.togglePicker(ITEM_A));
    act(() => result.current.togglePicker(ITEM_B));

    expect(result.current.openPickerKey).toBe(ITEM_B.key);
  });

  it('closes the open picker when its row is toggled again', () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());

    act(() => result.current.togglePicker(ITEM_A));
    act(() => result.current.togglePicker(ITEM_A));

    expect(result.current.openPickerKey).toBeNull();
  });

  it("adds the open row's item to the picked playlist, naming it", () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());
    act(() => result.current.togglePicker(ITEM_A));

    act(() => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(addMock.mock.calls).toEqual([
      [{ item: ITEM_A, playlistId: 'pl-1', playlistTitle: 'Road Trip' }],
    ]);
  });

  it('ignores a pick with no picker open', () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());

    act(() => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(addMock).not.toHaveBeenCalled();
  });

  it('closes the picker its add started from once the add succeeds', () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());
    act(() => result.current.togglePicker(ITEM_A));

    act(() => reportAdded({ item: ITEM_A, playlistId: 'pl-1', playlistTitle: 'Road Trip' }));

    expect(result.current.openPickerKey).toBeNull();
  });

  it('keeps a newly opened picker open when a stale add for another row succeeds', () => {
    const { result } = renderHook(() => useAddToOtherPlaylist());
    act(() => result.current.togglePicker(ITEM_A));
    act(() => result.current.pickPlaylist(PLAYLIST_ROW)); // add for row A in flight
    act(() => result.current.togglePicker(ITEM_B)); // user opens row B meanwhile

    act(() => reportAdded({ item: ITEM_A, playlistId: 'pl-1', playlistTitle: 'Road Trip' }));

    expect(result.current.openPickerKey).toBe(ITEM_B.key); // NOT nulled by row A's success
  });
});
