/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

import { addPlaylistItemAction } from '@/lib/actions/playlist-item-actions';
import type {
  PlaylistActionResult,
  PlaylistItemPayload,
  PlaylistSearchItem,
} from '@/lib/types/domain/playlist';
import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { useAddToPlaylist, type UseAddToPlaylistArgs } from './use-add-to-playlist';

vi.mock('@/lib/actions/playlist-item-actions', () => ({
  addPlaylistItemAction: vi.fn(),
  removePlaylistItemAction: vi.fn(),
  reorderPlaylistItemsAction: vi.fn(),
}));

vi.mock('@/lib/actions/playlist-actions', () => ({
  createPlaylistAction: vi.fn(),
  deletePlaylistAction: vi.fn(),
  updatePlaylistAction: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

type AddResult = PlaylistActionResult<{ item: PlaylistItemPayload }>;

const SONG: PlaylistSearchItem = {
  key: 'track:tf-a',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 125,
  source: { trackFileId: 'tf-a', releaseId: 'rel-a' },
};

const VIDEO: PlaylistSearchItem = {
  key: 'video:vid-b',
  itemType: 'video',
  title: 'Battlefields',
  artistName: 'Sole',
  coverArt: null,
  duration: 210,
  source: { videoId: 'vid-b' },
};

const ROAD_TRIP = { playlistId: 'pl-1', playlistTitle: 'Road Trip' };

const ADDED: AddResult = {
  success: true,
  data: { item: { id: 'item-1' } as PlaylistItemPayload },
};
const DUPLICATE: AddResult = {
  success: false,
  error: 'This is already in the playlist',
  code: 'DUPLICATE_ITEM',
};
const FULL: AddResult = {
  success: false,
  error: 'This playlist is full — playlists hold up to 200 items.',
  code: 'LIMIT_EXCEEDED',
};

const renderAdd = (args: UseAddToPlaylistArgs = {}) =>
  renderHook(() => useAddToPlaylist(args), { wrapper: createQueryWrapper() });

/** A pending action result the test settles by hand. */
const deferredResult = () => {
  let settle: (result: AddResult) => void = () => undefined;
  const promise = new Promise<AddResult>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};

beforeEach(() => {
  vi.mocked(addPlaylistItemAction).mockResolvedValue(ADDED);
});

describe('useAddToPlaylist', () => {
  it('adds the item to the playlist without forcing', async () => {
    const { result } = renderAdd();

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    expect(vi.mocked(addPlaylistItemAction).mock.calls).toEqual([
      [{ itemType: 'track', trackFileId: 'tf-a', playlistId: 'pl-1', force: false }],
    ]);
  });

  it('toasts the playlist it added to', async () => {
    const { result } = renderAdd();

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added to Road Trip'));
  });

  it('adds without a toast when the target names no playlist', async () => {
    const onAdded = vi.fn();
    const { result } = renderAdd({ onAdded });

    await act(async () => result.current.add({ item: SONG, playlistId: 'pl-1' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('hands the added target to onAdded', async () => {
    const onAdded = vi.fn();
    const { result } = renderAdd({ onAdded });

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() => expect(onAdded.mock.calls).toEqual([[{ item: SONG, ...ROAD_TRIP }]]));
  });

  it('asks about a duplicate instead of toasting it', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(DUPLICATE);
    const { result } = renderAdd();

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() => expect(result.current.duplicateItemTitle).toBe('Cold Wind'));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('adds a confirmed duplicate again with force', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(DUPLICATE);
    const { result } = renderAdd();
    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await waitFor(() => expect(result.current.duplicateItemTitle).toBe('Cold Wind'));

    await act(async () => result.current.confirmDuplicate());

    await waitFor(() =>
      expect(vi.mocked(addPlaylistItemAction).mock.calls.at(-1)).toEqual([
        { itemType: 'track', trackFileId: 'tf-a', playlistId: 'pl-1', force: true },
      ])
    );
  });

  it('closes the duplicate question once confirmed', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(DUPLICATE);
    const { result } = renderAdd();
    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await waitFor(() => expect(result.current.duplicateItemTitle).toBe('Cold Wind'));

    await act(async () => result.current.confirmDuplicate());

    expect(result.current.duplicateItemTitle).toBeNull();
  });

  it('drops a dismissed duplicate without adding it', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(DUPLICATE);
    const { result } = renderAdd();
    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await waitFor(() => expect(result.current.duplicateItemTitle).toBe('Cold Wind'));

    act(() => result.current.dismissDuplicate());

    expect(result.current.duplicateItemTitle).toBeNull();
    expect(addPlaylistItemAction).toHaveBeenCalledTimes(1);
  });

  it('ignores a confirm with no duplicate pending', async () => {
    const { result } = renderAdd();

    await act(async () => result.current.confirmDuplicate());

    expect(addPlaylistItemAction).not.toHaveBeenCalled();
  });

  it('toasts the copy of a failed add', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(FULL);
    const { result } = renderAdd();

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() =>
      expect(vi.mocked(toast.error).mock.calls).toEqual([
        ['This playlist is full — playlists hold up to 200 items.'],
      ])
    );
  });

  it('does not report a failed add as added', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(FULL);
    const onAdded = vi.fn();
    const { result } = renderAdd({ onAdded });

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('toasts the copy when the forced add fails too', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValueOnce(DUPLICATE).mockResolvedValueOnce(FULL);
    const { result } = renderAdd();
    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await waitFor(() => expect(result.current.duplicateItemTitle).toBe('Cold Wind'));

    await act(async () => result.current.confirmDuplicate());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This playlist is full — playlists hold up to 200 items.'
      )
    );
  });

  it('toasts a generic message when the action itself throws', async () => {
    vi.mocked(addPlaylistItemAction).mockRejectedValueOnce(new Error('network down'));
    const { result } = renderAdd();

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to add to playlist'));
  });

  it('ignores a second add of the same item to the same playlist while the first runs', async () => {
    const pending = deferredResult();
    vi.mocked(addPlaylistItemAction).mockReturnValueOnce(pending.promise);
    const { result } = renderAdd();

    act(() => result.current.add({ item: SONG, ...ROAD_TRIP }));
    act(() => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await act(async () => pending.settle(ADDED));

    expect(addPlaylistItemAction).toHaveBeenCalledTimes(1);
  });

  it('runs an add of another item while one is in flight', async () => {
    const pending = deferredResult();
    vi.mocked(addPlaylistItemAction).mockReturnValueOnce(pending.promise);
    const { result } = renderAdd();

    act(() => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await act(async () => result.current.add({ item: VIDEO, ...ROAD_TRIP }));
    await act(async () => pending.settle(ADDED));

    expect(addPlaylistItemAction).toHaveBeenCalledTimes(2);
  });

  it('takes the same add again once the first has settled', async () => {
    const { result } = renderAdd();

    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    await act(async () => result.current.add({ item: SONG, ...ROAD_TRIP }));

    await waitFor(() => expect(addPlaylistItemAction).toHaveBeenCalledTimes(2));
  });
});
