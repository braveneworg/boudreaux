/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  attachmentFileKeys,
  attachmentStateOf,
  unreadyAttachmentsMessage,
  unreadyAttachmentState,
} from '@/lib/community/attachment-state';
import {
  MAX_SUBMISSION_LINKS,
  MAX_UNAPPROVED_SUBMISSIONS,
  SUBMISSION_ABOUT_MAX,
  SUBMISSION_WRITING_MAX,
  UPLOAD_AGREEMENT_VERSION,
} from '@/lib/constants/submissions';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import { SubmissionAttachmentRepository } from '@/lib/repositories/submission-attachment-repository';
import { SubmissionReportRepository } from '@/lib/repositories/submission-report-repository';
import { isPublicSubmission, SubmissionRepository } from '@/lib/repositories/submission-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
import { attachmentStore } from '@/lib/services/submission-attachment-store';
import { attachmentViewsFor, cardPictureUrlFor } from '@/lib/services/submission-attachment-views';
import {
  notifyApproversOfSubmission,
  notifyOwnerOfDecision,
} from '@/lib/services/submission-notices';
import { DataError } from '@/lib/types/domain/errors';
import type {
  SubmissionActor,
  SubmissionContent,
  SubmissionDecisionData,
  SubmissionOwnerActor,
  SubmissionQueueRow,
  SubmissionRecord,
  SubmissionView,
  SubmissionViewerKind,
  SubmissionWithOwnerRecord,
  SubmissionWrite,
} from '@/lib/types/domain/submission';
import type { SubmissionAttachmentRecord } from '@/lib/types/domain/submission-attachment';
import { gravatarHash } from '@/lib/utils/gravatar-hash';
import { loggers } from '@/lib/utils/logger';
import { isAdminRole, isApproverRole } from '@/lib/utils/roles';
import {
  sanitizeSubmissionAbout,
  sanitizeSubmissionWriting,
  submissionTextLength,
  submissionWritingLinks,
} from '@/lib/utils/sanitize-submission-html';
import type { SaveSubmissionInput } from '@/lib/validation/submission-schema';

const logger = loggers.media;

/** What a save needs of the form: everything but the verification token. */
export type SaveSubmissionData = Omit<SaveSubmissionInput, 'turnstileToken'>;

/**
 * A business rule a submission write broke, naming the form field it belongs
 * on when there is one. Its message is written for the user and shown as is.
 */
export class SubmissionRuleError extends DataError {
  constructor(
    code: DataError['code'],
    message: string,
    public readonly field?: string
  ) {
    super(code, message);
    this.name = 'SubmissionRuleError';
  }
}

const NOT_FOUND_MESSAGE = 'Submission not found.';
const AGREEMENT_MESSAGE = 'Accept the upload agreement to continue.';
const TITLE_REQUIRED_MESSAGE = 'Add a title before publishing.';
const WRITING_OR_ATTACHMENT_MESSAGE = 'Add your writing or an attachment before publishing.';
const ATTACHMENT_REQUIRED_MESSAGE = 'Add at least one attachment before publishing.';
const APPROVE_PROCESSING_MESSAGE =
  'An attachment is still processing. Try again when it has finished.';
const APPROVE_FAILED_MESSAGE = 'An attachment failed to process. Its owner has to remove it first.';
const PUBLISH_FILES_FAILED_MESSAGE =
  'The attachments could not be published, so nothing was approved. Try again.';
const DELETE_WHILE_PROCESSING_MESSAGE =
  'An attachment is still processing. Delete the submission once it has finished.';
const STALE_SAVE_MESSAGE =
  'This submission changed while you were editing. Reload it and try again.';
const STALE_DECISION_MESSAGE =
  'This submission changed since you opened it. Review it again before deciding.';
const OWN_SUBMISSION_MESSAGE =
  'A manager cannot decide on their own submission. Another approver has to.';
const NOT_AWAITING_MESSAGE = 'Only a submission awaiting approval can be approved.';
const NOT_REJECTABLE_MESSAGE =
  'Only a submission that is awaiting approval or approved can be rejected.';
const NOT_LISTABLE_MESSAGE = 'Only an approved submission can be listed or unlisted.';
const CAP_MESSAGE = `You can have ${MAX_UNAPPROVED_SUBMISSIONS} submissions that are not approved yet. Publish one and wait for approval, or delete a draft, to make room.`;

/** The states an approver may reject from: before approval, or after it. */
const REJECTABLE_STATUSES: SubmissionStatus[] = ['AWAITING_APPROVAL', 'APPROVED'];

/** The states in which a submission is, or has been put up to be, in front of an approver. */
const isPublishedStatus = (status: SubmissionStatus): boolean =>
  status === 'AWAITING_APPROVAL' || status === 'APPROVED';

const sameLinks = (stored: string[], next: string[]): boolean =>
  stored.length === next.length && stored.every((link, index) => link === next.at(index));

/** Whether a save changes what an approver approved. `listed` is not content. */
const isContentChange = (stored: SubmissionRecord, next: SubmissionContent): boolean =>
  stored.title !== next.title ||
  stored.category !== next.category ||
  stored.aboutHtml !== next.aboutHtml ||
  stored.writingHtml !== next.writingHtml ||
  !sameLinks(stored.links, next.links);

/**
 * The content a save stores: sanitized here and nowhere else, then held to
 * the rules that need the sanitized text. Throws the rule it breaks.
 */
const contentFrom = ({
  title,
  category,
  aboutHtml,
  writingHtml,
  links,
}: SaveSubmissionData): SubmissionContent => {
  const content: SubmissionContent = {
    title,
    category,
    aboutHtml: sanitizeSubmissionAbout(aboutHtml),
    // Only the writings category has a writing; any other stores none.
    writingHtml: category === 'WRITING' ? sanitizeSubmissionWriting(writingHtml) : '',
    links,
  };

  if (submissionTextLength(content.aboutHtml) > SUBMISSION_ABOUT_MAX) {
    throw new SubmissionRuleError(
      'VALIDATION',
      `Keep the about to ${SUBMISSION_ABOUT_MAX.toLocaleString('en-US')} characters or fewer.`,
      'aboutHtml'
    );
  }

  const writingLength = submissionTextLength(content.writingHtml);
  if (writingLength > SUBMISSION_WRITING_MAX) {
    throw new SubmissionRuleError(
      'VALIDATION',
      `Keep the writing to ${SUBMISSION_WRITING_MAX.toLocaleString('en-US')} characters or fewer.`,
      'writingHtml'
    );
  }

  // A link inside the writing is an outbound link like any other; without
  // this the writing would be a way around the limit.
  if (links.length + submissionWritingLinks(content.writingHtml).length > MAX_SUBMISSION_LINKS) {
    throw new SubmissionRuleError(
      'VALIDATION',
      `A submission can have ${MAX_SUBMISSION_LINKS} links in all, counting the links inside the writing.`,
      'links'
    );
  }

  return content;
};

/**
 * What a submission needs before an approver sees it: a title, something to
 * show (a writing or an attachment for writings, an attachment for anything
 * else), and every attachment with its re-encoded copy. Throws the rule it
 * breaks.
 */
const assertPublishable = (
  { title, category, writingHtml }: SubmissionContent,
  attachments: SubmissionAttachmentRecord[]
): void => {
  if (title === '') {
    throw new SubmissionRuleError('VALIDATION', TITLE_REQUIRED_MESSAGE, 'title');
  }

  const unready = unreadyAttachmentsMessage(attachments);
  if (unready !== null) {
    throw new SubmissionRuleError('VALIDATION', unready, 'attachments');
  }

  if (attachments.length > 0) {
    return;
  }

  if (category !== 'WRITING') {
    throw new SubmissionRuleError('VALIDATION', ATTACHMENT_REQUIRED_MESSAGE, 'attachments');
  }

  if (submissionTextLength(writingHtml) === 0) {
    throw new SubmissionRuleError('VALIDATION', WRITING_OR_ATTACHMENT_MESSAGE, 'writingHtml');
  }
};

/** Whether what a submission holds could be put in front of an approver. */
export const isPublishable = (
  content: SubmissionContent,
  attachments: SubmissionAttachmentRecord[]
): boolean => {
  try {
    assertPublishable(content, attachments);
    return true;
  } catch {
    return false;
  }
};

/** The state an owner's save leaves an unapproved submission in. */
const nextUnapprovedStatus = (
  current: 'DRAFT' | 'AWAITING_APPROVAL' | 'REJECTED',
  publish: boolean
): 'DRAFT' | 'AWAITING_APPROVAL' | 'REJECTED' =>
  current === 'AWAITING_APPROVAL' || publish ? 'AWAITING_APPROVAL' : current;

/** The record a write produced, or the rule its refusal stands for. */
const recordFrom = (write: SubmissionWrite): SubmissionRecord => {
  if (write.status === 'full') {
    throw new SubmissionRuleError('LIMIT_EXCEEDED', CAP_MESSAGE);
  }

  if (write.status === 'stale') {
    throw new SubmissionRuleError('INVALID_INPUT', STALE_SAVE_MESSAGE);
  }

  return write.submission;
};

/** Run a notice that must never fail the write it follows. */
const afterWrite = async (notice: () => Promise<void>, what: string): Promise<void> => {
  try {
    await notice();
  } catch (error) {
    logger.error(`[SubmissionService] ${what} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/** How a reader stands to a submission, or `null` when they may not open it. */
const viewerKindFor = (
  submission: SubmissionWithOwnerRecord,
  viewer: SubmissionActor | null
): SubmissionViewerKind | null => {
  const isPublic = isPublicSubmission(submission);

  if (viewer?.id === submission.ownerId) {
    // A banned owner is refused at every action; their own page goes with it.
    return submission.owner.banned === true ? null : 'owner';
  }

  if (isApproverRole(viewer?.role) && submission.status !== 'DRAFT') {
    return 'approver';
  }

  return isPublic ? 'public' : null;
};

/**
 * Business rules for community submissions (ADR-0025): what may be saved,
 * who may decide, and who may read. Every rule lives here; the actions only
 * gate, validate the wire shape and map a failure onto the form.
 */
export class SubmissionService {
  /**
   * Save the form as a draft, or publish it for approval. A new submission is
   * created within the owner's cap. An existing one keeps or changes its state
   * by where it is: a content edit to an approved submission takes it offline
   * and sends it back for approval, while a change to `listed` alone does not.
   *
   * @throws SubmissionRuleError naming the broken rule and, where there is
   * one, the form field it belongs on.
   */
  static async save(
    owner: SubmissionOwnerActor,
    data: SaveSubmissionData,
    { publish }: { publish: boolean }
  ): Promise<SubmissionRecord> {
    const holdsAgreement = owner.uploadAgreementVersion === UPLOAD_AGREEMENT_VERSION;
    if (!holdsAgreement && !data.acceptAgreement) {
      throw new SubmissionRuleError('INVALID_INPUT', AGREEMENT_MESSAGE, 'acceptAgreement');
    }

    const stored =
      data.submissionId === undefined
        ? null
        : await SubmissionService.ownedBy(owner.id, data.submissionId);
    const content = contentFrom(data);

    await SubmissionService.holdToPublishRules(stored, content, publish);

    // Recorded only once the content has passed, so a refused save leaves no
    // acceptance behind for a form the user never got through.
    if (!holdsAgreement) {
      await UserRepository.acceptUploadAgreement(owner.id, UPLOAD_AGREEMENT_VERSION, new Date());
    }

    const { submission, enteredQueue } =
      stored === null
        ? await SubmissionService.create(owner.id, content, data.listed, publish)
        : await SubmissionService.update(stored, { content, listed: data.listed }, publish);

    if (enteredQueue) {
      await afterWrite(() => notifyApproversOfSubmission(submission), 'approver notice');
    }

    return submission;
  }

  /**
   * Hold a save to the publish rules when it publishes, and also when the
   * submission is already in front of an approver or approved: its owner
   * cannot empty it in place. A draft, and a rejected submission being
   * reworked, may be saved in any shape.
   */
  private static async holdToPublishRules(
    stored: SubmissionRecord | null,
    content: SubmissionContent,
    publish: boolean
  ): Promise<void> {
    if (stored === null) {
      // A new submission has no attachments yet: one needs a row to belong to.
      return publish ? assertPublishable(content, []) : undefined;
    }

    if (publish || isPublishedStatus(stored.status)) {
      assertPublishable(content, await SubmissionAttachmentRepository.listBySubmission(stored.id));
    }
  }

  /** An owner's submission, or the refusal that never says whether it exists. */
  private static async ownedBy(ownerId: string, submissionId: string): Promise<SubmissionRecord> {
    const stored = await SubmissionRepository.findById(submissionId);
    if (!stored || stored.ownerId !== ownerId) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    return stored;
  }

  /**
   * Take a submission's files off the CDN (ADR-0027). It is already offline
   * as a page by the time this runs, so a failure here is logged, not thrown.
   */
  private static async unpublishFiles(submissionId: string): Promise<void> {
    await afterWrite(async () => {
      const attachments = await SubmissionAttachmentRepository.listBySubmission(submissionId);
      await attachmentStore.unpublish(attachments.flatMap(attachmentFileKeys));
    }, 'taking files off the CDN');
  }

  private static async create(
    ownerId: string,
    content: SubmissionContent,
    listed: boolean,
    publish: boolean
  ): Promise<{ submission: SubmissionRecord; enteredQueue: boolean }> {
    const write = await SubmissionRepository.createWithinCap(
      {
        ownerId,
        ...content,
        listed,
        status: publish ? 'AWAITING_APPROVAL' : 'DRAFT',
        publishedAt: publish ? new Date() : null,
      },
      MAX_UNAPPROVED_SUBMISSIONS
    );

    return { submission: recordFrom(write), enteredQueue: publish };
  }

  private static async update(
    stored: SubmissionRecord,
    { content, listed }: { content: SubmissionContent; listed: boolean },
    publish: boolean
  ): Promise<{ submission: SubmissionRecord; enteredQueue: boolean }> {
    const { id, ownerId } = stored;

    if (stored.status === 'APPROVED') {
      return SubmissionService.updateApproved(stored, content, listed);
    }

    const status = nextUnapprovedStatus(stored.status, publish);
    const entersQueue = status === 'AWAITING_APPROVAL' && stored.status !== 'AWAITING_APPROVAL';
    const write = await SubmissionRepository.updateOwned(
      { id, ownerId, expected: stored.status },
      // An edit while awaiting approval keeps its publish moment, and so its
      // place in the queue.
      { ...content, listed, status, ...(entersQueue && { publishedAt: new Date() }) }
    );

    return { submission: recordFrom(write), enteredQueue: entersQueue };
  }

  private static async updateApproved(
    stored: SubmissionRecord,
    content: SubmissionContent,
    listed: boolean
  ): Promise<{ submission: SubmissionRecord; enteredQueue: boolean }> {
    const { id, ownerId } = stored;

    if (isContentChange(stored, content)) {
      return {
        submission: await SubmissionService.returnToQueue(stored, content, listed),
        enteredQueue: true,
      };
    }

    if (stored.listed === listed) {
      return { submission: stored, enteredQueue: false };
    }

    return {
      submission: await SubmissionService.setListed(ownerId, id, listed),
      enteredQueue: false,
    };
  }

  /**
   * Send an approved submission back for approval with `content`: offline at
   * once, counted against the owner's cap again, and off the CDN.
   */
  private static async returnToQueue(
    { id, ownerId }: SubmissionRecord,
    content: SubmissionContent,
    listed: boolean
  ): Promise<SubmissionRecord> {
    const write = await SubmissionRepository.updateOwned(
      { id, ownerId, expected: 'APPROVED' },
      { ...content, listed, status: 'AWAITING_APPROVAL', publishedAt: new Date() },
      MAX_UNAPPROVED_SUBMISSIONS
    );
    const submission = recordFrom(write);
    await SubmissionService.unpublishFiles(id);

    return submission;
  }

  /**
   * An attachment is about to be added to or removed from `stored`. An
   * attachment is content, so on an approved submission that is a content
   * edit: it goes offline and back for approval before the change is made,
   * and approvers are told. Any other state is left as it is.
   *
   * @throws SubmissionRuleError `LIMIT_EXCEEDED` when the owner already holds
   * the most unapproved submissions allowed; the change must then not be made.
   */
  static async takeOfflineForAttachmentChange(stored: SubmissionRecord): Promise<SubmissionRecord> {
    if (stored.status !== 'APPROVED') {
      return stored;
    }

    const { title, category, aboutHtml, writingHtml, links, listed } = stored;
    const submission = await SubmissionService.returnToQueue(
      stored,
      { title, category, aboutHtml, writingHtml, links },
      listed
    );
    await afterWrite(() => notifyApproversOfSubmission(submission), 'approver notice');

    return submission;
  }

  /**
   * Switch an approved submission between listed and unlisted. The content
   * was approved for both, so nothing is re-reviewed.
   */
  static async setListed(
    ownerId: string,
    submissionId: string,
    listed: boolean
  ): Promise<SubmissionRecord> {
    const submission = await SubmissionRepository.setListed(submissionId, ownerId, listed);
    if (!submission) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_LISTABLE_MESSAGE);
    }

    return submission;
  }

  /**
   * Delete an owner's submission, in any state, and with it every file of
   * its attachments. Refused while an attachment is still processing: its
   * re-encode would write a copy nothing then points at.
   */
  static async delete(ownerId: string, submissionId: string): Promise<void> {
    await SubmissionService.ownedBy(ownerId, submissionId);

    const attachments = await SubmissionAttachmentRepository.listBySubmission(submissionId);
    if (attachments.some((attachment) => attachmentStateOf(attachment).state === 'processing')) {
      throw new SubmissionRuleError('INVALID_INPUT', DELETE_WHILE_PROCESSING_MESSAGE);
    }

    if (!(await SubmissionRepository.deleteOwned(submissionId, ownerId))) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const fileKeys = attachments.flatMap(attachmentFileKeys);
    await afterWrite(() => attachmentStore.unpublish(fileKeys), 'taking files off the CDN');
    await afterWrite(
      () =>
        attachmentStore.deletePrivate([
          ...fileKeys,
          ...attachments.map(({ uploadKey }) => uploadKey),
        ]),
      'deleting private files'
    );
  }

  /**
   * Approve a submission awaiting approval, as the approver loaded it. Its
   * attachments' files are published first (ADR-0027): if any cannot be, it
   * is not approved, and if the decision loses its race they are taken off
   * again. The first approval stamps `firstApprovedAt`; a re-approval never
   * moves it.
   */
  static async approve(
    approver: SubmissionActor,
    { submissionId, loadedUpdatedAt }: { submissionId: string; loadedUpdatedAt: string }
  ): Promise<SubmissionRecord> {
    const now = new Date();
    const from: SubmissionStatus[] = ['AWAITING_APPROVAL'];
    const stored = await SubmissionService.decidable(approver, {
      submissionId,
      from,
      refusal: NOT_AWAITING_MESSAGE,
    });

    const attachments = await SubmissionAttachmentRepository.listBySubmission(submissionId);
    const unready = unreadyAttachmentState(attachments);
    if (unready !== null) {
      throw new SubmissionRuleError(
        'INVALID_INPUT',
        unready === 'failed' ? APPROVE_FAILED_MESSAGE : APPROVE_PROCESSING_MESSAGE
      );
    }

    const fileKeys = attachments.flatMap(attachmentFileKeys);
    await SubmissionService.publishFiles(fileKeys);

    try {
      return await SubmissionService.writeDecision(
        stored,
        { from, loadedUpdatedAt },
        {
          status: 'APPROVED',
          approvedAt: now,
          approvedBy: approver.id,
          ...(stored.firstApprovedAt === null && { firstApprovedAt: now }),
        }
      );
    } catch (error) {
      await SubmissionService.unpublishUnlessApproved(submissionId, fileKeys);
      throw error;
    }
  }

  private static async publishFiles(fileKeys: string[]): Promise<void> {
    try {
      await attachmentStore.publish(fileKeys);
    } catch (error) {
      logger.error('[SubmissionService] publishing files failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SubmissionRuleError('UNAVAILABLE', PUBLISH_FILES_FAILED_MESSAGE);
    }
  }

  /**
   * Undo a publish whose approval was not written. Two approvers can approve
   * the same loaded submission at once: the one that lost must not take down
   * the files the other's approval now serves.
   */
  private static async unpublishUnlessApproved(
    submissionId: string,
    fileKeys: string[]
  ): Promise<void> {
    await afterWrite(async () => {
      const current = await SubmissionRepository.findById(submissionId);
      if (current?.status !== 'APPROVED') {
        await attachmentStore.unpublish(fileKeys);
      }
    }, 'taking files off the CDN');
  }

  /**
   * Reject a submission, before or after approval, with the reason its owner
   * reads. It goes offline at once, and every open report on it is handled:
   * a rejection is the answer to them.
   */
  static async reject(
    approver: SubmissionActor,
    {
      submissionId,
      loadedUpdatedAt,
      reason,
    }: { submissionId: string; loadedUpdatedAt: string; reason: string }
  ): Promise<SubmissionRecord> {
    const stored = await SubmissionService.decidable(approver, {
      submissionId,
      from: REJECTABLE_STATUSES,
      refusal: NOT_REJECTABLE_MESSAGE,
    });
    const rejectedAt = new Date();
    const rejected = await SubmissionService.writeDecision(
      stored,
      { from: REJECTABLE_STATUSES, loadedUpdatedAt },
      { status: 'REJECTED', rejectedAt, rejectedBy: approver.id, rejectionReason: reason }
    );

    // It was public until this moment; its files go with it.
    if (stored.status === 'APPROVED') {
      await SubmissionService.unpublishFiles(submissionId);
    }

    // The rejection stands whether or not its reports could be marked.
    await afterWrite(async () => {
      await SubmissionReportRepository.markAllHandledFor(submissionId, {
        by: approver.id,
        at: rejectedAt,
      });
    }, 'marking reports handled');

    return rejected;
  }

  /**
   * The submission a decision is about, once the rules every decision shares
   * have passed: it exists, it is in a state the decision applies to, and a
   * manager is not deciding on their own.
   */
  private static async decidable(
    approver: SubmissionActor,
    {
      submissionId,
      from,
      refusal,
    }: { submissionId: string; from: SubmissionStatus[]; refusal: string }
  ): Promise<SubmissionWithOwnerRecord> {
    const stored = await SubmissionRepository.findByIdWithOwner(submissionId);
    if (!stored) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    if (!from.includes(stored.status)) {
      throw new SubmissionRuleError('INVALID_INPUT', refusal);
    }

    // An admin may decide on their own, so a label with one admin is not
    // stuck. A manager is a helper: theirs waits for another approver.
    if (stored.ownerId === approver.id && !isAdminRole(approver.role)) {
      throw new SubmissionRuleError('INVALID_INPUT', OWN_SUBMISSION_MESSAGE);
    }

    return stored;
  }

  /**
   * Write a decision on the content the approver loaded, then tell the owner.
   * A submission that has changed since is refused as `DUPLICATE`.
   */
  private static async writeDecision(
    stored: SubmissionWithOwnerRecord,
    { from, loadedUpdatedAt }: { from: SubmissionStatus[]; loadedUpdatedAt: string },
    decision: SubmissionDecisionData
  ): Promise<SubmissionRecord> {
    const decided = await SubmissionRepository.decide(
      stored.id,
      { statuses: from, updatedAt: new Date(loadedUpdatedAt) },
      decision
    );
    if (!decided) {
      throw new SubmissionRuleError('DUPLICATE', STALE_DECISION_MESSAGE);
    }

    await afterWrite(
      () => notifyOwnerOfDecision({ ...decided, owner: stored.owner }),
      'owner notice'
    );

    return decided;
  }

  /**
   * What one reader sees of a submission, or `null` when they may not open
   * it. A refusal is always `null`, never a reason, so a link does not reveal
   * that a submission exists.
   */
  static async getForViewer(
    submissionId: string,
    viewer: SubmissionActor | null
  ): Promise<SubmissionView | null> {
    const submission = await SubmissionRepository.findByIdWithOwner(submissionId);
    const kind = submission ? viewerKindFor(submission, viewer) : null;
    if (!submission || !kind) {
      return null;
    }

    const { owner, publishedAt, status } = submission;
    const isPublic = isPublicSubmission(submission);
    const attachments = await SubmissionAttachmentRepository.listBySubmission(submission.id);

    return {
      id: submission.id,
      ownerId: submission.ownerId,
      title: submission.title,
      category: submission.category,
      aboutHtml: submission.aboutHtml,
      writingHtml: submission.writingHtml,
      links: submission.links,
      listed: submission.listed,
      status,
      rejectionReason: submission.rejectionReason,
      publishedAt,
      updatedAt: submission.updatedAt,
      owner: { username: owner.username, gravatarHash: gravatarHash(owner.email) },
      viewer: kind,
      isPublic,
      // An approver reads the queue itself; the position is for the owner.
      queuePosition: kind === 'owner' ? await SubmissionService.queuePositionOf(submission) : null,
      attachments: await attachmentViewsFor(attachments, {
        isPublic,
        showFileNames: kind !== 'public',
      }),
    };
  }

  /**
   * The card picture of each listed submission, by id, for a list its owner
   * or an approver reads. An approved submission's files are on the CDN, so
   * its picture comes from there; any other is a signed link. A submission
   * with no picture has no entry.
   */
  static async cardPictures(
    submissions: Array<Pick<SubmissionRecord, 'id' | 'status'>>
  ): Promise<Map<string, string>> {
    const attachments = await SubmissionAttachmentRepository.listBySubmissions(
      submissions.map(({ id }) => id)
    );
    const pictures = await Promise.all(
      submissions.map(async ({ id, status }) => ({
        id,
        url: await cardPictureUrlFor(
          attachments.filter(({ submissionId }) => submissionId === id),
          { isPublic: status === 'APPROVED' }
        ),
      }))
    );

    return new Map(
      pictures.flatMap(({ id, url }): Array<[string, string]> => (url === null ? [] : [[id, url]]))
    );
  }

  /** Every submission an owner holds, in any state. */
  static async listMine(ownerId: string): Promise<SubmissionRecord[]> {
    return SubmissionRepository.findByOwner(ownerId);
  }

  /** One page of an approver's queue for a state. Rows carry no owner email. */
  static async listQueue(
    status: SubmissionStatus,
    page: { skip: number; take: number }
  ): Promise<{ rows: SubmissionQueueRow[]; total: number }> {
    const { submissions, total } = await SubmissionRepository.listByStatus(status, page);

    return {
      rows: submissions.map(({ owner, ...submission }) => ({
        id: submission.id,
        title: submission.title,
        category: submission.category,
        listed: submission.listed,
        status: submission.status,
        ownerUsername: owner.username,
        publishedAt: submission.publishedAt,
        approvedAt: submission.approvedAt,
        rejectedAt: submission.rejectedAt,
        updatedAt: submission.updatedAt,
      })),
      total,
    };
  }

  /** How many submissions are awaiting approval. */
  static async countAwaiting(): Promise<number> {
    return SubmissionRepository.countAwaiting();
  }

  /**
   * A submission's queue position: how many submissions awaiting approval
   * were published before it. `null` when it is not in the queue. A count,
   * never a promise of order.
   */
  static async queuePositionOf({
    status,
    publishedAt,
  }: Pick<SubmissionRecord, 'status' | 'publishedAt'>): Promise<number | null> {
    return status === 'AWAITING_APPROVAL' && publishedAt !== null
      ? SubmissionRepository.countAwaitingBefore(publishedAt)
      : null;
  }
}
