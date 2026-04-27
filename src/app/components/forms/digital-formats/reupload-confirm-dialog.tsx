/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

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
import type { DigitalFormatType } from '@/types/digital-format';

interface ReuploadConfirmDialogProps {
  formatType: DigitalFormatType | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReuploadConfirmDialog({
  formatType,
  isDeleting,
  onCancel,
  onConfirm,
}: ReuploadConfirmDialogProps) {
  return (
    <AlertDialog
      open={formatType !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-upload files?</AlertDialogTitle>
          <AlertDialogDescription>
            This format already has files uploaded. Re-uploading will permanently delete the
            existing files and replace them with the new ones. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete & Re-upload'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
