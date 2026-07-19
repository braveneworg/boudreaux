// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import type { PlaylistListRow, PlaylistSearchItem } from '@/lib/types/domain/playlist';
import { buildAddPlaylistItemInput } from '@/lib/utils/build-add-playlist-item-input';

import { useAddToPlaylistFlow } from './use-add-to-playlist-flow';

const addPlaylistItemAsyncMock = vi.hoisted(() => vi.fn());
const isAddingPlaylistItemMock = vi.hoisted(() => ({ value: false }));

vi.mock('./_hooks/mutations/use-playlist-mutations', () => ({
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

const ITEM: PlaylistSearchItem = {
  key: 'track:tf-a',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 125,
  source: { trackFileId: 'tf-a', releaseId: 'rel-a' },
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

describe('useAddToPlaylistFlow', () => {
  it('adds the fixed item to the picked playlist with force:false', async () => {
    const { result } = renderHook(() => useAddToPlaylistFlow({ item: ITEM }));

    await act(async () => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(addPlaylistItemAsyncMock).toHaveBeenCalledWith(
      buildAddPlaylistItemInput(ITEM, PLAYLIST_ROW.id, false)
    );
  });

  it('toasts success and fires onAdded on a successful add', async () => {
    const onAdded = vi.fn();
    const { result } = renderHook(() => useAddToPlaylistFlow({ item: ITEM, onAdded }));

    await act(async () => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(toast.success).toHaveBeenCalledWith(`Added to ${PLAYLIST_ROW.title}`);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it('opens the duplicate dialog without an error toast on DUPLICATE_ITEM', async () => {
    addPlaylistItemAsyncMock.mockResolvedValue({ success: false, error: 'DUPLICATE_ITEM' });
    const { result } = renderHook(() => useAddToPlaylistFlow({ item: ITEM }));

    await act(async () => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(result.current.duplicateItemTitle).toBe(ITEM.title);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('confirmDuplicate re-runs the add with force:true', async () => {
    addPlaylistItemAsyncMock.mockResolvedValue({ success: false, error: 'DUPLICATE_ITEM' });
    const { result } = renderHook(() => useAddToPlaylistFlow({ item: ITEM }));
    await act(async () => result.current.pickPlaylist(PLAYLIST_ROW));

    addPlaylistItemAsyncMock.mockResolvedValue({ success: true, data: {} });
    await act(async () => result.current.confirmDuplicate());

    expect(addPlaylistItemAsyncMock).toHaveBeenLastCalledWith(
      buildAddPlaylistItemInput(ITEM, PLAYLIST_ROW.id, true)
    );
  });

  it('toasts the action error on any other failure', async () => {
    addPlaylistItemAsyncMock.mockResolvedValue({ success: false, error: 'Playlist not found' });
    const { result } = renderHook(() => useAddToPlaylistFlow({ item: ITEM }));

    await act(async () => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(toast.error).toHaveBeenCalledWith('Playlist not found');
  });

  it('ignores pickPlaylist while an add is in flight', () => {
    isAddingPlaylistItemMock.value = true;
    const { result } = renderHook(() => useAddToPlaylistFlow({ item: ITEM }));

    act(() => result.current.pickPlaylist(PLAYLIST_ROW));

    expect(addPlaylistItemAsyncMock).not.toHaveBeenCalled();
    isAddingPlaylistItemMock.value = false;
  });
});
