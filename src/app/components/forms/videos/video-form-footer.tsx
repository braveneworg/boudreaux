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
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { CardFooter } from '@/app/components/ui/card';

export interface VideoFormFooterProps {
  /** Controls which secondary action button renders (Publish vs Unpublish). */
  mode: 'draft' | 'published';
  isSubmitting: boolean;
  isUploading: boolean;
  onCancel: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  /**
   * When true and the video is published, clicking Unpublish shows a confirm
   * dialog warning that unsaved edits won't be saved. When false (or omitted),
   * Unpublish fires immediately.
   */
  isDirty?: boolean;
}

/** Confirm dialog shown before unpublishing a video with unsaved edits. */
const UnpublishConfirmDialog = ({
  onUnpublish,
}: {
  onUnpublish: () => void;
}): React.ReactElement => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button type="button" variant="outline">
        Unpublish
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Unpublish video?</AlertDialogTitle>
        <AlertDialogDescription>
          You have unsaved changes. Unpublishing will not save them — only the publish status will
          change. Save your edits first if you want to keep them.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onUnpublish}>Unpublish anyway</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Draft-mode secondary action: a Publish submit button. */
const PublishButton = ({ onPublish }: { onPublish: () => void }): React.ReactElement => (
  <Button type="submit" variant="outline" onClick={onPublish}>
    Publish
  </Button>
);

/** Published-mode secondary action: Unpublish (with optional dirty confirm). */
const UnpublishButton = ({
  isDirty,
  onUnpublish,
}: {
  isDirty: boolean;
  onUnpublish: () => void;
}): React.ReactElement =>
  isDirty ? (
    <UnpublishConfirmDialog onUnpublish={onUnpublish} />
  ) : (
    <Button type="button" variant="outline" onClick={onUnpublish}>
      Unpublish
    </Button>
  );

/**
 * Save + Cancel footer with a mode-sensitive secondary action.
 *
 * - **draft**: shows Save + Publish. Save keeps the video as a draft; Publish
 *   stamps `publishedAt` before submission.
 * - **published**: shows Save + Unpublish. Save persists edits; Unpublish
 *   clears `publishedAt` via the mutation (with a confirm when `isDirty`).
 *
 * Save is blocked while a multipart upload is in flight.
 */
export const VideoFormFooter = ({
  mode,
  isSubmitting,
  isUploading,
  onCancel,
  onPublish,
  onUnpublish,
  isDirty = false,
}: VideoFormFooterProps): React.ReactElement => (
  <CardFooter className="flex justify-end gap-4 px-0">
    <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
      Cancel
    </Button>
    {mode === 'draft' ? (
      <PublishButton onPublish={onPublish} />
    ) : (
      <UnpublishButton isDirty={isDirty} onUnpublish={onUnpublish} />
    )}
    <Button type="submit" disabled={isSubmitting || isUploading}>
      {isSubmitting ? 'Saving…' : 'Save'}
    </Button>
  </CardFooter>
);
