// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { useCreatorAddFlow } from './use-creator-add-flow';

const addPlaylistItemAsyncMock = vi.hoisted(() => vi.fn());

vi.mock('./_hooks/mutations/use-playlist-mutations', () => ({
  useAddPlaylistItemMutation: () => ({
    addPlaylistItemAsync: addPlaylistItemAsyncMock,
    isAddingPlaylistItem: false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const SONG: PlaylistSearchItem = {
  key: 'track:tf-1',
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 125,
  source: { trackFileId: 'tf-1', releaseId: 'rel-1' },
};

type HookArgs = Parameters<typeof useCreatorAddFlow>[0];

const renderAddFlow = (overrides: Partial<HookArgs> = {}) => {
  const args: HookArgs = {
    isDraft: false,
    playlistId: 'pl-1',
    addItem: vi.fn(() => ({ duplicate: false })),
    addItemForced: vi.fn(),
    ...overrides,
  };
  const view = renderHook(() => useCreatorAddFlow(args));
  return { ...view, args };
};

describe('useCreatorAddFlow', () => {
  it('starts with the duplicate dialog closed', () => {
    const { result } = renderAddFlow();

    expect(result.current.duplicateItemTitle).toBeNull();
  });

  it('does not run a server add without a playlist id', () => {
    const { result } = renderAddFlow({ playlistId: null });

    act(() => result.current.handleAdd(SONG));

    expect(addPlaylistItemAsyncMock).not.toHaveBeenCalled();
  });

  it('ignores confirmDuplicate when no duplicate is pending', () => {
    const { result, args } = renderAddFlow();

    act(() => result.current.confirmDuplicate());

    expect(addPlaylistItemAsyncMock).not.toHaveBeenCalled();
    expect(args.addItemForced).not.toHaveBeenCalled();
  });
});
