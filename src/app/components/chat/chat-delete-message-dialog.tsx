/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { DeleteChatMessageScope } from '@/lib/actions/delete-chat-message-action';

interface ChatDeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authorUsername: string | null;
  onConfirm: (scope: DeleteChatMessageScope) => void;
}

/**
 * Admin confirmation dialog for the trash-icon action. Lets the
 * moderator pick between hiding the single targeted message and hiding
 * every message authored by the same user. Both confirm buttons are
 * destructive (red); cancel is a neutral black button.
 */
export const ChatDeleteMessageDialog = ({
  open,
  onOpenChange,
  authorUsername,
  onConfirm,
}: ChatDeleteMessageDialogProps) => {
  const displayName = authorUsername ?? 'this user';
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete message?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose whether to delete just this message or every message by {displayName}. This hides
            the message(s) for everyone in chat.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            onClick={() => onConfirm('message')}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete this message
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm('user')}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Delete all by {displayName}
          </Button>
          <AlertDialogCancel className="bg-zinc-950! text-white hover:bg-zinc-900 hover:text-white">
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
