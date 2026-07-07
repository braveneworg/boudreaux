/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ComponentProps, ReactElement, ReactNode } from 'react';

import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';

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

import type { LucideIcon } from 'lucide-react';

/** The lifecycle transition a {@link VideoArchiveDialog} confirms. */
export type VideoArchiveVerb = 'archive' | 'restore' | 'delete';

interface VideoArchiveDialogProps {
  /** Which lifecycle transition this dialog confirms. */
  verb: VideoArchiveVerb;
  /** Video title shown (bolded) in the confirmation copy. */
  title: string;
  /** Confirms the transition. */
  onConfirm: () => void;
}

interface VerbConfig {
  Icon: LucideIcon;
  label: string;
  heading: string;
  body: ReactNode;
  triggerVariant: ComponentProps<typeof Button>['variant'];
  confirmVariant: ComponentProps<typeof Button>['variant'];
}

/** Resolve the trigger/heading/copy/styling for a lifecycle verb. */
const resolveVerbConfig = (verb: VideoArchiveVerb, title: string): VerbConfig => {
  switch (verb) {
    case 'archive':
      return {
        Icon: Archive,
        label: 'Archive',
        heading: 'Confirm Archive',
        body: (
          <>
            Archiving <b>{title}</b> hides it from the public videos page. You can restore it later.
          </>
        ),
        triggerVariant: 'secondary',
        confirmVariant: 'destructive',
      };
    case 'restore':
      return {
        Icon: ArchiveRestore,
        label: 'Restore',
        heading: 'Confirm Restore',
        body: (
          <>
            Restoring <b>{title}</b> makes it eligible to appear on the public videos page again.
          </>
        ),
        triggerVariant: 'secondary',
        confirmVariant: 'default',
      };
    case 'delete':
      return {
        Icon: Trash2,
        label: 'Delete',
        heading: 'Confirm Delete',
        body: (
          <>
            Deleting <b>{title}</b> permanently removes the video and its files from storage. This
            can&apos;t be undone.
          </>
        ),
        triggerVariant: 'destructive',
        confirmVariant: 'destructive',
      };
  }
};

/**
 * Trigger button + confirmation dialog for a single video's archive, restore, or
 * delete transition. The delete copy warns that the video and its stored files
 * are permanently removed.
 */
export const VideoArchiveDialog = ({
  verb,
  title,
  onConfirm,
}: VideoArchiveDialogProps): ReactElement => {
  const { Icon, label, heading, body, triggerVariant, confirmVariant } = resolveVerbConfig(
    verb,
    title
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>
          <Icon className="mr-0 size-4" aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <section>
          <DialogHeader>
            <DialogTitle asChild>
              <h1 className="text-3xl!">{heading}</h1>
            </DialogTitle>
          </DialogHeader>
          <p className="mt-1 mb-4">{body}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant={confirmVariant} onClick={onConfirm}>
                Confirm
              </Button>
            </DialogClose>
          </DialogFooter>
        </section>
      </DialogContent>
    </Dialog>
  );
};
