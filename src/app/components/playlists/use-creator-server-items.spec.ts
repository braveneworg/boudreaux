// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { PlaylistDetailResponse, PlaylistItemPayload } from '@/lib/types/domain/playlist';

import { useCreatorServerItems } from './use-creator-server-items';

const removePlaylistItemMock = vi.hoisted(() => vi.fn());
const reorderPlaylistItemsMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-playlist-mutations', () => ({
  useRemovePlaylistItemMutation: () => ({
    removePlaylistItem: removePlaylistItemMock,
    isRemovingPlaylistItem: false,
  }),
  useReorderPlaylistItemsMutation: () => ({
    reorderPlaylistItems: reorderPlaylistItemsMock,
    isReorderingPlaylistItems: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const detailItem = (overrides: Partial<PlaylistItemPayload>): PlaylistItemPayload => ({
  id: 'it-1',
  itemType: 'track',
  sortOrder: 0,
  title: 'First',
  artistName: 'Ceschi',
  duration: 125,
  available: true,
  trackFileId: 'tf-1',
  releaseId: 'rel-1',
  releaseTitle: null,
  videoId: null,
  coverArt: 'https://cdn.example/d1.jpg',
  s3Key: null,
  streamUrl: null,
  posterUrl: null,
  ...overrides,
});

const detailFor = (items: PlaylistItemPayload[]): PlaylistDetailResponse => ({
  id: 'pl-1',
  title: 'Road Trip',
  isPublic: false,
  isOwner: true,
  coverImages: [],
  itemCount: items.length,
  totalDuration: 300,
  items,
});

const DETAIL = detailFor([
  detailItem({ id: 'it-2', sortOrder: 1, title: 'Second', itemType: 'video', videoId: 'v-9' }),
  detailItem({ id: 'it-1', sortOrder: 0, title: 'First' }),
]);

type HookArgs = Parameters<typeof useCreatorServerItems>[0];

const renderServerItems = (initialProps: HookArgs) =>
  renderHook((args: HookArgs) => useCreatorServerItems(args), { initialProps });

describe('useCreatorServerItems', () => {
  describe('mapping', () => {
    it('maps detail items into rows sorted by sortOrder', () => {
      const { result } = renderServerItems({ playlistId: 'pl-1', detail: DETAIL });

      expect(result.current.items.map(({ id }) => id)).toEqual(['it-1', 'it-2']);
    });

    it('maps itemType video into isVideo', () => {
      const { result } = renderServerItems({ playlistId: 'pl-1', detail: DETAIL });

      expect(result.current.items.map(({ isVideo }) => isVideo)).toEqual([false, true]);
    });

    it('returns no rows while the detail is not loaded', () => {
      const { result } = renderServerItems({ playlistId: 'pl-1', detail: undefined });

      expect(result.current.items).toEqual([]);
    });

    it('resyncs the rows when a new detail arrives', () => {
      const { result, rerender } = renderServerItems({ playlistId: 'pl-1', detail: DETAIL });

      rerender({
        playlistId: 'pl-1',
        detail: detailFor([detailItem({ id: 'it-3', sortOrder: 0, title: 'Third' })]),
      });

      expect(result.current.items.map(({ id }) => id)).toEqual(['it-3']);
    });
  });

  describe('reorder guards', () => {
    it('does not send the reorder mutation without a playlist id', () => {
      const { result } = renderServerItems({ playlistId: null, detail: DETAIL });

      act(() => result.current.reorderItems(['it-2', 'it-1']));

      expect(reorderPlaylistItemsMock).not.toHaveBeenCalled();
    });

    it('does not send the reorder mutation when an id is not in the list', () => {
      const { result } = renderServerItems({ playlistId: 'pl-1', detail: DETAIL });

      act(() => result.current.reorderItems(['it-1', 'ghost']));

      expect(reorderPlaylistItemsMock).not.toHaveBeenCalled();
    });

    it('keeps the current order when an id is not in the list', () => {
      const { result } = renderServerItems({ playlistId: 'pl-1', detail: DETAIL });

      act(() => result.current.reorderItems(['it-1', 'ghost']));

      expect(result.current.items.map(({ id }) => id)).toEqual(['it-1', 'it-2']);
    });
  });

  describe('remove guard', () => {
    it('does not send the remove mutation without a playlist id', () => {
      const { result } = renderServerItems({ playlistId: null, detail: DETAIL });

      act(() => result.current.removeItem('it-1'));

      expect(removePlaylistItemMock).not.toHaveBeenCalled();
    });
  });
});
