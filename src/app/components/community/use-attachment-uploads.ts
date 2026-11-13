/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState } from 'react';

import {
  acceptedAttachmentType,
  attachmentKindForType,
  attachmentUploadLimitBytes,
} from '@fakefour/job-contract';

import {
  confirmAttachmentUploadAction,
  requestAttachmentUploadAction,
} from '@/lib/actions/submission-attachment-actions';
import {
  ATTACHMENT_TYPE_MESSAGE,
  attachmentLimitMessage,
  ATTACHMENTS_FULL_MESSAGE,
  MAX_SUBMISSION_ATTACHMENTS,
} from '@/lib/constants/submissions';
import type { ConfirmedAttachment } from '@/lib/types/domain/submission-attachment';
import { isUploadAbort, putWithProgress } from '@/lib/utils/put-with-progress';

/** One file on its way to becoming an attachment, as the form lists it. */
export interface PendingUpload {
  /** A key for the list; the attachment has no id until it is confirmed. */
  localId: string;
  fileName: string;
  /** How much has been uploaded, from 0 to 1. */
  fraction: number;
  /** Why it stopped, written for the owner; `null` while it is under way. */
  error: string | null;
}

interface UseAttachmentUploadsOptions {
  submissionId: string;
  /** How many attachments the submission already holds. */
  heldCount: number;
  /** Called once a file has become an attachment and its re-encode has started. */
  onConfirmed: (confirmed: ConfirmedAttachment) => void;
}

export interface AttachmentUploads {
  /** The files under way, and those that stopped with an error. */
  uploads: PendingUpload[];
  /** A message about the last batch as a whole, or `''`. */
  notice: string;
  /** Start uploading files, as many as the submission has room for. */
  add: (files: File[]) => void;
  /** Cancel a file that is uploading, or clear one that failed. */
  dismiss: (localId: string) => void;
}

/** Why a file cannot be uploaded at all, or the type it will be uploaded as. */
const typeOrRefusal = (file: File): { contentType: string } | { refusal: string } => {
  const contentType = acceptedAttachmentType(file.type, file.name);
  const kind = contentType === null ? null : attachmentKindForType(contentType);
  if (contentType === null || kind === null) {
    return { refusal: ATTACHMENT_TYPE_MESSAGE };
  }

  return file.size > attachmentUploadLimitBytes(kind)
    ? { refusal: attachmentLimitMessage(kind) }
    : { contentType };
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'The upload did not finish. Please try again.';

/** The list of files under way, and the two writes every step makes to it. */
interface UploadList {
  uploads: PendingUpload[];
  /** The abort controller of each file whose upload has started. */
  controllers: Map<string, AbortController>;
  append: (entries: PendingUpload[]) => void;
  patch: (localId: string, change: Partial<PendingUpload>) => void;
  drop: (localId: string) => void;
}

const useUploadList = (): UploadList => {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const append = useCallback((entries: PendingUpload[]): void => {
    setUploads((current) => [...current, ...entries]);
  }, []);

  const patch = useCallback((localId: string, change: Partial<PendingUpload>): void => {
    setUploads((current) =>
      current.map((upload) => (upload.localId === localId ? { ...upload, ...change } : upload))
    );
  }, []);

  const drop = useCallback((localId: string): void => {
    controllers.current.delete(localId);
    setUploads((current) => current.filter((upload) => upload.localId !== localId));
  }, []);

  return { uploads, controllers: controllers.current, append, patch, drop };
};

interface SendOptions {
  submissionId: string;
  file: File;
  localId: string;
  /** The accepted type the upload is signed with and sent as. */
  contentType: string;
  list: Pick<UploadList, 'controllers' | 'patch' | 'drop'>;
  onConfirmed: (confirmed: ConfirmedAttachment) => void;
}

/**
 * One file's three steps: ask where to put it, `PUT` it there, confirm it. A
 * refusal from the server lands on the file; a failed or cancelled `PUT`
 * rejects, for the caller to tell apart.
 */
const sendUpload = async ({
  submissionId,
  file,
  localId,
  contentType,
  list,
  onConfirmed,
}: SendOptions): Promise<void> => {
  const requested = await requestAttachmentUploadAction({
    submissionId,
    fileName: file.name,
    contentType,
    fileSize: file.size,
  });
  if (!requested.success) {
    list.patch(localId, { error: requested.error });
    return;
  }

  const controller = new AbortController();
  list.controllers.set(localId, controller);
  await putWithProgress(requested.data.uploadUrl, file, {
    contentType,
    onProgress: (fraction) => list.patch(localId, { fraction }),
    signal: controller.signal,
  });

  const confirmed = await confirmAttachmentUploadAction({
    submissionId,
    uploadKey: requested.data.uploadKey,
    fileName: file.name,
  });
  if (!confirmed.success) {
    list.patch(localId, { error: confirmed.error });
    return;
  }

  list.drop(localId);
  onConfirmed(confirmed.data);
};

/**
 * Uploads files to a submission, one attachment each: ask the server where
 * to put the file, `PUT` it there with progress, then confirm it. A file of
 * the wrong type or size is refused here first, with the same words the
 * server would use; the server checks again regardless.
 */
export const useAttachmentUploads = ({
  submissionId,
  heldCount,
  onConfirmed,
}: UseAttachmentUploadsOptions): AttachmentUploads => {
  const list = useUploadList();
  const { uploads, controllers, append, patch, drop } = list;
  const [notice, setNotice] = useState('');

  const start = useCallback(
    (file: File, localId: string): void => {
      const checked = typeOrRefusal(file);
      if ('refusal' in checked) {
        patch(localId, { error: checked.refusal });
        return;
      }

      sendUpload({
        submissionId,
        file,
        localId,
        contentType: checked.contentType,
        list: { controllers, patch, drop },
        onConfirmed,
      }).catch((error: unknown) => {
        if (isUploadAbort(error)) {
          drop(localId);
        } else {
          patch(localId, { error: messageOf(error) });
        }
      });
    },
    [submissionId, onConfirmed, controllers, patch, drop]
  );

  const add = useCallback(
    (files: File[]): void => {
      const underWay = uploads.filter(({ error }) => error === null).length;
      const room = Math.max(MAX_SUBMISSION_ATTACHMENTS - heldCount - underWay, 0);
      const taken = files.slice(0, room).map((file) => ({ file, localId: crypto.randomUUID() }));

      setNotice(taken.length < files.length ? ATTACHMENTS_FULL_MESSAGE : '');
      append(
        taken.map(({ file, localId }) => ({
          localId,
          fileName: file.name,
          fraction: 0,
          error: null,
        }))
      );
      for (const { file, localId } of taken) {
        start(file, localId);
      }
    },
    [uploads, heldCount, append, start]
  );

  const dismiss = useCallback(
    (localId: string): void => {
      const controller = controllers.get(localId);
      if (controller) {
        // The abort rejects the upload, which drops it from the list.
        controller.abort();
      } else {
        drop(localId);
      }
    },
    [controllers, drop]
  );

  return { uploads, notice, add, dismiss };
};
