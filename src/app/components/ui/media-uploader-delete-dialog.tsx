/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { MediaIcon } from './media-icon';
import { formatFileSize } from './media-uploader-utils';

import type { MediaItem } from './media-uploader-types';

interface MediaUploaderDeleteDialogProps {
  itemToDelete: MediaItem | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation dialog shown before removing a media file, previewing the file's
 * icon, name, and size.
 */
export const MediaUploaderDeleteDialog = ({
  itemToDelete,
  onCancel,
  onConfirm,
}: MediaUploaderDeleteDialogProps): React.JSX.Element => (
  <Dialog open={!!itemToDelete} onOpenChange={onCancel}>
    <DialogContent className="sm:max-w-md">
      <DialogTitle>Delete File</DialogTitle>
      <p className="text-sm text-zinc-950">
        Are you sure you want to delete this file? This action cannot be undone.
      </p>
      {itemToDelete && (
        <div className="bg-muted/50 my-4 flex items-center gap-3 border p-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center',
              itemToDelete.mediaType === 'audio' ? 'bg-primary/10' : 'bg-purple-500/10'
            )}
          >
            <MediaIcon
              mediaType={itemToDelete.mediaType}
              className={cn(
                'h-5 w-5',
                itemToDelete.mediaType === 'audio' ? 'text-primary' : 'text-purple-500'
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{itemToDelete.fileName}</p>
            <p className="text-xs text-zinc-950">{formatFileSize(itemToDelete.fileSize)}</p>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
