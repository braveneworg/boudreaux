/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { BookCheck, Send } from 'lucide-react';

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
import { Spinner } from '@/app/components/ui/spinner/spinner';

interface PublishEntityDialogProps {
  /** Display name shown in the confirmation copy. */
  displayName: string;
  /** Whether the entity is already published — disables the trigger. */
  isPublished: boolean;
  /** Whether a publish mutation is in flight — shows a spinner. */
  isPending: boolean;
  /** Confirms the publish. */
  onConfirm: () => void;
}

/** Publish button + confirmation dialog for a single entity. */
export const PublishEntityDialog = ({
  displayName,
  isPublished,
  isPending,
  onConfirm,
}: PublishEntityDialogProps): ReactElement => (
  <Dialog>
    <DialogTrigger asChild>
      <Button disabled={isPublished}>
        {isPublished ? <BookCheck className="mr-0 size-4" /> : <Send className="mr-0 size-4" />}
        {isPublished ? 'Published' : 'Publish'}
        {isPending && <Spinner className="mr-2 size-4" />}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <section>
        <DialogHeader>
          <DialogTitle asChild>
            <h1 className="text-3xl!">Confirm Publish</h1>
          </DialogTitle>
        </DialogHeader>
        <p className="mt-1 mb-4">
          Are you sure you want to publish <b>{displayName}</b>?
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>
              Confirm
            </Button>
          </DialogClose>
        </DialogFooter>
      </section>
    </DialogContent>
  </Dialog>
);
