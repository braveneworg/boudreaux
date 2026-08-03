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
  /**
   * When true the dialog is a permanent (hard) delete: "Delete Forever" button,
   * a cannot-be-undone warning, and no restore variant. Ignored with restore.
   */
  permanent?: boolean;
  /** Display name shown in the confirmation copy. */
  displayName: string;
  /** Confirms the delete or restore. */
  onConfirm: () => void;
}

/** The verb-dependent copy for one dialog variant. */
interface DialogCopy {
  buttonLabel: string;
  title: string;
  verbPhrase: string;
}

/** Resolves the restore / permanent-delete / soft-delete copy set. */
const resolveCopy = (showRestore: boolean, permanent: boolean): DialogCopy => {
  if (showRestore) {
    return { buttonLabel: 'Restore', title: 'Confirm Restore', verbPhrase: 'restore' };
  }
  if (permanent) {
    return {
      buttonLabel: 'Delete Forever',
      title: 'Confirm Permanent Delete',
      verbPhrase: 'permanently delete',
    };
  }
  return { buttonLabel: 'Delete', title: 'Confirm Delete', verbPhrase: 'delete' };
};

/**
 * Delete/Restore button + confirmation dialog for a single entity. The verb flips to
 * "restore" for soft-deleted rows that have a restore handler wired; `permanent`
 * renders the hard-delete variant offered beside Restore on archived rows.
 */
export const DeleteRestoreEntityDialog = ({
  showRestore,
  permanent = false,
  displayName,
  onConfirm,
}: DeleteRestoreEntityDialogProps): ReactElement => {
  const copy = resolveCopy(showRestore, permanent);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={showRestore ? 'secondary' : 'destructive'}>
          {showRestore ? (
            <ArchiveRestoreIcon className="mr-0 size-4" />
          ) : (
            <Trash2Icon className="mr-0 size-4" />
          )}
          {copy.buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <section>
          <DialogHeader>
            <DialogTitle asChild>
              <h1 className="text-3xl!">{copy.title}</h1>
            </DialogTitle>
          </DialogHeader>
          <p className="mt-1 mb-4">
            Are you sure you want to {copy.verbPhrase} <b>{displayName}</b>?
            {permanent && ' This action cannot be undone.'}
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
};
