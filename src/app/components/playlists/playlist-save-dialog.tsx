/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PlaylistDetailResponse, PlaylistItemSourceRef } from '@/lib/types/domain/playlist';

import { PlaylistSaveForm } from './playlist-save-form';

interface PlaylistSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** `null` in create mode until saved. */
  playlistId: string | null;
  /** Read once at mount — remount (e.g. via `key`) to load different values. */
  initialValues: { title: string; isPublic: boolean; coverImages: string[] };
  /** Create mode: sent as `createPlaylistAction` items. */
  pendingItemRefs: PlaylistItemSourceRef[];
  /** Deduped artist image URLs offered by the cover art field. */
  availableArtistImages: string[];
  onSaved: (playlist: PlaylistDetailResponse) => void;
  /** Edit mode only: renders the footer-left "Add songs" button. */
  onAddSongs?: () => void;
}

/**
 * Create/edit dialog for a playlist's title, cover art, and visibility.
 *
 * A thin Dialog wrapper around {@link PlaylistSaveForm} (which owns the RHF form
 * and the create → upload → update chain). The dialog holds Escape/overlay-click
 * close requests while the form's save is in flight — closing mid-save would let
 * a late `markSaved` in the parent clear items the user staged after escaping.
 * The success path closes via the form's `onCancel` (wired to `onOpenChange`),
 * so it is unaffected by this gate. "Add songs" closes the dialog first, then
 * notifies the caller.
 */
export const PlaylistSaveDialog = ({
  open,
  onOpenChange,
  mode,
  playlistId,
  initialValues,
  pendingItemRefs,
  availableArtistImages,
  onSaved,
  onAddSongs,
}: PlaylistSaveDialogProps): ReactElement => {
  const [isSaving, setIsSaving] = useState(false);

  const isEditMode = mode === 'edit';

  // Hold Escape/overlay-click close requests while the save chain is in flight.
  const handleDialogOpenChange = (nextOpen: boolean): void => {
    if (!isSaving) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      {/* The cover-art field makes the form taller than short viewports —
          scroll inside the fixed dialog so the footer stays reachable
          (same pattern as tour-date-form). */}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit playlist' : 'New playlist'}</DialogTitle>
          <DialogDescription>
            Name your playlist, pick cover art, and choose who can see it.
          </DialogDescription>
        </DialogHeader>
        <PlaylistSaveForm
          variant="dialog"
          mode={mode}
          playlistId={playlistId}
          initialValues={initialValues}
          pendingItemRefs={pendingItemRefs}
          availableArtistImages={availableArtistImages}
          onSaved={onSaved}
          onSavingChange={setIsSaving}
          onCancel={() => onOpenChange(false)}
          onAddSongs={onAddSongs}
        />
      </DialogContent>
    </Dialog>
  );
};
