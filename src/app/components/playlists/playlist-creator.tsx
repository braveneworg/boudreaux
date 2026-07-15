/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useImperativeHandle, useRef, type ReactElement, type Ref } from 'react';

import { Pencil } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePlaylistQuery } from '@/hooks/use-playlist-query';
import type { PlaylistDetailResponse, PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { PlaylistCreatorItemList } from './playlist-creator-item-list';
import { PlaylistCreatorSearch, type PlaylistCreatorSearchHandle } from './playlist-creator-search';
import { PlaylistDuplicateConfirmDialog } from './playlist-duplicate-confirm-dialog';
import { PlaylistSaveDialog } from './playlist-save-dialog';
import { useCreatorAddFlow } from './use-creator-add-flow';
import { useCreatorEditParam } from './use-creator-edit-param';
import { useCreatorServerItems } from './use-creator-server-items';
import {
  draftItemFromSearchItem,
  toSourceRef,
  usePlaylistCreator,
  type CreatorState,
  type DraftItem,
} from './use-playlist-creator';

import type { PlaylistCreatorItemData } from './playlist-creator-item';

/** Imperative surface exposed by {@link PlaylistCreator} via `ref`. */
export interface PlaylistCreatorHandle {
  /** Focuses the creator's media-search input. */
  focusSearch: () => void;
}

interface PlaylistCreatorProps {
  /** Playlist id an outside pane asked to edit, or null when idle. */
  editPlaylistId: string | null;
  /** Ack fired once the edit request is consumed (or failed with a toast). */
  onEditHandled: () => void;
  /** React 19 ref-as-prop exposing {@link PlaylistCreatorHandle}. */
  ref?: Ref<PlaylistCreatorHandle>;
}

const draftToListItem = ({
  localId,
  itemType,
  title,
  artistName,
  duration,
  coverArt,
}: DraftItem): PlaylistCreatorItemData => ({
  id: localId,
  title,
  artistName,
  duration,
  coverArt,
  isVideo: itemType === 'video',
});

/** Deduped non-null cover arts of the current items, order-preserving. */
const dedupeCoverArts = (items: PlaylistCreatorItemData[]): string[] => [
  ...new Set(items.flatMap(({ coverArt }) => (coverArt ? [coverArt] : []))),
];

/**
 * The save dialog remounts on every open (it reads `initialValues` once), and
 * an editing-phase dialog additionally waits for the detail so those initial
 * values exist.
 */
const canShowSaveDialog = (
  state: CreatorState,
  detail: PlaylistDetailResponse | undefined
): boolean => state.saveDialogOpen && (state.phase !== 'editing' || detail !== undefined);

const saveDialogInitialValues = (
  phase: CreatorState['phase'],
  detail: PlaylistDetailResponse | undefined
): { title: string; isPublic: boolean; coverImages: string[] } =>
  phase === 'editing' && detail
    ? { title: detail.title, isPublic: detail.isPublic, coverImages: detail.coverImages }
    : { title: '', isPublic: false, coverImages: [] };

interface CreatorHeadingProps {
  isDraft: boolean;
  detail: PlaylistDetailResponse | undefined;
  hasPendingItems: boolean;
  onSave: () => void;
  onEdit: () => void;
}

/**
 * Draft: "New playlist" with an "Unsaved" badge and a "Save playlist" button
 * while items are staged. Saved/editing: the playlist title with an edit
 * pencil.
 */
const CreatorHeading = ({
  isDraft,
  detail,
  hasPendingItems,
  onSave,
  onEdit,
}: CreatorHeadingProps): ReactElement =>
  isDraft ? (
    <div className="flex items-center gap-3">
      <h2 className="text-lg font-semibold">New playlist</h2>
      {hasPendingItems && <Badge variant="secondary">Unsaved</Badge>}
      {hasPendingItems && (
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onSave}>
          Save playlist
        </Button>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <h2 className="truncate text-lg font-semibold">{detail?.title}</h2>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label="Edit playlist"
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </Button>
    </div>
  );

/**
 * Left-pane playlist creator: media search on top of the drag-sortable item
 * list, driven by the {@link usePlaylistCreator} machine. Draft items stage
 * locally (the first add auto-opens the save dialog once per draft session);
 * once saved, items live on the server and reorder/remove/add go through
 * their mutations. An external `editPlaylistId` request loads that playlist
 * into the editing dialog after its detail is cached.
 */
export const PlaylistCreator = ({
  editPlaylistId,
  onEditHandled,
  ref,
}: PlaylistCreatorProps): ReactElement => {
  const {
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
  } = usePlaylistCreator();
  const searchRef = useRef<PlaylistCreatorSearchHandle>(null);
  useImperativeHandle(ref, () => ({ focusSearch: () => searchRef.current?.focus() }), []);

  const isDraft = state.phase === 'draft';
  const { isPending, data: detail } = usePlaylistQuery(editPlaylistId ?? state.playlistId, {
    enabled: editPlaylistId !== null || !isDraft,
  });
  useCreatorEditParam({ editPlaylistId, isPending, detail, loadForEdit, onEditHandled });

  const addFlow = useCreatorAddFlow({
    isDraft,
    playlistId: state.playlistId,
    addItem,
    addItemForced,
  });
  const serverItems = useCreatorServerItems({ playlistId: state.playlistId, detail });
  const listItems = isDraft
    ? state.pendingItems.map((item) => draftToListItem(item))
    : serverItems.items;
  const listHandlers = isDraft
    ? { onReorder: reorderDraftItems, onRemove: removeDraftItem }
    : { onReorder: serverItems.reorderItems, onRemove: serverItems.removeItem };

  const handleSaved = (playlist: PlaylistDetailResponse): void => {
    if (state.phase === 'editing') finishEditing();
    else markSaved(playlist.id);
  };
  const handleAddSongs = (): void => {
    // Radix restores focus to the dialog trigger on close — defer past that.
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const handleNewPlaylist = (item: PlaylistSearchItem): void =>
    resetToDraft([draftItemFromSearchItem(item)]);
  const handleEditCurrent = (): void => {
    if (state.playlistId) loadForEdit(state.playlistId);
  };
  const handleSaveDialogOpenChange = (open: boolean): void => {
    if (!open) closeSaveDialog();
  };
  const handleDuplicateOpenChange = (open: boolean): void => {
    if (!open) addFlow.dismissDuplicate();
  };

  return (
    <section aria-label="Playlist creator" className="flex flex-col gap-4">
      <CreatorHeading
        isDraft={isDraft}
        detail={detail}
        hasPendingItems={state.pendingItems.length > 0}
        onSave={openSaveDialog}
        onEdit={handleEditCurrent}
      />
      <PlaylistCreatorSearch
        ref={searchRef}
        onAdd={addFlow.handleAdd}
        onNewPlaylist={handleNewPlaylist}
      />
      <PlaylistCreatorItemList
        items={listItems}
        onReorder={listHandlers.onReorder}
        onRemove={listHandlers.onRemove}
      />
      {canShowSaveDialog(state, detail) && (
        <PlaylistSaveDialog
          open
          onOpenChange={handleSaveDialogOpenChange}
          mode={state.phase === 'editing' ? 'edit' : 'create'}
          playlistId={state.playlistId}
          initialValues={saveDialogInitialValues(state.phase, detail)}
          pendingItemRefs={state.pendingItems.map(toSourceRef)}
          availableArtistImages={dedupeCoverArts(listItems)}
          onSaved={handleSaved}
          onAddSongs={handleAddSongs}
        />
      )}
      <PlaylistDuplicateConfirmDialog
        open={addFlow.duplicateItemTitle !== null}
        onOpenChange={handleDuplicateOpenChange}
        itemTitle={addFlow.duplicateItemTitle ?? ''}
        onConfirm={addFlow.confirmDuplicate}
      />
    </section>
  );
};
