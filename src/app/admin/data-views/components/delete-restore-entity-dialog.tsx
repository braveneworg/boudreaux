/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';

interface DeleteRestoreEntityDialogProps {
  /** When true the dialog restores a soft-deleted row; otherwise it deletes. */
  showRestore: boolean;
  /** Display name shown in the confirmation copy. */
  displayName: string;
  /** Confirms the delete or restore. */
  onConfirm: () => void;
}

/**
 * Delete/Restore button + confirmation dialog for a single entity. The verb flips to
 * "restore" for soft-deleted rows that have a restore handler wired.
 */
export const DeleteRestoreEntityDialog = ({
  showRestore,
  displayName,
  onConfirm,
}: DeleteRestoreEntityDialogProps): ReactElement => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant={showRestore ? 'secondary' : 'destructive'}>
        {showRestore ? (
          <ArchiveRestoreIcon className="mr-0 size-4" />
        ) : (
          <Trash2Icon className="mr-0 size-4" />
        )}
        {showRestore ? 'Restore' : 'Delete'}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <section>
        <DialogHeader>
          <DialogTitle asChild>
            <h1 className="text-3xl!">{showRestore ? 'Confirm Restore' : 'Confirm Delete'}</h1>
          </DialogTitle>
        </DialogHeader>
        <p className="mt-1 mb-4">
          Are you sure you want to {showRestore ? 'restore' : 'delete'} <b>{displayName}</b>?
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant={showRestore ? 'default' : 'destructive'} onClick={onConfirm}>
              Confirm
            </Button>
          </DialogClose>
        </DialogFooter>
      </section>
    </DialogContent>
  </Dialog>
);
