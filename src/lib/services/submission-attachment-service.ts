/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  attachmentCopyPrefix,
  attachmentKindForType,
  attachmentUploadLimitBytes,
  attachmentUploadPrefix,
  SUBMISSION_REENCODE_TASK,
} from '@fakefour/job-contract';

import { isLocalUpload } from '@/lib/actions/upload-local-adapter';
import { attachmentFileKeys, attachmentStateOf } from '@/lib/community/attachment-state';
import { getSubmissionReencoderLambdaName } from '@/lib/config/runtime-config';
import {
  ATTACHMENT_TYPE_MESSAGE,
  attachmentLimitMessage,
  ATTACHMENTS_FULL_MESSAGE,
  MAX_SUBMISSION_ATTACHMENTS,
  UPLOAD_AGREEMENT_VERSION,
} from '@/lib/constants/submissions';
import { SubmissionAttachmentRepository } from '@/lib/repositories/submission-attachment-repository';
import { SubmissionRepository } from '@/lib/repositories/submission-repository';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type { JobAdapter, JobDispatch, JobTypes } from '@/lib/services/job-runner/types';
import { attachmentStore } from '@/lib/services/submission-attachment-store';
import {
  isPublishable,
  SubmissionRuleError,
  SubmissionService,
} from '@/lib/services/submission-service';
import type { SubmissionOwnerActor, SubmissionRecord } from '@/lib/types/domain/submission';
import type {
  AttachmentProgress,
  SubmissionAttachmentRecord,
} from '@/lib/types/domain/submission-attachment';
import { loggers } from '@/lib/utils/logger';
import { attachmentProgressSchema } from '@/lib/validation/submission-attachment-schema';
import type {
  ConfirmAttachmentUploadInput,
  RequestAttachmentUploadInput,
} from '@/lib/validation/submission-attachment-schema';

import type {
  AttachmentKind,
  SubmissionReencodeData,
  SubmissionReencodeInput,
  SubmissionReencodeProgressPost,
} from '@fakefour/job-contract';

const logger = loggers.media;

const NOT_FOUND_MESSAGE = 'Submission not found.';
const ATTACHMENT_NOT_FOUND_MESSAGE = 'Attachment not found.';
const NOT_SET_UP_MESSAGE = 'Uploads are not set up yet.';
const AGREEMENT_MESSAGE = 'Accept the upload agreement to continue.';
const WRONG_KEY_MESSAGE = 'That upload does not belong to this submission.';
const NOT_UPLOADED_MESSAGE = 'That upload did not arrive. Try the file again.';
const STILL_PROCESSING_MESSAGE =
  'This attachment is still processing. Remove it once it has finished.';
const LAST_ATTACHMENT_MESSAGE =
  'A published submission needs something to show. Add another attachment first, or delete the submission.';

/** A content type without its parameters, lower-cased: what is signed, and what the browser must send. */
const bareType = (contentType: string): string =>
  (contentType.split(';').at(0) ?? '').trim().toLowerCase();

/**
 * The kind an upload of this type and size is accepted as. Throws the rule it
 * breaks: a type that is not accepted, or a size past its kind's limit.
 */
const acceptedKindOf = (contentType: string, bytes: number): AttachmentKind => {
  const kind = attachmentKindForType(contentType);
  if (kind === null) {
    throw new SubmissionRuleError('VALIDATION', ATTACHMENT_TYPE_MESSAGE);
  }

  if (bytes > attachmentUploadLimitBytes(kind)) {
    throw new SubmissionRuleError('VALIDATION', attachmentLimitMessage(kind));
  }

  return kind;
};

/** Path separators, control characters and direction overrides have no place in a shown name. */
const UNSAFE_NAME_CHARACTERS = /[/\\\p{Cc}\p{Cf}]/gu;

/** A file name fit to store and show: a plain name, never a path. */
const plainFileName = (fileName: string): string =>
  fileName.replace(UNSAFE_NAME_CHARACTERS, '').trim() || 'file';

/**
 * Whether attachments can be taken at all: the private bucket and the
 * re-encode Lambda are both configured. Under E2E both are stood in for.
 */
export const attachmentsAvailable = (): boolean =>
  attachmentStore.isConfigured() &&
  (isLocalUpload() || getSubmissionReencoderLambdaName() !== undefined);

const assertAvailable = (): void => {
  if (!attachmentsAvailable()) {
    throw new SubmissionRuleError('UNAVAILABLE', NOT_SET_UP_MESSAGE);
  }
};

/** An owner's submission, or the refusal that never says whether it exists. */
const ownedSubmission = async (
  ownerId: string,
  submissionId: string
): Promise<SubmissionRecord> => {
  const stored = await SubmissionRepository.findById(submissionId);
  if (!stored || stored.ownerId !== ownerId) {
    throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
  }

  return stored;
};

/** A cleanup that must never fail the write it follows. */
const bestEffort = async (work: () => Promise<void>, what: string): Promise<void> => {
  try {
    await work();
  } catch (error) {
    logger.error(`[SubmissionAttachmentService] ${what} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// ---------------------------------------------------------------------------
// The job adapter
// ---------------------------------------------------------------------------

/** The invoke payload without the runner's dispatch fields. */
type ReencodeRequest = Omit<SubmissionReencodeInput, keyof JobDispatch>;

/** The re-encode job's types (see the job runner). */
export interface ReencodeJobTypes extends JobTypes {
  record: SubmissionAttachmentRecord;
  /** A run takes nothing from its trigger: it reads the attachment. */
  input: undefined;
  request: ReencodeRequest;
  data: SubmissionReencodeData;
  claim: { submissionId: string };
  persisted: void;
  checkpoint: Omit<SubmissionReencodeProgressPost, 'jobToken'>;
  progress: AttachmentProgress;
}

/**
 * Fake-path dwell between the checkpoint and the callback, long enough for
 * the form's poll to show the attachment as processing before it is ready.
 */
const FAKE_REENCODE_DELAY_MS = 1500;

/** What a real run would have measured, for the local adapter's fake result. */
const fakeDataFor = ({ kind, copyPrefix }: ReencodeRequest): SubmissionReencodeData => {
  switch (kind) {
    case 'IMAGE':
      return {
        kind,
        copyKey: `${copyPrefix}copy.jpg`,
        cardKey: `${copyPrefix}card.webp`,
        posterKey: null,
        copyBytes: 1024,
        width: 1200,
        height: 800,
        durationSeconds: null,
      };
    case 'AUDIO':
      return {
        kind,
        copyKey: `${copyPrefix}copy.mp3`,
        cardKey: null,
        posterKey: null,
        copyBytes: 1024,
        width: null,
        height: null,
        durationSeconds: 5,
      };
    default:
      return {
        kind,
        copyKey: `${copyPrefix}copy.mp4`,
        cardKey: `${copyPrefix}card.webp`,
        posterKey: `${copyPrefix}poster.jpg`,
        copyBytes: 1024,
        width: 1280,
        height: 720,
        durationSeconds: 5,
      };
  }
};

const prepareReencode = async (
  attachmentId: string
): Promise<{ ok: true; request: ReencodeRequest } | { ok: false; error: string }> => {
  const attachment = await SubmissionAttachmentRepository.findById(attachmentId);
  if (!attachment) {
    return { ok: false, error: ATTACHMENT_NOT_FOUND_MESSAGE };
  }

  return {
    ok: true,
    request: {
      task: SUBMISSION_REENCODE_TASK,
      attachmentId,
      kind: attachment.kind,
      bucket: attachmentStore.bucket(),
      uploadKey: attachment.uploadKey,
      copyPrefix: attachmentCopyPrefix(attachment.submissionId, attachmentId),
    },
  };
};

/**
 * Store an ok result. The callback's schema holds each key to the shape the
 * re-encode writes; this holds them to this attachment's own prefix, so a
 * result can never point an attachment at another one's files.
 */
const persistReencode = async (
  attachmentId: string,
  data: SubmissionReencodeData,
  { submissionId }: { submissionId: string }
): Promise<void> => {
  const prefix = attachmentCopyPrefix(submissionId, attachmentId);
  if (attachmentFileKeys(data).some((key) => !key.startsWith(prefix))) {
    throw new Error('The re-encode named a file outside its attachment.');
  }

  await SubmissionAttachmentRepository.recordReencoded(attachmentId, data);
};

/**
 * The re-encode job, as the job runner sees it (ADR-0026): the attachment's
 * `reencode*` lifecycle columns, its callback and progress routes, the Lambda
 * it runs on, and what an ok result stores.
 */
export const submissionReencodeJob: JobAdapter<ReencodeJobTypes> = {
  kind: 'submission-reencode',
  copy: {
    notFound: ATTACHMENT_NOT_FOUND_MESSAGE,
    noCallbackUrl: 'The re-encode callback URL is not configured',
    notConfigured: 'Re-encoding is not configured (SUBMISSION_REENCODER_LAMBDA_NAME unset)',
    unreachable: 'Failed to reach the re-encoder',
    runFailed: 'The re-encode failed unexpectedly.',
    persistFailed: 'Storing the re-encoded copy failed.',
  },
  functionName: getSubmissionReencoderLambdaName,
  callbackPath: (attachmentId) => `/api/community/attachments/${attachmentId}/reencode/callback`,
  progress: {
    path: (attachmentId) => `/api/community/attachments/${attachmentId}/reencode/progress`,
    schema: attachmentProgressSchema,
    write: (attachmentId, progress) =>
      SubmissionAttachmentRepository.setReencodeProgress(attachmentId, progress),
  },
  fake: {
    delayMs: FAKE_REENCODE_DELAY_MS,
    checkpoint: () => ({ stage: 'encoding', percent: 50 }),
    result: (payload) => ({ ok: true, data: fakeDataFor(payload) }),
  },

  read: (attachmentId) => SubmissionAttachmentRepository.findById(attachmentId),
  state: ({
    reencodeStatus,
    reencodeStartedAt,
    reencodeError,
    reencodeJobToken,
    reencodeProgress,
  }) => ({
    status: reencodeStatus,
    startedAt: reencodeStartedAt,
    error: reencodeError,
    jobToken: reencodeJobToken,
    progress: reencodeProgress,
  }),
  claimContext: ({ submissionId }) => ({ submissionId }),

  markPending: (attachmentId, startedAt) =>
    SubmissionAttachmentRepository.markReencodePending(attachmentId, startedAt),
  begin: (attachmentId, now) => SubmissionAttachmentRepository.beginReencodeRun(attachmentId, now),
  setToken: (attachmentId, token) =>
    SubmissionAttachmentRepository.setReencodeJobToken(attachmentId, token),
  claimToken: (attachmentId, token) =>
    SubmissionAttachmentRepository.claimReencodeJobToken(attachmentId, token),
  recordFailed: (attachmentId, error) =>
    SubmissionAttachmentRepository.recordReencodeFailed(attachmentId, error),
  // `persist` already wrote the files and the succeeded state in one write.
  recordSucceeded: async () => undefined,

  prepare: (attachmentId) => prepareReencode(attachmentId),
  persist: persistReencode,
};

/**
 * Business rules for a submission's attachments (ADR-0026, ADR-0027): what
 * may be uploaded, by whom, to what, and what removing one does. An
 * attachment is content, so a change to an approved submission's attachments
 * takes it offline first, exactly as a text edit does.
 */
export class SubmissionAttachmentService {
  /**
   * Answer somewhere to upload one file: a presigned URL with the declared
   * length and type signed in, and the key it is for.
   *
   * @throws SubmissionRuleError naming the broken rule.
   */
  static async requestUpload(
    owner: SubmissionOwnerActor,
    { submissionId, contentType, fileSize }: RequestAttachmentUploadInput
  ): Promise<{ uploadUrl: string; uploadKey: string }> {
    assertAvailable();

    if (owner.uploadAgreementVersion !== UPLOAD_AGREEMENT_VERSION) {
      throw new SubmissionRuleError('INVALID_INPUT', AGREEMENT_MESSAGE);
    }

    await ownedSubmission(owner.id, submissionId);
    acceptedKindOf(contentType, fileSize);

    // A courtesy before the upload; the cap itself is held when the row is made.
    const held = await SubmissionAttachmentRepository.listBySubmission(submissionId);
    if (held.length >= MAX_SUBMISSION_ATTACHMENTS) {
      throw new SubmissionRuleError('LIMIT_EXCEEDED', ATTACHMENTS_FULL_MESSAGE);
    }

    const uploadKey = `${attachmentUploadPrefix(submissionId)}${randomUUID()}`;
    const uploadUrl = await attachmentStore.presignUpload({
      key: uploadKey,
      contentType: bareType(contentType),
      contentLength: fileSize,
    });

    return { uploadUrl, uploadKey };
  }

  /**
   * Turn a finished upload into an attachment and mark its re-encode pending.
   * What is stored comes from the object itself, never from what the browser
   * says it sent. The caller runs the job with {@link runReencode}.
   *
   * @throws SubmissionRuleError naming the broken rule.
   */
  static async confirmUpload(
    ownerId: string,
    { submissionId, uploadKey, fileName }: ConfirmAttachmentUploadInput
  ): Promise<{ attachmentId: string; submission: SubmissionRecord }> {
    assertAvailable();

    if (!uploadKey.startsWith(attachmentUploadPrefix(submissionId))) {
      throw new SubmissionRuleError('INVALID_INPUT', WRONG_KEY_MESSAGE);
    }

    const stored = await ownedSubmission(ownerId, submissionId);
    const upload = await attachmentStore.headUpload(uploadKey);
    if (!upload) {
      throw new SubmissionRuleError('INVALID_INPUT', NOT_UPLOADED_MESSAGE);
    }

    try {
      const kind = acceptedKindOf(upload.contentType, upload.bytes);
      const submission = await SubmissionService.takeOfflineForAttachmentChange(stored);
      const created = await SubmissionAttachmentRepository.createWithinCap(
        {
          submissionId,
          kind,
          fileName: plainFileName(fileName),
          uploadKey,
          uploadBytes: upload.bytes,
          uploadType: bareType(upload.contentType),
        },
        MAX_SUBMISSION_ATTACHMENTS
      );
      if (created.status === 'full') {
        throw new SubmissionRuleError('LIMIT_EXCEEDED', ATTACHMENTS_FULL_MESSAGE);
      }

      await jobRunner.trigger(submissionReencodeJob, created.attachment.id);

      return { attachmentId: created.attachment.id, submission };
    } catch (error) {
      // No attachment points at it, so nothing would ever delete it sooner
      // than the bucket's one-day expiry.
      await bestEffort(
        () => attachmentStore.deletePrivate([uploadKey]),
        'deleting a refused upload'
      );
      throw error;
    }
  }

  /** Run an attachment's re-encode through the job runner. Never throws: it runs in `after()`. */
  static async runReencode(attachmentId: string): Promise<void> {
    await jobRunner.run(submissionReencodeJob, attachmentId, undefined);
  }

  /**
   * Remove an owner's attachment and its files. Refused while its re-encode
   * is in flight, and when it would leave a published submission with
   * nothing to show.
   *
   * @returns The submission as the removal left it.
   * @throws SubmissionRuleError naming the broken rule.
   */
  static async remove(ownerId: string, attachmentId: string): Promise<SubmissionRecord> {
    const attachment = await SubmissionAttachmentRepository.findWithSubmission(attachmentId);
    if (!attachment || attachment.submission.ownerId !== ownerId) {
      throw new SubmissionRuleError('NOT_FOUND', ATTACHMENT_NOT_FOUND_MESSAGE);
    }

    if (attachmentStateOf(attachment).state === 'processing') {
      throw new SubmissionRuleError('INVALID_INPUT', STILL_PROCESSING_MESSAGE);
    }

    const stored = await ownedSubmission(ownerId, attachment.submissionId);
    await SubmissionAttachmentService.assertRemovable(stored, attachmentId);

    const submission = await SubmissionService.takeOfflineForAttachmentChange(stored);
    await SubmissionAttachmentRepository.remove(attachmentId, attachment.submissionId);
    await bestEffort(
      () =>
        attachmentStore.deletePrivate([...attachmentFileKeys(attachment), attachment.uploadKey]),
      'deleting a removed attachment’s files'
    );

    return submission;
  }

  /** A submission in front of an approver, or approved, must still have something to show. */
  private static async assertRemovable(
    stored: SubmissionRecord,
    attachmentId: string
  ): Promise<void> {
    if (stored.status !== 'AWAITING_APPROVAL' && stored.status !== 'APPROVED') {
      return;
    }

    const others = (await SubmissionAttachmentRepository.listBySubmission(stored.id)).filter(
      ({ id }) => id !== attachmentId
    );
    // Only what is left has to be there; whether each is ready is the
    // approver's gate, not a reason to keep a failed attachment.
    const ready = others.filter((other) => attachmentStateOf(other).state === 'ready');
    if (!isPublishable(stored, ready)) {
      throw new SubmissionRuleError('INVALID_INPUT', LAST_ATTACHMENT_MESSAGE);
    }
  }
}
