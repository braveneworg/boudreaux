/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { attachmentStateOf, cardPictureOf } from '@/lib/community/attachment-state';
import type {
  AttachmentProgress,
  AttachmentView,
  SubmissionAttachmentRecord,
} from '@/lib/types/domain/submission-attachment';
import { attachmentProgressSchema } from '@/lib/validation/submission-attachment-schema';

import { attachmentStore } from './submission-attachment-store';

/**
 * Attachments as one reader sees them (ADR-0027). The files of a public
 * submission are on the CDN; anything else is read through a short-lived
 * signed link to the private copy, made here for the owner or an approver.
 */

/** Who the views are for. */
export interface AttachmentAudience {
  /** Whether the submission is public right now: its files are then on the CDN. */
  isPublic: boolean;
  /** The uploaded file's name is for its owner and approvers only. */
  showFileNames: boolean;
}

const urlFor = async (key: string | null, isPublic: boolean): Promise<string | null> => {
  if (key === null) {
    return null;
  }

  return isPublic ? attachmentStore.publicUrl(key) : attachmentStore.previewUrl(key);
};

const progressOf = (
  stored: SubmissionAttachmentRecord['reencodeProgress']
): AttachmentProgress | null => {
  const parsed = attachmentProgressSchema.safeParse(stored);

  return parsed.success ? parsed.data : null;
};

const viewOf = async (
  attachment: SubmissionAttachmentRecord,
  { isPublic, showFileNames }: AttachmentAudience
): Promise<AttachmentView> => {
  const { state, error } = attachmentStateOf(attachment);
  const isReady = state === 'ready';
  const [url, cardUrl, posterUrl] = await Promise.all(
    [attachment.copyKey, attachment.cardKey, attachment.posterKey].map((key) =>
      urlFor(isReady ? key : null, isPublic)
    )
  );

  return {
    id: attachment.id,
    kind: attachment.kind,
    fileName: showFileNames ? attachment.fileName : '',
    state,
    error,
    progress: state === 'processing' ? progressOf(attachment.reencodeProgress) : null,
    url: url ?? null,
    cardUrl: cardUrl ?? null,
    posterUrl: posterUrl ?? null,
    width: attachment.width,
    height: attachment.height,
    durationSeconds: attachment.durationSeconds,
  };
};

/**
 * A submission's attachments for one reader, in upload order. The public is
 * shown only what is ready; an approved submission holds nothing else, but a
 * page must not depend on that.
 */
export const attachmentViewsFor = async (
  attachments: SubmissionAttachmentRecord[],
  audience: AttachmentAudience
): Promise<AttachmentView[]> => {
  const views = await Promise.all(attachments.map((attachment) => viewOf(attachment, audience)));

  return audience.isPublic ? views.filter(({ state }) => state === 'ready') : views;
};

/** The address of a submission's card picture for one reader, or `null` when it has none. */
export const cardPictureUrlFor = async (
  attachments: SubmissionAttachmentRecord[],
  { isPublic }: Pick<AttachmentAudience, 'isPublic'>
): Promise<string | null> => urlFor(cardPictureOf(attachments), isPublic);
