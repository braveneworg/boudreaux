/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useReducer } from 'react';

import type {
  PlaylistItemSourceRef,
  PlaylistItemType,
  PlaylistSearchItem,
} from '@/lib/types/domain/playlist';

/**
 * A locally staged item in an unsaved (draft) playlist. `localId` is a
 * client-only identity used for list keys, removal, and drag reordering —
 * it never reaches the server.
 */
export interface DraftItem {
  localId: string;
  itemType: PlaylistItemType;
  trackFileId?: string;
  videoId?: string;
  releaseId?: string;
  title: string;
  artistName: string | null;
  duration: number | null;
  coverArt: string | null;
}

/**
 * Creator lifecycle state. `pendingItems` is only meaningful in the `draft`
 * phase — once saved, server state owns the items. `hasOpenedFirstSaveDialog`
 * remembers that the first-save dialog already auto-opened for the current
 * draft session (it resets with each new draft, not globally).
 */
export interface CreatorState {
  phase: 'draft' | 'saved' | 'editing';
  playlistId: string | null;
  pendingItems: DraftItem[];
  saveDialogOpen: boolean;
  hasOpenedFirstSaveDialog: boolean;
}

/** Return surface of {@link usePlaylistCreator}. */
export interface UsePlaylistCreatorResult {
  state: CreatorState;
  /**
   * Draft only: duplicate-checks by source id (`trackFileId`, else `videoId`;
   * `releaseId` is never identity) and appends unless duplicate — the caller
   * confirms and then calls {@link addItemForced}. In non-draft phases this is
   * a no-op that returns `{ duplicate: false }`.
   */
  addItem: (item: DraftItem) => { duplicate: boolean };
  /** Draft only: appends even when the source id already exists in the draft. */
  addItemForced: (item: DraftItem) => void;
  /** Draft only: removes the item with the given `localId`. */
  removeDraftItem: (localId: string) => void;
  /**
   * Draft only: reorders `pendingItems` to exactly `orderedLocalIds`; a no-op
   * unless that id set exactly matches the current items (dnd can race removal).
   */
  reorderDraftItems: (orderedLocalIds: string[]) => void;
  openSaveDialog: () => void;
  closeSaveDialog: () => void;
  /** draft → saved: records the persisted id, clears items, closes the dialog. */
  markSaved: (playlistId: string) => void;
  /** any → editing: tracks the given playlist with the dialog open. */
  loadForEdit: (playlistId: string) => void;
  /** editing → saved with the dialog closed. */
  finishEditing: () => void;
  /** any → a fresh draft seeded with `items`; opens the dialog when non-empty. */
  resetToDraft: (items: DraftItem[]) => void;
}

type DraftItemAction =
  | { type: 'ADD_ITEM'; item: DraftItem }
  | { type: 'ADD_ITEM_FORCED'; item: DraftItem }
  | { type: 'REMOVE_DRAFT_ITEM'; localId: string }
  | { type: 'REORDER_DRAFT_ITEMS'; orderedLocalIds: string[] };

type LifecycleAction =
  | { type: 'OPEN_SAVE_DIALOG' }
  | { type: 'CLOSE_SAVE_DIALOG' }
  | { type: 'MARK_SAVED'; playlistId: string }
  | { type: 'LOAD_FOR_EDIT'; playlistId: string }
  | { type: 'FINISH_EDITING' }
  | { type: 'RESET_TO_DRAFT'; items: DraftItem[] };

type CreatorAction = DraftItemAction | LifecycleAction;

const INITIAL_CREATOR_STATE: CreatorState = {
  phase: 'draft',
  playlistId: null,
  pendingItems: [],
  saveDialogOpen: false,
  hasOpenedFirstSaveDialog: false,
};

/** Maps a draft item back to the source reference the server item actions accept. */
export const toSourceRef = ({
  itemType,
  trackFileId,
  videoId,
}: DraftItem): PlaylistItemSourceRef =>
  itemType === 'track' ? { itemType, trackFileId } : { itemType, videoId };

/** Converts a media-search result into a draft item with a fresh client-only id. */
export const draftItemFromSearchItem = ({
  itemType,
  title,
  artistName,
  duration,
  coverArt,
  source,
}: PlaylistSearchItem): DraftItem => {
  const base = { localId: crypto.randomUUID(), itemType, title, artistName, duration, coverArt };
  return 'trackFileId' in source
    ? { ...base, trackFileId: source.trackFileId, releaseId: source.releaseId }
    : { ...base, videoId: source.videoId };
};

/**
 * Duplicate identity: `trackFileId` when the incoming item has one, else
 * `videoId`. `releaseId` is never identity; items with no source id never match.
 */
const hasDuplicateSource = (items: DraftItem[], incoming: DraftItem): boolean => {
  if (incoming.trackFileId !== undefined) {
    return items.some(({ trackFileId }) => trackFileId === incoming.trackFileId);
  }
  if (incoming.videoId !== undefined) {
    return items.some(({ videoId }) => videoId === incoming.videoId);
  }
  return false;
};

/**
 * Appends `item` to the draft. The first append of a draft session (no items
 * yet and the first-save dialog never auto-opened) also opens the save dialog.
 * An item whose `localId` is already present is ignored — `localId` is the
 * client identity for removal/reorder, so it must stay unique.
 */
const appendDraftItem = (state: CreatorState, item: DraftItem): CreatorState => {
  if (state.pendingItems.some(({ localId }) => localId === item.localId)) return state;
  const opensFirstSaveDialog = state.pendingItems.length === 0 && !state.hasOpenedFirstSaveDialog;
  return {
    ...state,
    pendingItems: [...state.pendingItems, item],
    saveDialogOpen: state.saveDialogOpen || opensFirstSaveDialog,
    hasOpenedFirstSaveDialog: state.hasOpenedFirstSaveDialog || opensFirstSaveDialog,
  };
};

/** Applies `orderedLocalIds`; a no-op unless it is exactly the current id set. */
const applyReorder = (state: CreatorState, orderedLocalIds: string[]): CreatorState => {
  const itemsByLocalId = new Map(
    state.pendingItems.map((item): [string, DraftItem] => [item.localId, item])
  );
  const uniqueIds = new Set(orderedLocalIds);
  const isExactIdSet =
    uniqueIds.size === orderedLocalIds.length &&
    uniqueIds.size === itemsByLocalId.size &&
    orderedLocalIds.every((localId) => itemsByLocalId.has(localId));
  if (!isExactIdSet) return state;
  return {
    ...state,
    pendingItems: orderedLocalIds.flatMap((localId) => {
      const item = itemsByLocalId.get(localId);
      return item ? [item] : [];
    }),
  };
};

/** Item-level draft ops — all gated to the `draft` phase (no-ops elsewhere). */
const reduceDraftItemAction = (state: CreatorState, action: DraftItemAction): CreatorState => {
  if (state.phase !== 'draft') return state;
  switch (action.type) {
    case 'ADD_ITEM':
      return hasDuplicateSource(state.pendingItems, action.item)
        ? state
        : appendDraftItem(state, action.item);
    case 'ADD_ITEM_FORCED':
      return appendDraftItem(state, action.item);
    case 'REMOVE_DRAFT_ITEM':
      return {
        ...state,
        pendingItems: state.pendingItems.filter(({ localId }) => localId !== action.localId),
      };
    case 'REORDER_DRAFT_ITEMS':
      return applyReorder(state, action.orderedLocalIds);
  }
};

/** draft → saved: server state owns items from here; the dialog closed on save. */
const toSavedState = (state: CreatorState, playlistId: string): CreatorState => ({
  ...state,
  phase: 'saved',
  playlistId,
  pendingItems: [],
  saveDialogOpen: false,
});

/** Fresh draft session seeded with `items`; a non-empty seed opens the dialog. */
const toDraftState = (items: DraftItem[]): CreatorState => {
  const opensDialog = items.length > 0;
  return {
    phase: 'draft',
    playlistId: null,
    pendingItems: items,
    saveDialogOpen: opensDialog,
    hasOpenedFirstSaveDialog: opensDialog,
  };
};

/** Dialog + phase transitions; sourced-phase arrows are enforced per case. */
const reduceLifecycleAction = (state: CreatorState, action: LifecycleAction): CreatorState => {
  switch (action.type) {
    case 'OPEN_SAVE_DIALOG':
      return { ...state, saveDialogOpen: true };
    case 'CLOSE_SAVE_DIALOG':
      return { ...state, saveDialogOpen: false };
    case 'MARK_SAVED':
      return state.phase === 'draft' ? toSavedState(state, action.playlistId) : state;
    case 'LOAD_FOR_EDIT':
      return {
        ...state,
        phase: 'editing',
        playlistId: action.playlistId,
        pendingItems: [],
        saveDialogOpen: true,
      };
    case 'FINISH_EDITING':
      return state.phase === 'editing'
        ? { ...state, phase: 'saved', saveDialogOpen: false }
        : state;
    case 'RESET_TO_DRAFT':
      return toDraftState(action.items);
  }
};

const isDraftItemAction = (action: CreatorAction): action is DraftItemAction =>
  action.type === 'ADD_ITEM' ||
  action.type === 'ADD_ITEM_FORCED' ||
  action.type === 'REMOVE_DRAFT_ITEM' ||
  action.type === 'REORDER_DRAFT_ITEMS';

const creatorReducer = (state: CreatorState, action: CreatorAction): CreatorState =>
  isDraftItemAction(action)
    ? reduceDraftItemAction(state, action)
    : reduceLifecycleAction(state, action);

/**
 * Pure client state machine for the playlist creator's draft/saved/editing
 * lifecycle. It performs no server calls: in `draft` it stages items locally
 * (dup-checked by source id) and auto-opens the save dialog on the first add
 * of a session; in `saved`/`editing` the item ops are no-ops because server
 * mutations own the items — this machine only tracks phase, dialog, and id.
 * The duplicate check in `addItem` reads the current render's state, and the
 * reducer re-checks phase, duplicates, and `localId` collisions so racing or
 * miscalled dispatches can never corrupt the draft.
 */
export const usePlaylistCreator = (): UsePlaylistCreatorResult => {
  const [state, dispatch] = useReducer(creatorReducer, INITIAL_CREATOR_STATE);

  const addItem = (item: DraftItem): { duplicate: boolean } => {
    if (state.phase !== 'draft') return { duplicate: false };
    if (hasDuplicateSource(state.pendingItems, item)) return { duplicate: true };
    dispatch({ type: 'ADD_ITEM', item });
    return { duplicate: false };
  };

  const addItemForced = useCallback(
    (item: DraftItem): void => dispatch({ type: 'ADD_ITEM_FORCED', item }),
    []
  );
  const removeDraftItem = useCallback(
    (localId: string): void => dispatch({ type: 'REMOVE_DRAFT_ITEM', localId }),
    []
  );
  const reorderDraftItems = useCallback(
    (orderedLocalIds: string[]): void => dispatch({ type: 'REORDER_DRAFT_ITEMS', orderedLocalIds }),
    []
  );
  const openSaveDialog = useCallback((): void => dispatch({ type: 'OPEN_SAVE_DIALOG' }), []);
  const closeSaveDialog = useCallback((): void => dispatch({ type: 'CLOSE_SAVE_DIALOG' }), []);
  const markSaved = useCallback(
    (playlistId: string): void => dispatch({ type: 'MARK_SAVED', playlistId }),
    []
  );
  const loadForEdit = useCallback(
    (playlistId: string): void => dispatch({ type: 'LOAD_FOR_EDIT', playlistId }),
    []
  );
  const finishEditing = useCallback((): void => dispatch({ type: 'FINISH_EDITING' }), []);
  const resetToDraft = useCallback(
    (items: DraftItem[]): void => dispatch({ type: 'RESET_TO_DRAFT', items }),
    []
  );

  return {
    state,
    addItem,
    addItemForced,
    removeDraftItem,
    reorderDraftItems,
    openSaveDialog,
    closeSaveDialog,
    markSaved,
    loadForEdit,
    finishEditing,
    resetToDraft,
  };
};
