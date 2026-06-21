/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';

import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { error as logError } from '@/lib/utils/console-logger';

interface EntityDeleteButtonProps {
  /** Runs the delete; resolves to the action result the button maps to a toast. */
  onDelete: () => Promise<{ success: boolean; error?: string }>;
  /** Destructive trigger label, e.g. `'Delete Artist'`. */
  label: string;
  /** Confirmation dialog title. */
  title: string;
  /** Confirmation dialog body. */
  description: string;
  /** Toast shown on a successful delete. */
  successMessage: string;
  /** Fallback toast when the action fails without a specific error. */
  failureMessage: string;
  /** Route pushed (with a refresh) after a successful delete. */
  redirectTo: string;
  /** Disables the trigger (e.g. while the parent form is submitting). */
  disabled?: boolean;
}

/**
 * Reusable destructive "delete entity" control for admin edit forms. Renders a
 * destructive button gated by a shadcn `AlertDialog` (replacing native
 * `window.confirm`), runs the injected `onDelete`, and maps the result to a
 * toast — navigating to `redirectTo` on success or reopening the form on
 * failure. Centralizes the delete UX the featured-artist/artist/release forms
 * previously duplicated.
 */
export const EntityDeleteButton = ({
  onDelete,
  label,
  title,
  description,
  successMessage,
  failureMessage,
  redirectTo,
  disabled = false,
}: EntityDeleteButtonProps): ReactElement => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      const result = await onDelete();
      if (result.success) {
        toast.success(successMessage);
        router.push(redirectTo);
        router.refresh();
        // Navigation unmounts this subtree; no further state updates needed.
      } else {
        toast.error(result.error || failureMessage);
        setIsDeleting(false);
        setOpen(false);
      }
    } catch (err) {
      logError('Delete error:', err);
      toast.error('An unexpected error occurred');
      setIsDeleting(false);
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
