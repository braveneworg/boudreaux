/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ComponentProps, ReactElement } from 'react';

import { EyeOff, Send } from 'lucide-react';

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

/** The publish transition a {@link VideoPublishDialog} confirms. */
export type VideoPublishVerb = 'publish' | 'unpublish';

interface VideoPublishDialogProps {
  /** Whether this dialog publishes or unpublishes the video. */
  verb: VideoPublishVerb;
  /** Video title shown (bolded) in the confirmation copy. */
  title: string;
  /** Confirms the transition. */
  onConfirm: () => void;
}

interface PublishVerbConfig {
  Icon: LucideIcon;
  label: string;
  heading: string;
  action: string;
  triggerVariant: ComponentProps<typeof Button>['variant'];
}

/** Resolve the trigger/heading/copy for a publish verb. */
const resolvePublishConfig = (verb: VideoPublishVerb): PublishVerbConfig =>
  verb === 'publish'
    ? {
        Icon: Send,
        label: 'Publish',
        heading: 'Confirm Publish',
        action: 'publish',
        triggerVariant: 'default',
      }
    : {
        Icon: EyeOff,
        label: 'Unpublish',
        heading: 'Confirm Unpublish',
        action: 'unpublish',
        triggerVariant: 'secondary',
      };

/**
 * Trigger button + confirmation dialog for publishing or unpublishing a single
 * video. Mirrors the shared `PublishEntityDialog` but supports both directions,
 * keeping that shared component untouched for the other admin data views.
 */
export const VideoPublishDialog = ({
  verb,
  title,
  onConfirm,
}: VideoPublishDialogProps): ReactElement => {
  const { Icon, label, heading, action, triggerVariant } = resolvePublishConfig(verb);

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
          <p className="mt-1 mb-4">
            Are you sure you want to {action} <b>{title}</b>?
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
};
