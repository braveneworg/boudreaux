/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  MAX_SUBMISSION_LINKS,
  MAX_UNAPPROVED_SUBMISSIONS,
  OPEN_SUBMISSION_CATEGORIES,
  SUBMISSION_ABOUT_MAX,
  SUBMISSION_WRITING_MAX,
  UPLOAD_AGREEMENT_VERSION,
} from '@/lib/constants/submissions';
import type { SubmissionCategory, SubmissionStatus } from '@/lib/constants/submissions';
import { isPublicSubmission, SubmissionRepository } from '@/lib/repositories/submission-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
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
const CATEGORY_CLOSED_MESSAGE = 'That category is not open for submissions yet.';
const TITLE_REQUIRED_MESSAGE = 'Add a title before publishing.';
const WRITING_REQUIRED_MESSAGE = 'Add your writing before publishing.';
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

const isOpenCategory = (category: SubmissionCategory): boolean =>
  OPEN_SUBMISSION_CATEGORIES.some((open) => open === category);

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
const contentFrom = (
  { title, category, aboutHtml, writingHtml, links }: SaveSubmissionData,
  publish: boolean
): SubmissionContent => {
  if (!isOpenCategory(category)) {
    throw new SubmissionRuleError('VALIDATION', CATEGORY_CLOSED_MESSAGE, 'category');
  }

  const content: SubmissionContent = {
    title,
    category,
    aboutHtml: sanitizeSubmissionAbout(aboutHtml),
    writingHtml: sanitizeSubmissionWriting(writingHtml),
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

  if (publish && title === '') {
    throw new SubmissionRuleError('VALIDATION', TITLE_REQUIRED_MESSAGE, 'title');
  }

  if (publish && writingLength === 0) {
    throw new SubmissionRuleError('VALIDATION', WRITING_REQUIRED_MESSAGE, 'writingHtml');
  }

  return content;
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

    const content = contentFrom(data, publish);

    // Recorded only once the content has passed, so a refused save leaves no
    // acceptance behind for a form the user never got through.
    if (!holdsAgreement) {
      await UserRepository.acceptUploadAgreement(owner.id, UPLOAD_AGREEMENT_VERSION, new Date());
    }

    const { submission, enteredQueue } =
      data.submissionId === undefined
        ? await SubmissionService.create(owner.id, content, data.listed, publish)
        : await SubmissionService.update(
            { id: data.submissionId, ownerId: owner.id },
            { content, listed: data.listed },
            publish
          );

    if (enteredQueue) {
      await afterWrite(() => notifyApproversOfSubmission(submission), 'approver notice');
    }

    return submission;
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
    { id, ownerId }: { id: string; ownerId: string },
    { content, listed }: { content: SubmissionContent; listed: boolean },
    publish: boolean
  ): Promise<{ submission: SubmissionRecord; enteredQueue: boolean }> {
    const stored = await SubmissionRepository.findById(id);
    if (!stored || stored.ownerId !== ownerId) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

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
      // It becomes unapproved again, so it counts against the cap again.
      const write = await SubmissionRepository.updateOwned(
        { id, ownerId, expected: 'APPROVED' },
        { ...content, listed, status: 'AWAITING_APPROVAL', publishedAt: new Date() },
        MAX_UNAPPROVED_SUBMISSIONS
      );

      return { submission: recordFrom(write), enteredQueue: true };
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

  /** Delete an owner's submission, in any state. */
  static async delete(ownerId: string, submissionId: string): Promise<void> {
    if (!(await SubmissionRepository.deleteOwned(submissionId, ownerId))) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }
  }

  /**
   * Approve a submission awaiting approval, as the approver loaded it. The
   * first approval stamps `firstApprovedAt`; a re-approval never moves it.
   */
  static async approve(
    approver: SubmissionActor,
    { submissionId, loadedUpdatedAt }: { submissionId: string; loadedUpdatedAt: string }
  ): Promise<SubmissionRecord> {
    const now = new Date();

    return SubmissionService.decide(
      approver,
      { submissionId, loadedUpdatedAt, from: ['AWAITING_APPROVAL'], refusal: NOT_AWAITING_MESSAGE },
      ({ firstApprovedAt }) => ({
        status: 'APPROVED',
        approvedAt: now,
        approvedBy: approver.id,
        ...(firstApprovedAt === null && { firstApprovedAt: now }),
      })
    );
  }

  /**
   * Reject a submission, before or after approval, with the reason its owner
   * reads. It goes offline at once.
   */
  static async reject(
    approver: SubmissionActor,
    {
      submissionId,
      loadedUpdatedAt,
      reason,
    }: { submissionId: string; loadedUpdatedAt: string; reason: string }
  ): Promise<SubmissionRecord> {
    return SubmissionService.decide(
      approver,
      {
        submissionId,
        loadedUpdatedAt,
        from: REJECTABLE_STATUSES,
        refusal: NOT_REJECTABLE_MESSAGE,
      },
      () => ({
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectedBy: approver.id,
        rejectionReason: reason,
      })
    );
  }

  /**
   * The rules every decision shares: the submission exists and is in a state
   * the decision applies to, a manager is not deciding on their own, and the
   * content is still what the approver loaded. Then the owner is told.
   */
  private static async decide(
    approver: SubmissionActor,
    {
      submissionId,
      loadedUpdatedAt,
      from,
      refusal,
    }: { submissionId: string; loadedUpdatedAt: string; from: SubmissionStatus[]; refusal: string },
    decisionFor: (stored: SubmissionWithOwnerRecord) => SubmissionDecisionData
  ): Promise<SubmissionRecord> {
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

    const decided = await SubmissionRepository.decide(
      submissionId,
      { statuses: from, updatedAt: new Date(loadedUpdatedAt) },
      decisionFor(stored)
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
      isPublic: isPublicSubmission(submission),
      // An approver reads the queue itself; the position is for the owner.
      queuePosition: kind === 'owner' ? await SubmissionService.queuePositionOf(submission) : null,
    };
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
