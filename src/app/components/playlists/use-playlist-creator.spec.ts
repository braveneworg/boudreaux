// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { draftItemFromSearchItem, toSourceRef, usePlaylistCreator } from './use-playlist-creator';

import type { DraftItem, UsePlaylistCreatorResult } from './use-playlist-creator';

/** `result` box handed back by `renderHook` — enough surface for helpers. */
interface CreatorHook {
  current: UsePlaylistCreatorResult;
}

let uuidCounter = 0;
const randomUUID = vi.fn(
  (): `${string}-${string}-${string}-${string}-${string}` =>
    `00000000-0000-4000-8000-${String((uuidCounter += 1)).padStart(12, '0')}`
);

beforeEach(() => {
  uuidCounter = 0;
  globalThis.crypto.randomUUID = randomUUID;
});

/** Deterministic track draft item; `n` seeds all ids and display fields. */
const makeTrack = (n: number, overrides: Partial<DraftItem> = {}): DraftItem => ({
  localId: `local-track-${n}`,
  itemType: 'track',
  trackFileId: `tf-${n}`,
  releaseId: `rel-${n}`,
  title: `Track ${n}`,
  artistName: 'Ceschi',
  duration: 180,
  coverArt: null,
  ...overrides,
});

/** Deterministic video draft item; `n` seeds the id and title. */
const makeVideo = (n: number, overrides: Partial<DraftItem> = {}): DraftItem => ({
  localId: `local-video-${n}`,
  itemType: 'video',
  videoId: `v-${n}`,
  title: `Video ${n}`,
  artistName: null,
  duration: null,
  coverArt: null,
  ...overrides,
});

/** Calls `addItem` inside `act` and returns its duplicate outcome. */
const addItemIn = (result: CreatorHook, item: DraftItem): { duplicate: boolean } => {
  let outcome: { duplicate: boolean } | undefined;
  act(() => {
    outcome = result.current.addItem(item);
  });
  if (!outcome) throw new Error('addItem was not invoked');
  return outcome;
};

/** Drives a freshly rendered hook into the `saved` phase with one committed add. */
const enterSavedPhase = (result: CreatorHook, playlistId = 'pl-saved'): void => {
  addItemIn(result, makeTrack(99));
  act(() => result.current.markSaved(playlistId));
};

/** Seeds three draft items (two tracks + one video) and returns them in order. */
const seedThree = (result: CreatorHook): [DraftItem, DraftItem, DraftItem] => {
  const items: [DraftItem, DraftItem, DraftItem] = [makeTrack(1), makeTrack(2), makeVideo(3)];
  items.forEach((item) => addItemIn(result, item));
  return items;
};

const trackSearchItem: PlaylistSearchItem = {
  key: 'track:tf-9',
  itemType: 'track',
  title: 'Long Nights',
  artistName: 'Ceschi',
  coverArt: 'https://cdn.example.com/cover-9.jpg',
  duration: 214,
  source: { trackFileId: 'tf-9', releaseId: 'rel-9' },
};

const videoSearchItem: PlaylistSearchItem = {
  key: 'video:v-3',
  itemType: 'video',
  title: 'Live at the Vera Project',
  artistName: null,
  coverArt: null,
  duration: null,
  source: { videoId: 'v-3' },
  context: 'Sad Panda Circus',
};

describe('draftItemFromSearchItem', () => {
  it('maps a track search item onto a draft item', () => {
    expect(draftItemFromSearchItem(trackSearchItem)).toMatchObject({
      localId: expect.any(String),
      itemType: 'track',
      trackFileId: 'tf-9',
      releaseId: 'rel-9',
      title: 'Long Nights',
      artistName: 'Ceschi',
      duration: 214,
      coverArt: 'https://cdn.example.com/cover-9.jpg',
    });
  });

  it('maps a video search item onto a draft item', () => {
    expect(draftItemFromSearchItem(videoSearchItem)).toMatchObject({
      localId: expect.any(String),
      itemType: 'video',
      videoId: 'v-3',
      title: 'Live at the Vera Project',
      artistName: null,
      duration: null,
      coverArt: null,
    });
  });

  it('does not give a video draft item track source ids', () => {
    expect(draftItemFromSearchItem(videoSearchItem).trackFileId).toBeUndefined();
  });

  it('assigns a fresh localId per conversion', () => {
    const first = draftItemFromSearchItem(trackSearchItem);
    const second = draftItemFromSearchItem(trackSearchItem);
    expect(second.localId).not.toBe(first.localId);
  });
});

describe('toSourceRef', () => {
  it('maps a track draft item to a track source ref without releaseId', () => {
    expect(toSourceRef(makeTrack(1))).toEqual({ itemType: 'track', trackFileId: 'tf-1' });
  });

  it('maps a video draft item to a video source ref', () => {
    expect(toSourceRef(makeVideo(2))).toEqual({ itemType: 'video', videoId: 'v-2' });
  });
});

describe('usePlaylistCreator', () => {
  it('starts as an empty draft with the dialog closed', () => {
    const { result } = renderHook(usePlaylistCreator);
    expect(result.current.state).toEqual({
      phase: 'draft',
      playlistId: null,
      pendingItems: [],
      saveDialogOpen: false,
      hasOpenedFirstSaveDialog: false,
    });
  });

  describe('adding items in draft', () => {
    it('returns duplicate: false for a new source', () => {
      const { result } = renderHook(usePlaylistCreator);
      expect(addItemIn(result, makeTrack(1))).toEqual({ duplicate: false });
    });

    it('appends the item to pendingItems', () => {
      const { result } = renderHook(usePlaylistCreator);
      const item = makeTrack(1);
      addItemIn(result, item);
      expect(result.current.state.pendingItems).toEqual([item]);
    });

    it('opens the save dialog on the first add', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      expect(result.current.state.saveDialogOpen).toBe(true);
    });

    it('flags the first-save dialog as opened on the first add', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      expect(result.current.state.hasOpenedFirstSaveDialog).toBe(true);
    });

    it('keeps items when the save dialog is cancelled', () => {
      const { result } = renderHook(usePlaylistCreator);
      const item = makeTrack(1);
      addItemIn(result, item);
      act(() => result.current.closeSaveDialog());
      expect(result.current.state.pendingItems).toEqual([item]);
    });

    it('closes the dialog on closeSaveDialog', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.closeSaveDialog());
      expect(result.current.state.saveDialogOpen).toBe(false);
    });

    it('reopens the dialog on openSaveDialog', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.closeSaveDialog());
      act(() => result.current.openSaveDialog());
      expect(result.current.state.saveDialogOpen).toBe(true);
    });

    it('does not reopen the dialog on the second add', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.closeSaveDialog());
      addItemIn(result, makeTrack(2));
      expect(result.current.state.saveDialogOpen).toBe(false);
    });

    it('appends the second item after the first', () => {
      const { result } = renderHook(usePlaylistCreator);
      const [first, second] = [makeTrack(1), makeTrack(2)];
      addItemIn(result, first);
      addItemIn(result, second);
      expect(result.current.state.pendingItems).toEqual([first, second]);
    });

    it('does not reopen the dialog after clearing and refilling the draft', () => {
      const { result } = renderHook(usePlaylistCreator);
      const first = makeTrack(1);
      addItemIn(result, first);
      act(() => result.current.closeSaveDialog());
      act(() => result.current.removeDraftItem(first.localId));
      addItemIn(result, makeTrack(2));
      expect(result.current.state.saveDialogOpen).toBe(false);
    });
  });

  describe('duplicate detection', () => {
    it('reports a duplicate for a matching trackFileId', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      expect(addItemIn(result, makeTrack(2, { trackFileId: 'tf-1' }))).toEqual({
        duplicate: true,
      });
    });

    it('leaves pendingItems unchanged on a duplicate add', () => {
      const { result } = renderHook(usePlaylistCreator);
      const original = makeTrack(1);
      addItemIn(result, original);
      addItemIn(result, makeTrack(2, { trackFileId: 'tf-1' }));
      expect(result.current.state.pendingItems).toEqual([original]);
    });

    it('reports a duplicate for a matching videoId', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeVideo(1));
      expect(addItemIn(result, makeVideo(2, { videoId: 'v-1' }))).toEqual({ duplicate: true });
    });

    it('never treats a shared releaseId as identity', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1, { releaseId: 'rel-shared' }));
      expect(addItemIn(result, makeTrack(2, { releaseId: 'rel-shared' }))).toEqual({
        duplicate: false,
      });
    });

    it('never matches a video against a track', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      expect(addItemIn(result, makeVideo(1))).toEqual({ duplicate: false });
    });

    it('never matches an item that has no source id', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      expect(addItemIn(result, makeVideo(9, { videoId: undefined }))).toEqual({
        duplicate: false,
      });
    });
  });

  describe('forced adds', () => {
    it('appends a confirmed duplicate source', () => {
      const { result } = renderHook(usePlaylistCreator);
      const original = makeTrack(1);
      const confirmed = makeTrack(2, { trackFileId: 'tf-1' });
      addItemIn(result, original);
      act(() => result.current.addItemForced(confirmed));
      expect(result.current.state.pendingItems).toEqual([original, confirmed]);
    });

    it('does not reopen the dialog on a forced add to a non-empty draft', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.closeSaveDialog());
      act(() => result.current.addItemForced(makeTrack(2, { trackFileId: 'tf-1' })));
      expect(result.current.state.saveDialogOpen).toBe(false);
    });

    it('opens the dialog when a forced add is the very first item', () => {
      const { result } = renderHook(usePlaylistCreator);
      act(() => result.current.addItemForced(makeTrack(1)));
      expect(result.current.state.saveDialogOpen).toBe(true);
    });

    it('ignores a forced re-add of an item already in the draft', () => {
      const { result } = renderHook(usePlaylistCreator);
      const item = makeTrack(1);
      addItemIn(result, item);
      act(() => result.current.addItemForced(item));
      expect(result.current.state.pendingItems).toEqual([item]);
    });
  });

  describe('removing draft items', () => {
    it('removes only the matching item', () => {
      const { result } = renderHook(usePlaylistCreator);
      const [first, second] = [makeTrack(1), makeTrack(2)];
      addItemIn(result, first);
      addItemIn(result, second);
      act(() => result.current.removeDraftItem(first.localId));
      expect(result.current.state.pendingItems).toEqual([second]);
    });

    it('ignores an unknown localId', () => {
      const { result } = renderHook(usePlaylistCreator);
      const item = makeTrack(1);
      addItemIn(result, item);
      act(() => result.current.removeDraftItem('local-unknown'));
      expect(result.current.state.pendingItems).toEqual([item]);
    });
  });

  describe('reordering draft items', () => {
    it('reorders pendingItems to the exact requested order', () => {
      const { result } = renderHook(usePlaylistCreator);
      const [a, b, c] = seedThree(result);
      act(() => result.current.reorderDraftItems([c.localId, a.localId, b.localId]));
      expect(result.current.state.pendingItems).toEqual([c, a, b]);
    });

    it('ignores a reorder that is missing an item', () => {
      const { result } = renderHook(usePlaylistCreator);
      const [a, b, c] = seedThree(result);
      act(() => result.current.reorderDraftItems([a.localId, b.localId]));
      expect(result.current.state.pendingItems).toEqual([a, b, c]);
    });

    it('ignores a reorder containing an unknown id', () => {
      const { result } = renderHook(usePlaylistCreator);
      const [a, b, c] = seedThree(result);
      act(() => result.current.reorderDraftItems([a.localId, b.localId, 'local-unknown']));
      expect(result.current.state.pendingItems).toEqual([a, b, c]);
    });

    it('ignores a reorder with duplicated ids', () => {
      const { result } = renderHook(usePlaylistCreator);
      const [a, b, c] = seedThree(result);
      act(() => result.current.reorderDraftItems([a.localId, b.localId, b.localId]));
      expect(result.current.state.pendingItems).toEqual([a, b, c]);
    });
  });

  describe('markSaved', () => {
    it('moves the draft to saved with the persisted id', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.markSaved('pl-1'));
      expect(result.current.state).toMatchObject({ phase: 'saved', playlistId: 'pl-1' });
    });

    it('clears pendingItems', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.markSaved('pl-1'));
      expect(result.current.state.pendingItems).toEqual([]);
    });

    it('closes the save dialog', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.markSaved('pl-1'));
      expect(result.current.state.saveDialogOpen).toBe(false);
    });

    it('ignores markSaved outside the draft phase', () => {
      const { result } = renderHook(usePlaylistCreator);
      act(() => result.current.loadForEdit('pl-edit'));
      const before = result.current.state;
      act(() => result.current.markSaved('pl-other'));
      expect(result.current.state).toEqual(before);
    });
  });

  describe('loadForEdit', () => {
    it('enters editing with the save dialog open', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      act(() => result.current.loadForEdit('pl-7'));
      expect(result.current.state).toMatchObject({
        phase: 'editing',
        playlistId: 'pl-7',
        saveDialogOpen: true,
      });
    });

    it('clears any pending draft items', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      act(() => result.current.loadForEdit('pl-7'));
      expect(result.current.state.pendingItems).toEqual([]);
    });
  });

  describe('finishEditing', () => {
    it('returns to saved with the dialog closed', () => {
      const { result } = renderHook(usePlaylistCreator);
      act(() => result.current.loadForEdit('pl-7'));
      act(() => result.current.finishEditing());
      expect(result.current.state).toMatchObject({
        phase: 'saved',
        playlistId: 'pl-7',
        saveDialogOpen: false,
      });
    });

    it('ignores finishEditing in a draft', () => {
      const { result } = renderHook(usePlaylistCreator);
      addItemIn(result, makeTrack(1));
      const before = result.current.state;
      act(() => result.current.finishEditing());
      expect(result.current.state).toEqual(before);
    });
  });

  describe('resetToDraft', () => {
    it('starts a fresh draft seeded with the given items', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      const [a, b] = [makeTrack(1), makeVideo(2)];
      act(() => result.current.resetToDraft([a, b]));
      expect(result.current.state).toMatchObject({
        phase: 'draft',
        playlistId: null,
        pendingItems: [a, b],
      });
    });

    it('opens the save dialog when seeded with items', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      act(() => result.current.resetToDraft([makeTrack(1)]));
      expect(result.current.state.saveDialogOpen).toBe(true);
    });

    it('marks the first-save dialog as opened when seeded with items', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      act(() => result.current.resetToDraft([makeTrack(1)]));
      expect(result.current.state.hasOpenedFirstSaveDialog).toBe(true);
    });

    it('keeps the dialog closed for an empty draft', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      act(() => result.current.resetToDraft([]));
      expect(result.current.state.saveDialogOpen).toBe(false);
    });

    it('clears the first-save flag for an empty draft', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      act(() => result.current.resetToDraft([]));
      expect(result.current.state.hasOpenedFirstSaveDialog).toBe(false);
    });

    it('re-arms the first-save auto-open for the next draft session', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      act(() => result.current.resetToDraft([]));
      addItemIn(result, makeTrack(1));
      expect(result.current.state.saveDialogOpen).toBe(true);
    });
  });

  describe('non-draft phases', () => {
    it('addItem returns duplicate: false in the saved phase', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      expect(addItemIn(result, makeTrack(1))).toEqual({ duplicate: false });
    });

    it('addItem leaves saved-phase state unchanged', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      const before = result.current.state;
      addItemIn(result, makeTrack(1));
      expect(result.current.state).toEqual(before);
    });

    it('addItemForced leaves saved-phase state unchanged', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      const before = result.current.state;
      act(() => result.current.addItemForced(makeTrack(1)));
      expect(result.current.state).toEqual(before);
    });

    it('removeDraftItem leaves editing-phase state unchanged', () => {
      const { result } = renderHook(usePlaylistCreator);
      act(() => result.current.loadForEdit('pl-7'));
      const before = result.current.state;
      act(() => result.current.removeDraftItem('local-track-1'));
      expect(result.current.state).toEqual(before);
    });

    it('reorderDraftItems leaves saved-phase state unchanged', () => {
      const { result } = renderHook(usePlaylistCreator);
      enterSavedPhase(result);
      const before = result.current.state;
      act(() => result.current.reorderDraftItems(['local-track-1']));
      expect(result.current.state).toEqual(before);
    });
  });

  it('keeps dispatch-only callbacks stable across renders', () => {
    const { result } = renderHook(usePlaylistCreator);
    const initialForced = result.current.addItemForced;
    addItemIn(result, makeTrack(1));
    expect(result.current.addItemForced).toBe(initialForced);
  });
});
