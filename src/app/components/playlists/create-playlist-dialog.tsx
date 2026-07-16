/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { type ReactElement } from 'react';

import { useRouter } from 'next/navigation';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PlaylistSearchItem } from '@/lib/types/domain/playlist';

import { PlaylistCreator } from './playlist-creator';

interface CreatePlaylistDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Fired on dismissal (and after a deep-link jump closes the dialog). */
  onOpenChange: (open: boolean) => void;
  /** Seeds the embedded creator's fresh draft with this item. */
  item: PlaylistSearchItem;
}

/**
 * Wraps {@link PlaylistCreator} in a dialog, pre-seeded with `item`, so the
 * player can spin up a brand-new playlist without leaving the current view.
 * "Open in My Playlists" closes the dialog and deep-links to the saved
 * playlist's edit view.
 */
export const CreatePlaylistDialog = ({
  open,
  onOpenChange,
  item,
}: CreatePlaylistDialogProps): ReactElement => {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create playlist</DialogTitle>
        </DialogHeader>
        <PlaylistCreator
          editPlaylistId={null}
          onEditHandled={() => {}}
          variant="embedded"
          seedItem={item}
          onOpenInMyPlaylists={(id) => {
            onOpenChange(false);
            router.push(`/playlists?edit=${id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
