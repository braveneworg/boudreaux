/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';

interface PlaylistDuplicateConfirmDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Controlled open-state setter — Cancel, Escape, and "Add again" close through it. */
  onOpenChange: (o: boolean) => void;
  /** Title of the track/video that is already in the playlist. */
  itemTitle: string;
  /** Fired when the user chooses to add the duplicate anyway. */
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown when the user adds an item that is already in the
 * playlist. "Add again" fires `onConfirm` and closes via the AlertDialogAction
 * default close behavior; Cancel just closes.
 */
export const PlaylistDuplicateConfirmDialog = ({
  open,
  onOpenChange,
  itemTitle,
  onConfirm,
}: PlaylistDuplicateConfirmDialogProps): ReactElement => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Already in playlist</AlertDialogTitle>
        <AlertDialogDescription>
          {`"${itemTitle}" is already in this playlist. Add it again?`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Add again</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
