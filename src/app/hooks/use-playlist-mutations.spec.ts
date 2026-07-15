// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  createPlaylistAction,
  deletePlaylistAction,
  updatePlaylistAction,
} from '@/lib/actions/playlist-actions';
import {
  addPlaylistItemAction,
  removePlaylistItemAction,
  reorderPlaylistItemsAction,
} from '@/lib/actions/playlist-item-actions';
import { queryKeys } from '@/lib/query-keys';
import type {
  PlaylistActionResult,
  PlaylistDetailResponse,
  PlaylistItemPayload,
} from '@/lib/types/domain/playlist';
import type {
  AddPlaylistItemInput,
  CreatePlaylistInput,
  ReorderPlaylistItemsInput,
  UpdatePlaylistInput,
} from '@/lib/validation/playlist-schema';

import {
  useAddPlaylistItemMutation,
  useCreatePlaylistMutation,
  useDeletePlaylistMutation,
  useRemovePlaylistItemMutation,
  useReorderPlaylistItemsMutation,
  useUpdatePlaylistMutation,
} from './use-playlist-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const setQueryDataMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  }),
}));

vi.mock('@/lib/actions/playlist-actions', () => ({
  createPlaylistAction: vi.fn(),
  updatePlaylistAction: vi.fn(),
  deletePlaylistAction: vi.fn(),
}));

vi.mock('@/lib/actions/playlist-item-actions', () => ({
  addPlaylistItemAction: vi.fn(),
  removePlaylistItemAction: vi.fn(),
  reorderPlaylistItemsAction: vi.fn(),
}));

interface MutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess: (data: TData, variables: TVariables) => Promise<unknown> | undefined;
}

const getOptions = <TData, TVariables>(
  renderFn: () => unknown
): MutationOptions<TData, TVariables> => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions<TData, TVariables>;
};

const detailResponse: PlaylistDetailResponse = {
  id: 'p1',
  title: 'Mixtape',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: 0,
  totalDuration: 0,
  items: [],
};

const itemPayload: PlaylistItemPayload = {
  id: 'i1',
  itemType: 'track',
  sortOrder: 0,
  title: 'Song',
  artistName: 'Artist',
  duration: 180,
  available: true,
  trackFileId: 'tf1',
  releaseId: 'r1',
  releaseTitle: 'Album',
  videoId: null,
  coverArt: null,
};

beforeEach(() => {
  useMutationMock.mockReset();
  invalidateQueriesMock.mockClear();
  setQueryDataMock.mockClear();
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  });
});

describe('useCreatePlaylistMutation', () => {
  const createInput: CreatePlaylistInput = {
    title: 'Mixtape',
    isPublic: false,
    coverImages: [],
    items: [],
  };

  it('calls createPlaylistAction with the exact input passed to mutate', async () => {
    vi.mocked(createPlaylistAction).mockResolvedValue({ success: true, data: detailResponse });
    const opts = getOptions<PlaylistDetailResponse, CreatePlaylistInput>(useCreatePlaylistMutation);

    await opts.mutationFn(createInput);

    expect(createPlaylistAction).toHaveBeenCalledWith(createInput);
  });

  it('rejects with the action error message on failure', async () => {
    vi.mocked(createPlaylistAction).mockResolvedValue({
      success: false,
      error: 'Failed to create playlist',
    });
    const opts = getOptions<PlaylistDetailResponse, CreatePlaylistInput>(useCreatePlaylistMutation);

    await expect(opts.mutationFn(createInput)).rejects.toThrow('Failed to create playlist');
  });

  it('seeds the detail cache with the returned playlist on success', async () => {
    vi.mocked(createPlaylistAction).mockResolvedValue({ success: true, data: detailResponse });
    const opts = getOptions<PlaylistDetailResponse, CreatePlaylistInput>(useCreatePlaylistMutation);

    const data = await opts.mutationFn(createInput);
    await opts.onSuccess(data, createInput);

    expect(setQueryDataMock).toHaveBeenCalledWith(queryKeys.playlists.detail('p1'), detailResponse);
  });

  it('invalidates only the my-playlists cache on success', async () => {
    const opts = getOptions<PlaylistDetailResponse, CreatePlaylistInput>(useCreatePlaylistMutation);

    await opts.onSuccess(detailResponse, createInput);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.playlists.mine() });
    expect(invalidateQueriesMock).toHaveBeenCalledTimes(1);
  });
});

describe('useUpdatePlaylistMutation', () => {
  const updateInput: UpdatePlaylistInput = { playlistId: 'p1', title: 'Renamed' };

  it('calls updatePlaylistAction with the exact input passed to mutate', async () => {
    vi.mocked(updatePlaylistAction).mockResolvedValue({ success: true, data: detailResponse });
    const opts = getOptions<PlaylistDetailResponse, UpdatePlaylistInput>(useUpdatePlaylistMutation);

    await opts.mutationFn(updateInput);

    expect(updatePlaylistAction).toHaveBeenCalledWith(updateInput);
  });

  it('rejects with the action error message on failure', async () => {
    vi.mocked(updatePlaylistAction).mockResolvedValue({
      success: false,
      error: 'Failed to update playlist',
    });
    const opts = getOptions<PlaylistDetailResponse, UpdatePlaylistInput>(useUpdatePlaylistMutation);

    await expect(opts.mutationFn(updateInput)).rejects.toThrow('Failed to update playlist');
  });

  it('invalidates the my-playlists and detail caches on success', async () => {
    const opts = getOptions<PlaylistDetailResponse, UpdatePlaylistInput>(useUpdatePlaylistMutation);

    await opts.onSuccess(detailResponse, updateInput);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.playlists.mine() });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.playlists.detail('p1'),
    });
  });
});

describe('useDeletePlaylistMutation', () => {
  const deleteInput = { playlistId: 'p1' };

  it('calls deletePlaylistAction with the exact input passed to mutate', async () => {
    vi.mocked(deletePlaylistAction).mockResolvedValue({ success: true, data: { deleted: true } });
    const opts = getOptions<{ deleted: true }, { playlistId: string }>(useDeletePlaylistMutation);

    await opts.mutationFn(deleteInput);

    expect(deletePlaylistAction).toHaveBeenCalledWith(deleteInput);
  });

  it('rejects with the action error message on failure', async () => {
    vi.mocked(deletePlaylistAction).mockResolvedValue({
      success: false,
      error: 'Failed to delete playlist',
    });
    const opts = getOptions<{ deleted: true }, { playlistId: string }>(useDeletePlaylistMutation);

    await expect(opts.mutationFn(deleteInput)).rejects.toThrow('Failed to delete playlist');
  });

  it('invalidates the my-playlists and detail caches on success', async () => {
    const opts = getOptions<{ deleted: true }, { playlistId: string }>(useDeletePlaylistMutation);

    await opts.onSuccess({ deleted: true }, deleteInput);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.playlists.mine() });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.playlists.detail('p1'),
    });
  });
});

describe('useAddPlaylistItemMutation', () => {
  const addInput: AddPlaylistItemInput = {
    itemType: 'track',
    trackFileId: 'tf1',
    playlistId: 'p1',
    force: false,
  };

  it('calls addPlaylistItemAction with the exact input passed to mutate', async () => {
    vi.mocked(addPlaylistItemAction).mockResolvedValue({
      success: true,
      data: { item: itemPayload },
    });
    const opts = getOptions<
      PlaylistActionResult<{ item: PlaylistItemPayload }>,
      AddPlaylistItemInput
    >(useAddPlaylistItemMutation);

    await opts.mutationFn(addInput);

    expect(addPlaylistItemAction).toHaveBeenCalledWith(addInput);
  });

  it('resolves with a failure result untouched instead of throwing', async () => {
    const duplicateResult: PlaylistActionResult<{ item: PlaylistItemPayload }> = {
      success: false,
      error: 'DUPLICATE_ITEM',
    };
    vi.mocked(addPlaylistItemAction).mockResolvedValue(duplicateResult);
    const opts = getOptions<
      PlaylistActionResult<{ item: PlaylistItemPayload }>,
      AddPlaylistItemInput
    >(useAddPlaylistItemMutation);

    await expect(opts.mutationFn(addInput)).resolves.toBe(duplicateResult);
  });

  it('does not invalidate anything when the resolved result is a failure', async () => {
    const opts = getOptions<
      PlaylistActionResult<{ item: PlaylistItemPayload }>,
      AddPlaylistItemInput
    >(useAddPlaylistItemMutation);

    await opts.onSuccess({ success: false, error: 'DUPLICATE_ITEM' }, addInput);

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('invalidates the my-playlists and detail caches on a success result', async () => {
    const opts = getOptions<
      PlaylistActionResult<{ item: PlaylistItemPayload }>,
      AddPlaylistItemInput
    >(useAddPlaylistItemMutation);

    await opts.onSuccess({ success: true, data: { item: itemPayload } }, addInput);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.playlists.mine() });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.playlists.detail('p1'),
    });
  });
});

describe('useRemovePlaylistItemMutation', () => {
  const removeInput = { playlistId: 'p1', itemId: 'i1' };

  it('calls removePlaylistItemAction with the exact input passed to mutate', async () => {
    vi.mocked(removePlaylistItemAction).mockResolvedValue({
      success: true,
      data: { removed: true },
    });
    const opts = getOptions<{ removed: true }, { playlistId: string; itemId: string }>(
      useRemovePlaylistItemMutation
    );

    await opts.mutationFn(removeInput);

    expect(removePlaylistItemAction).toHaveBeenCalledWith(removeInput);
  });

  it('rejects with the action error message on failure', async () => {
    vi.mocked(removePlaylistItemAction).mockResolvedValue({
      success: false,
      error: 'Failed to remove playlist item',
    });
    const opts = getOptions<{ removed: true }, { playlistId: string; itemId: string }>(
      useRemovePlaylistItemMutation
    );

    await expect(opts.mutationFn(removeInput)).rejects.toThrow('Failed to remove playlist item');
  });

  it('invalidates the my-playlists and detail caches on success', async () => {
    const opts = getOptions<{ removed: true }, { playlistId: string; itemId: string }>(
      useRemovePlaylistItemMutation
    );

    await opts.onSuccess({ removed: true }, removeInput);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.playlists.mine() });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.playlists.detail('p1'),
    });
  });
});

describe('useReorderPlaylistItemsMutation', () => {
  const reorderInput: ReorderPlaylistItemsInput = {
    playlistId: 'p1',
    orderedItemIds: ['i2', 'i1'],
  };

  it('calls reorderPlaylistItemsAction with the exact input passed to mutate', async () => {
    vi.mocked(reorderPlaylistItemsAction).mockResolvedValue({
      success: true,
      data: { reordered: true },
    });
    const opts = getOptions<{ reordered: true }, ReorderPlaylistItemsInput>(
      useReorderPlaylistItemsMutation
    );

    await opts.mutationFn(reorderInput);

    expect(reorderPlaylistItemsAction).toHaveBeenCalledWith(reorderInput);
  });

  it('rejects with the action error message on failure', async () => {
    vi.mocked(reorderPlaylistItemsAction).mockResolvedValue({
      success: false,
      error: 'Failed to reorder playlist items',
    });
    const opts = getOptions<{ reordered: true }, ReorderPlaylistItemsInput>(
      useReorderPlaylistItemsMutation
    );

    await expect(opts.mutationFn(reorderInput)).rejects.toThrow('Failed to reorder playlist items');
  });

  it('invalidates the my-playlists and detail caches on success', async () => {
    const opts = getOptions<{ reordered: true }, ReorderPlaylistItemsInput>(
      useReorderPlaylistItemsMutation
    );

    await opts.onSuccess({ reordered: true }, reorderInput);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.playlists.mine() });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: queryKeys.playlists.detail('p1'),
    });
  });
});
