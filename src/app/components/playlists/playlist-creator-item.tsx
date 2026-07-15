/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils/format-duration';

/**
 * Phase-agnostic display shape of one creator list row — draft items map
 * `localId` into `id`, saved/editing items use the server item id.
 */
export interface PlaylistCreatorItemData {
  id: string;
  title: string;
  artistName: string | null;
  duration: number | null;
  coverArt: string | null;
  isVideo: boolean;
}

interface PlaylistCreatorItemProps extends PlaylistCreatorItemData {
  /** Fired after the user confirms the "Remove from playlist?" dialog. */
  onRemove: () => void;
}

/** 40px square cover thumb with a muted fallback block when the item has no art. */
const ItemThumb = ({ coverArt }: { coverArt: string | null }): ReactElement =>
  coverArt ? (
    <Image
      src={coverArt}
      alt=""
      width={40}
      height={40}
      sizes="40px"
      className="size-10 shrink-0 object-cover"
    />
  ) : (
    <div aria-hidden="true" className="size-10 shrink-0 bg-zinc-200" />
  );

/**
 * One drag-sortable row in the playlist creator's item list. The `GripVertical`
 * handle carries the sortable listeners (drag activates from the handle only);
 * the `Trash2` button opens a confirm dialog before firing `onRemove`.
 */
export const PlaylistCreatorItem = ({
  id,
  title,
  artistName,
  duration,
  coverArt,
  isVideo,
  onRemove,
}: PlaylistCreatorItemProps): ReactElement => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center gap-3 border-b py-2', isDragging && 'opacity-70')}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${title}`}
        className="shrink-0 cursor-grab touch-none text-zinc-400 hover:text-zinc-600"
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <ItemThumb coverArt={coverArt} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {isVideo && <Badge variant="secondary">video</Badge>}
        </span>
        {artistName && <span className="truncate text-xs text-zinc-500">{artistName}</span>}
      </div>
      <span className="shrink-0 text-xs text-zinc-500">{formatDuration(duration)}</span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Remove ${title}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${title}" will be removed from this playlist.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
};
