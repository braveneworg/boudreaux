/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import { Pencil, Play, Share2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { PlaylistListRow } from '@/lib/types/domain/playlist';

interface PlaylistRowActionsProps {
  /** The playlist the actions operate on (names the delete confirm). */
  row: PlaylistListRow;
  /** Fired by the pencil button. */
  onEdit: () => void;
  /** Fired by the play button. */
  onPlay: () => void;
  /** Fired by the share button. */
  onShare: () => void;
  /** Fired only after the user confirms the delete dialog. */
  onDelete: () => void;
}

interface ActionButtonProps {
  label: string;
  onAction: () => void;
  children: ReactElement;
}

/** One ghost icon button in the row's action cluster. */
const ActionButton = ({ label, onAction, children }: ActionButtonProps): ReactElement => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="size-8 shrink-0"
    aria-label={label}
    onClick={onAction}
  >
    {children}
  </Button>
);

/**
 * Per-row action cluster for a My Playlists row: play, share, and edit
 * delegate straight to their callbacks (PR1 wires placeholder toasts; PR2
 * swaps in the share popover and player dialog without touching this API),
 * while the trash button gates `onDelete` behind an AlertDialog confirm.
 */
export const PlaylistRowActions = ({
  row,
  onEdit,
  onPlay,
  onShare,
  onDelete,
}: PlaylistRowActionsProps): ReactElement => (
  <div className="flex shrink-0 items-center gap-1">
    <ActionButton label="Play playlist" onAction={onPlay}>
      <Play aria-hidden="true" />
    </ActionButton>
    <ActionButton label="Share playlist" onAction={onShare}>
      <Share2 aria-hidden="true" />
    </ActionButton>
    <ActionButton label="Edit playlist" onAction={onEdit}>
      <Pencil aria-hidden="true" />
    </ActionButton>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Delete playlist"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete "${row.title}"?`}</AlertDialogTitle>
          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
