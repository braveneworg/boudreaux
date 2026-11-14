/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useId, useRef, useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { ATTACHMENT_ACCEPTED_TYPES, ATTACHMENT_UPLOAD_LIMIT_BYTES } from '@fakefour/job-contract';
import { Film, ImageIcon, Music, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import { UploaderDropZone } from '@/app/components/ui/uploader-drop-zone';
import { useUploaderDrag } from '@/app/components/ui/use-uploader-drag';
import { useHydrated } from '@/hooks/use-hydrated';
import { removeAttachmentAction } from '@/lib/actions/submission-attachment-actions';
import { MAX_SUBMISSION_ATTACHMENTS } from '@/lib/constants/submissions';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import type { AttachmentView, ConfirmedAttachment } from '@/lib/types/domain/submission-attachment';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

import { useAttachmentUploads } from './use-attachment-uploads';
import { useSubmissionAttachmentsQuery } from './use-submission-attachments-query';

import type { PendingUpload } from './use-attachment-uploads';
import type { ReencodeProgressStage } from '@fakefour/job-contract';

export interface SubmissionAttachmentsProps {
  submissionId: string;
  /** The state the page was rendered in. An approved submission warns before a change. */
  status: SubmissionStatus;
  /** When the page read the submission, for the first render's data. */
  updatedAt: string;
  initialAttachments: AttachmentView[];
}

const HELP = `Photos, audio and video. Up to ${MAX_SUBMISSION_ATTACHMENTS} files, re-encoded before anyone sees them.`;
const OFFLINE_WARNING =
  'Adding or removing an attachment takes this offline until it is approved again.';
const REMOVE_FAILED = 'We could not remove that attachment. Please try again.';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const megabytes = (bytes: number): number => bytes / BYTES_PER_MEGABYTE;

/** The file picker's filter: every accepted type, and the extensions browsers leave untyped. */
const ACCEPT = [
  ...ATTACHMENT_ACCEPTED_TYPES,
  '.mkv',
  '.flac',
  '.opus',
  '.aif',
  '.aiff',
  '.m4v',
  '.3gp',
].join(',');

const TYPES_HINT = `Photos up to ${megabytes(ATTACHMENT_UPLOAD_LIMIT_BYTES.IMAGE)} MB, audio up to ${megabytes(ATTACHMENT_UPLOAD_LIMIT_BYTES.AUDIO)} MB, video`;

const STAGE_LABELS: ReadonlyMap<ReencodeProgressStage, string> = new Map([
  ['downloading', 'getting the file'],
  ['probing', 'checking the file'],
  ['encoding', 're-encoding'],
  ['storing', 'saving'],
]);

/** What a processing attachment is doing, in a few words. */
const processingText = ({ progress }: AttachmentView): string => {
  if (progress === null) {
    return 'Processing: waiting to start';
  }

  const stage = STAGE_LABELS.get(progress.stage) ?? progress.stage;

  return progress.percent === undefined
    ? `Processing: ${stage}`
    : `Processing: ${stage}, ${progress.percent}%`;
};

const KindIcon = ({ kind }: Pick<AttachmentView, 'kind'>) => {
  if (kind === 'IMAGE') {
    return <ImageIcon className="size-5" aria-hidden />;
  }

  return kind === 'AUDIO' ? (
    <Music className="size-5" aria-hidden />
  ) : (
    <Film className="size-5" aria-hidden />
  );
};

/** The card picture of an image or a video, or an icon for its kind. */
const Thumbnail = ({ kind, cardUrl }: Pick<AttachmentView, 'kind' | 'cardUrl'>) => (
  <div className="border-foreground flex size-12 shrink-0 items-center justify-center overflow-hidden border-2">
    {cardUrl === null ? (
      <KindIcon kind={kind} />
    ) : (
      <Image
        {...resolveCdnImageSource(cardUrl)}
        alt=""
        width={48}
        height={48}
        className="size-full object-cover"
      />
    )}
  </div>
);

/** Where one stored attachment stands. */
const StateLine = ({ attachment }: { attachment: AttachmentView }) => {
  if (attachment.state === 'failed') {
    return <p className="text-destructive text-sm">{attachment.error}</p>;
  }

  if (attachment.state === 'ready') {
    return <p className="text-muted-foreground text-sm">Ready</p>;
  }

  return (
    <div className="space-y-1">
      <p role="status" className="text-sm">
        {processingText(attachment)}
      </p>
      {attachment.progress?.percent !== undefined && (
        <Progress value={attachment.progress.percent} aria-label="Processing progress" />
      )}
    </div>
  );
};

interface StoredRowProps {
  attachment: AttachmentView;
  isBusy: boolean;
  onRemove: (attachment: AttachmentView) => void;
}

const StoredRow = ({ attachment, isBusy, onRemove }: StoredRowProps) => (
  <li className="border-foreground flex min-w-0 items-center gap-3 border-2 p-2">
    <Thumbnail kind={attachment.kind} cardUrl={attachment.cardUrl} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{attachment.fileName}</p>
      <StateLine attachment={attachment} />
    </div>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Remove ${attachment.fileName}`}
      disabled={isBusy || attachment.state === 'processing'}
      onClick={() => onRemove(attachment)}
    >
      <X className="size-4" aria-hidden />
    </Button>
  </li>
);

interface UploadRowProps {
  upload: PendingUpload;
  onDismiss: (localId: string) => void;
}

/** A file on its way up, or one that was refused. */
const UploadRow = ({
  upload: { localId, fileName, fraction, error },
  onDismiss,
}: UploadRowProps) => {
  const percent = Math.round(fraction * 100);

  return (
    <li className="border-foreground flex min-w-0 items-center gap-3 border-2 border-dashed p-2">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{fileName}</p>
        {error === null ? (
          <>
            <p className="text-sm">{`Uploading, ${percent}%`}</p>
            <Progress value={percent} aria-label={`Upload progress for ${fileName}`} />
          </>
        ) : (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${error === null ? 'Cancel' : 'Dismiss'} ${fileName}`}
        onClick={() => onDismiss(localId)}
      >
        <X className="size-4" aria-hidden />
      </Button>
    </li>
  );
};

interface OfflineConfirmProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Asked before an attachment change to an approved submission, which takes it offline. */
const OfflineConfirm = ({ open, onCancel, onConfirm }: OfflineConfirmProps) => (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onCancel();
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Send it for approval again?</AlertDialogTitle>
        <AlertDialogDescription>{OFFLINE_WARNING}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep it as it is</AlertDialogCancel>
        <Button type="button" onClick={onConfirm}>
          Take it offline
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/**
 * Run a change now, or hold it behind the offline warning while the
 * submission is approved. One change is held at a time.
 */
const useOfflineGuard = (isApproved: boolean) => {
  const [held, setHeld] = useState<(() => void) | null>(null);

  const guard = useCallback(
    (change: () => void): void => {
      if (isApproved) {
        setHeld(() => change);
      } else {
        change();
      }
    },
    [isApproved]
  );

  const confirm = (): void => {
    held?.();
    setHeld(null);
  };

  return { guard, isAsking: held !== null, confirm, cancel: () => setHeld(null) };
};

/**
 * The attachments of a saved submission: a drop target, each file's upload
 * progress, each attachment's re-encode, and a remove control. An attachment
 * is content (ADR-0025), so on an approved submission every change warns
 * first and then takes the submission offline.
 */
export const SubmissionAttachments = ({
  submissionId,
  status,
  updatedAt,
  initialAttachments,
}: SubmissionAttachmentsProps) => {
  const router = useRouter();
  const headingId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isHydrated = useHydrated();
  const [isRemoving, setIsRemoving] = useState(false);

  const { data, refetch } = useSubmissionAttachmentsQuery(submissionId, {
    initialData: { status, updatedAt, attachments: initialAttachments },
  });
  const attachments = data?.attachments ?? initialAttachments;
  const { guard, isAsking, confirm, cancel } = useOfflineGuard(
    (data?.status ?? status) === 'APPROVED'
  );

  /** Read the list again; refresh the page when the change moved the submission's state. */
  const settle = useCallback(
    (next: SubmissionStatus): void => {
      void refetch();
      if (next !== status) {
        router.refresh();
      }
    },
    [refetch, router, status]
  );

  const onConfirmed = useCallback(
    (confirmed: ConfirmedAttachment): void => settle(confirmed.status),
    [settle]
  );
  const { uploads, notice, add, dismiss } = useAttachmentUploads({
    submissionId,
    heldCount: attachments.length,
    onConfirmed,
  });

  const addFiles = useCallback(
    (files: FileList | null): void => {
      const picked = [...(files ?? [])];
      if (picked.length > 0) {
        guard(() => add(picked));
      }
    },
    [guard, add]
  );
  const drag = useUploaderDrag(addFiles);

  const remove = (attachment: AttachmentView): void =>
    guard(() => {
      setIsRemoving(true);
      void removeAttachmentAction({ attachmentId: attachment.id }).then((result) => {
        setIsRemoving(false);
        if (result.success) {
          settle(result.data.status);
        } else {
          toast.error(result.error || REMOVE_FAILED);
        }
      });
    });

  return (
    <div role="group" aria-labelledby={headingId} data-hydrated={isHydrated} className="space-y-3">
      <span id={headingId} className="text-sm font-medium">
        Attachments
      </span>
      <p className="text-muted-foreground text-sm">{HELP}</p>
      <UploaderDropZone
        inputRef={inputRef}
        inputId={inputId}
        accept={ACCEPT}
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          // The same file can be picked again after a refusal.
          event.target.value = '';
        }}
        onDrop={drag.handleDrop}
        onDragOver={drag.handleDragOver}
        onDragLeave={drag.handleDragLeave}
        label="Add attachments"
        isDragOver={drag.isDragOver}
        isDisabled={false}
        disabled={false}
        currentCount={attachments.length + uploads.filter(({ error }) => error === null).length}
        maxCount={MAX_SUBMISSION_ATTACHMENTS}
        countUnit="attachments"
        icon={<Upload className="mb-2 size-6" aria-hidden />}
        acceptedTypesLabel={TYPES_HINT}
        maxSizeMb={megabytes(ATTACHMENT_UPLOAD_LIMIT_BYTES.VIDEO)}
        maxReachedLabel={`This submission has ${MAX_SUBMISSION_ATTACHMENTS} attachments, the most it can hold.`}
        containerClassName="p-6"
      />
      {notice !== '' && (
        <p role="alert" className="text-destructive text-sm">
          {notice}
        </p>
      )}
      {(attachments.length > 0 || uploads.length > 0) && (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <StoredRow
              key={attachment.id}
              attachment={attachment}
              isBusy={isRemoving}
              onRemove={remove}
            />
          ))}
          {uploads.map((upload) => (
            <UploadRow key={upload.localId} upload={upload} onDismiss={dismiss} />
          ))}
        </ul>
      )}
      <OfflineConfirm open={isAsking} onCancel={cancel} onConfirm={confirm} />
    </div>
  );
};
