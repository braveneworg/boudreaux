/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { PlaylistService } from '@/lib/services/playlist-service';
import { DataError } from '@/lib/types/domain/errors';
import type { PlaylistItemPayload } from '@/lib/types/domain/playlist';

import {
  addPlaylistItemAction,
  removePlaylistItemAction,
  reorderPlaylistItemsAction,
} from './playlist-item-actions';

vi.mock('server-only', () => ({}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: {
    addItem: vi.fn(),
    removeItem: vi.fn(),
    reorder: vi.fn(),
  },
  SOURCE_NOT_FOUND_MESSAGE: 'Source track or video not found',
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  },
}));

const USER_ID = 'user-1';
const PLAYLIST_ID = '507f1f77bcf86cd799439011';
const TRACK_FILE_ID = '507f1f77bcf86cd799439012';
const VIDEO_ID = '507f1f77bcf86cd799439013';
const ITEM_ID = '507f1f77bcf86cd799439014';
const OTHER_ITEM_ID = '507f1f77bcf86cd799439015';
const RELEASE_ID = '507f1f77bcf86cd799439016';
const SOURCE_NOT_FOUND_MESSAGE = 'Source track or video not found';

const addedItem: PlaylistItemPayload = {
  id: ITEM_ID,
  itemType: 'track',
  sortOrder: 3,
  title: 'Opening Song',
  artistName: 'Ceschi',
  duration: 215,
  available: true,
  trackFileId: TRACK_FILE_ID,
  releaseId: RELEASE_ID,
  releaseTitle: 'Sad, Fat Luck',
  videoId: null,
  coverArt: 'https://cdn.test/cover.jpg',
};

const validAddInput = {
  playlistId: PLAYLIST_ID,
  itemType: 'track',
  trackFileId: TRACK_FILE_ID,
};

const validRemoveInput = { playlistId: PLAYLIST_ID, itemId: ITEM_ID };

const validReorderInput = {
  playlistId: PLAYLIST_ID,
  orderedItemIds: [ITEM_ID, OTHER_ITEM_ID],
};

const signIn = (user: { id?: string; banned?: boolean | null } = { id: USER_ID }): void => {
  vi.mocked(auth).mockResolvedValue({ user } as never);
};

beforeEach(() => {
  signIn();
});

describe('playlist item actions authorization', () => {
  it('rejects addPlaylistItemAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.addItem).not.toHaveBeenCalled();
  });

  it('rejects addPlaylistItemAction when the user is banned', async () => {
    signIn({ id: USER_ID, banned: true });

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.addItem).not.toHaveBeenCalled();
  });

  it('rejects addPlaylistItemAction when the session user has no id', async () => {
    signIn({ id: '' });

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects removePlaylistItemAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await removePlaylistItemAction(validRemoveInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.removeItem).not.toHaveBeenCalled();
  });

  it('rejects reorderPlaylistItemsAction when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await reorderPlaylistItemsAction(validReorderInput);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(PlaylistService.reorder).not.toHaveBeenCalled();
  });
});

describe('addPlaylistItemAction', () => {
  it('returns field errors for a malformed playlist id', async () => {
    const result = await addPlaylistItemAction({ ...validAddInput, playlistId: 'nope' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('playlistId');
    expect(PlaylistService.addItem).not.toHaveBeenCalled();
  });

  it('returns field errors when a track ref is missing its trackFileId', async () => {
    const result = await addPlaylistItemAction({ playlistId: PLAYLIST_ID, itemType: 'track' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('trackFileId');
    expect(PlaylistService.addItem).not.toHaveBeenCalled();
  });

  it('adds a track item with force defaulted off and revalidates /playlists', async () => {
    vi.mocked(PlaylistService.addItem).mockResolvedValue({ duplicate: false, item: addedItem });

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: true, data: { item: addedItem } });
    expect(PlaylistService.addItem).toHaveBeenCalledWith(USER_ID, {
      playlistId: PLAYLIST_ID,
      ref: { itemType: 'track', trackFileId: TRACK_FILE_ID },
      force: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('passes a video source ref through to the service', async () => {
    vi.mocked(PlaylistService.addItem).mockResolvedValue({
      duplicate: false,
      item: {
        ...addedItem,
        itemType: 'video',
        trackFileId: null,
        releaseId: null,
        releaseTitle: null,
        videoId: VIDEO_ID,
      },
    });

    await addPlaylistItemAction({ playlistId: PLAYLIST_ID, itemType: 'video', videoId: VIDEO_ID });

    expect(PlaylistService.addItem).toHaveBeenCalledWith(USER_ID, {
      playlistId: PLAYLIST_ID,
      ref: { itemType: 'video', videoId: VIDEO_ID },
      force: false,
    });
  });

  it('returns DUPLICATE_ITEM without revalidating when the service reports a duplicate', async () => {
    vi.mocked(PlaylistService.addItem).mockResolvedValue({ duplicate: true });

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'DUPLICATE_ITEM' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes force: true through and succeeds on the confirm-retry path', async () => {
    vi.mocked(PlaylistService.addItem).mockResolvedValue({ duplicate: false, item: addedItem });

    const result = await addPlaylistItemAction({ ...validAddInput, force: true });

    expect(result).toEqual({ success: true, data: { item: addedItem } });
    expect(PlaylistService.addItem).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ force: true })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('maps LIMIT_EXCEEDED to PLAYLIST_FULL', async () => {
    vi.mocked(PlaylistService.addItem).mockRejectedValue(
      new DataError('LIMIT_EXCEEDED', 'Playlists are limited to 200 items')
    );

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'PLAYLIST_FULL' });
  });

  it('maps an unresolvable source to SOURCE_NOT_FOUND', async () => {
    vi.mocked(PlaylistService.addItem).mockRejectedValue(
      new DataError('NOT_FOUND', SOURCE_NOT_FOUND_MESSAGE)
    );

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'SOURCE_NOT_FOUND' });
  });

  it('surfaces a missing playlist as its not-found message, not SOURCE_NOT_FOUND', async () => {
    vi.mocked(PlaylistService.addItem).mockRejectedValue(
      new DataError('NOT_FOUND', 'Playlist not found')
    );

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'Playlist not found' });
  });

  it('collapses unexpected errors to a generic message without revalidating', async () => {
    vi.mocked(PlaylistService.addItem).mockRejectedValue(new Error('mongo internals'));

    const result = await addPlaylistItemAction(validAddInput);

    expect(result).toEqual({ success: false, error: 'Failed to add playlist item' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('removePlaylistItemAction', () => {
  it('rejects a malformed item id', async () => {
    const result = await removePlaylistItemAction({ playlistId: PLAYLIST_ID, itemId: 'nope' });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('itemId');
    expect(PlaylistService.removeItem).not.toHaveBeenCalled();
  });

  it('removes the item and revalidates /playlists', async () => {
    vi.mocked(PlaylistService.removeItem).mockResolvedValue(undefined);

    const result = await removePlaylistItemAction(validRemoveInput);

    expect(result).toEqual({ success: true, data: { removed: true } });
    expect(PlaylistService.removeItem).toHaveBeenCalledWith(USER_ID, PLAYLIST_ID, ITEM_ID);
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('maps a NOT_FOUND DataError to its message', async () => {
    vi.mocked(PlaylistService.removeItem).mockRejectedValue(
      new DataError('NOT_FOUND', 'Playlist item not found')
    );

    const result = await removePlaylistItemAction(validRemoveInput);

    expect(result).toEqual({ success: false, error: 'Playlist item not found' });
  });

  it('collapses unexpected errors to a generic message', async () => {
    vi.mocked(PlaylistService.removeItem).mockRejectedValue(new Error('boom'));

    const result = await removePlaylistItemAction(validRemoveInput);

    expect(result).toEqual({ success: false, error: 'Failed to remove playlist item' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('reorderPlaylistItemsAction', () => {
  it('rejects duplicate ids in orderedItemIds', async () => {
    const result = await reorderPlaylistItemsAction({
      playlistId: PLAYLIST_ID,
      orderedItemIds: [ITEM_ID, ITEM_ID],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.fieldErrors).toHaveProperty('orderedItemIds');
    expect(PlaylistService.reorder).not.toHaveBeenCalled();
  });

  it('reorders the items and revalidates /playlists', async () => {
    vi.mocked(PlaylistService.reorder).mockResolvedValue(undefined);

    const result = await reorderPlaylistItemsAction(validReorderInput);

    expect(result).toEqual({ success: true, data: { reordered: true } });
    expect(PlaylistService.reorder).toHaveBeenCalledWith(USER_ID, PLAYLIST_ID, [
      ITEM_ID,
      OTHER_ITEM_ID,
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/playlists');
  });

  it('surfaces an id-set mismatch INVALID_INPUT with the service message', async () => {
    vi.mocked(PlaylistService.reorder).mockRejectedValue(
      new DataError(
        'INVALID_INPUT',
        'orderedItemIds must contain every playlist item id exactly once'
      )
    );

    const result = await reorderPlaylistItemsAction(validReorderInput);

    expect(result).toEqual({
      success: false,
      error: 'orderedItemIds must contain every playlist item id exactly once',
    });
  });

  it('maps a NOT_FOUND DataError to its message', async () => {
    vi.mocked(PlaylistService.reorder).mockRejectedValue(
      new DataError('NOT_FOUND', 'Playlist not found')
    );

    const result = await reorderPlaylistItemsAction(validReorderInput);

    expect(result).toEqual({ success: false, error: 'Playlist not found' });
  });
});
