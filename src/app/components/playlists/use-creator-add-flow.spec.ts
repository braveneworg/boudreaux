// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { useCreatorAddFlow } from './use-creator-add-flow';

import type { UseAddToPlaylistResult } from './use-add-to-playlist';

const serverAddMock = vi.hoisted(() => ({
  add: vi.fn(),
  confirmDuplicate: vi.fn(),
  dismissDuplicate: vi.fn(),
  duplicateItemTitle: null as string | null,
}));

vi.mock('./use-add-to-playlist', () => ({
  useAddToPlaylist: (): UseAddToPlaylistResult => serverAddMock,
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

beforeEach(() => {
  serverAddMock.duplicateItemTitle = null;
});

describe('useCreatorAddFlow', () => {
  it('starts with the duplicate dialog closed', () => {
    const { result } = renderAddFlow();

    expect(result.current.duplicateItemTitle).toBeNull();
  });

  it('adds to the saved playlist silently, naming no playlist for a toast', () => {
    const { result } = renderAddFlow();

    act(() => result.current.handleAdd(SONG));

    expect(serverAddMock.add.mock.calls).toEqual([[{ item: SONG, playlistId: 'pl-1' }]]);
  });

  it('does not run a server add without a playlist id', () => {
    const { result } = renderAddFlow({ playlistId: null });

    act(() => result.current.handleAdd(SONG));

    expect(serverAddMock.add).not.toHaveBeenCalled();
  });

  it('stages a draft item without touching the server', () => {
    const { result, args } = renderAddFlow({ isDraft: true, playlistId: null });

    act(() => result.current.handleAdd(SONG));

    expect(args.addItem).toHaveBeenCalledTimes(1);
    expect(serverAddMock.add).not.toHaveBeenCalled();
  });

  it('asks about a draft item already staged', () => {
    const { result } = renderAddFlow({
      isDraft: true,
      playlistId: null,
      addItem: vi.fn(() => ({ duplicate: true })),
    });

    act(() => result.current.handleAdd(SONG));

    expect(result.current.duplicateItemTitle).toBe('Cold Wind');
  });

  it('force-stages a confirmed draft duplicate', () => {
    const { result, args } = renderAddFlow({
      isDraft: true,
      playlistId: null,
      addItem: vi.fn(() => ({ duplicate: true })),
    });
    act(() => result.current.handleAdd(SONG));

    act(() => result.current.confirmDuplicate());

    expect(args.addItemForced).toHaveBeenCalledTimes(1);
    expect(serverAddMock.confirmDuplicate).not.toHaveBeenCalled();
  });

  it('surfaces the server duplicate question', () => {
    serverAddMock.duplicateItemTitle = 'Cold Wind';
    const { result } = renderAddFlow();

    expect(result.current.duplicateItemTitle).toBe('Cold Wind');
  });

  it('hands a confirm with no draft pending to the server add', () => {
    const { result, args } = renderAddFlow();

    act(() => result.current.confirmDuplicate());

    expect(serverAddMock.confirmDuplicate).toHaveBeenCalledTimes(1);
    expect(args.addItemForced).not.toHaveBeenCalled();
  });

  it('dismisses both duplicate questions', () => {
    const { result } = renderAddFlow({
      isDraft: true,
      playlistId: null,
      addItem: vi.fn(() => ({ duplicate: true })),
    });
    act(() => result.current.handleAdd(SONG));

    act(() => result.current.dismissDuplicate());

    expect(result.current.duplicateItemTitle).toBeNull();
    expect(serverAddMock.dismissDuplicate).toHaveBeenCalledTimes(1);
  });
});
