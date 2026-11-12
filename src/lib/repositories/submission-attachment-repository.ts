/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  AttachmentCreate,
  AttachmentWithSubmissionRecord,
  CreateAttachmentData,
  ReencodedAttachmentData,
  SubmissionAttachmentRecord,
} from '@/lib/types/domain/submission-attachment';

import { mayBeginRunWhere } from './_internal/async-job-where';
import { runQuery } from './_internal/map-prisma-error';
import { retryOnWriteConflict } from './_internal/write-conflict';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Query shapes and drift guards
// =============================================================================

/** What an attachment read carries of its submission: who owns it and where it stands. */
const submissionInclude = {
  submission: { select: { id: true, ownerId: true, status: true } },
} as const satisfies Prisma.SubmissionAttachmentInclude;

/** Upload order: when two rows share a moment, the id settles it. */
const uploadOrder = [
  { createdAt: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.SubmissionAttachmentOrderByWithRelationInput[];

// Fail `pnpm run typecheck` if a hand-written record drifts from its payload.
type _RecordDrift = AssertExact<
  SubmissionAttachmentRecord,
  Prisma.SubmissionAttachmentGetPayload<Record<string, never>>
>;
const _recordDrift: _RecordDrift = true;

type _WithSubmissionDrift = AssertExact<
  AttachmentWithSubmissionRecord,
  Prisma.SubmissionAttachmentGetPayload<{ include: typeof submissionInclude }>
>;
const _withSubmissionDrift: _WithSubmissionDrift = true;

/**
 * How many writers may race for one submission's cap before the last is
 * refused with the conflict. Several files dropped at once is the usual case.
 */
const CAP_ATTEMPTS = 5;

/** The two models an attachment write touches, on the client or inside a transaction. */
type AttachmentClient = Pick<typeof prisma, 'submission' | 'submissionAttachment'>;

/**
 * Move a submission's `updatedAt` on. An attachment is content (ADR-0025), so
 * every change to one must make a decision loaded before it stale. Inside a
 * transaction this write is also what serialises concurrent creates: on
 * MongoDB two transactions that only insert never conflict.
 */
const touchSubmission = async (tx: AttachmentClient, submissionId: string): Promise<void> => {
  await tx.submission.update({ where: { id: submissionId }, data: { updatedAt: new Date() } });
};

/**
 * Data-access layer for the `SubmissionAttachment` model. The only layer that
 * touches Prisma for attachments. Each row is also one re-encode job, so the
 * async job lifecycle's writes live here too (see the job runner).
 */
export class SubmissionAttachmentRepository {
  /**
   * Create an attachment unless its submission already holds `cap`. The
   * count and the insert are one transaction serialised per submission.
   */
  static async createWithinCap(data: CreateAttachmentData, cap: number): Promise<AttachmentCreate> {
    const created = await retryOnWriteConflict(
      () =>
        runQuery(() =>
          prisma.$transaction(async (tx) => {
            await touchSubmission(tx, data.submissionId);
            const held = await tx.submissionAttachment.count({
              where: { submissionId: data.submissionId },
            });

            return held >= cap ? null : tx.submissionAttachment.create({ data });
          })
        ),
      CAP_ATTEMPTS
    );

    return created ? { status: 'created', attachment: created } : { status: 'full' };
  }

  /** Find an attachment by id. Returns `null` when not found. */
  static async findById(id: string): Promise<SubmissionAttachmentRecord | null> {
    return prisma.submissionAttachment.findUnique({ where: { id } });
  }

  /** Find an attachment with the owner and state of its submission. */
  static async findWithSubmission(id: string): Promise<AttachmentWithSubmissionRecord | null> {
    return prisma.submissionAttachment.findUnique({ where: { id }, include: submissionInclude });
  }

  /** A submission's attachments, in upload order. */
  static async listBySubmission(submissionId: string): Promise<SubmissionAttachmentRecord[]> {
    return prisma.submissionAttachment.findMany({ where: { submissionId }, orderBy: uploadOrder });
  }

  /** Every attachment of several submissions, in upload order. */
  static async listBySubmissions(submissionIds: string[]): Promise<SubmissionAttachmentRecord[]> {
    if (submissionIds.length === 0) {
      return [];
    }

    return prisma.submissionAttachment.findMany({
      where: { submissionId: { in: submissionIds } },
      orderBy: uploadOrder,
    });
  }

  /** Delete an attachment and move its submission on, in one transaction. */
  static async remove(id: string, submissionId: string): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.submissionAttachment.delete({ where: { id } });
        await touchSubmission(tx, submissionId);
      })
    );
  }

  /**
   * Mark the re-encode `pending`, recording its start in the same write: the
   * stale window reads an in-flight job with no start as abandoned.
   */
  static async markReencodePending(id: string, startedAt: Date): Promise<void> {
    await prisma.submissionAttachment.update({
      where: { id },
      data: {
        reencodeStatus: 'pending',
        reencodeStartedAt: startedAt,
        reencodeError: null,
        reencodeProgress: null,
      },
    });
  }

  /**
   * Begin a re-encode run with one conditional write (`mayBeginRunWhere`, the
   * runner gate as a `where`). Returns true iff this caller began it.
   */
  static async beginReencodeRun(id: string, now: Date): Promise<boolean> {
    const { count } = await prisma.submissionAttachment.updateMany({
      where: { id, AND: [mayBeginRunWhere('reencodeStatus', 'reencodeStartedAt', now)] },
      data: { reencodeStatus: 'processing', reencodeStartedAt: now, reencodeError: null },
    });

    return count === 1;
  }

  /** Set, or clear with `null`, the per-job callback token. */
  static async setReencodeJobToken(id: string, token: string | null): Promise<void> {
    await prisma.submissionAttachment.update({ where: { id }, data: { reencodeJobToken: token } });
  }

  /**
   * Claim the job iff the stored token matches and the job is still
   * processing, clearing the single-use token so only one callback wins.
   */
  static async claimReencodeJobToken(id: string, token: string): Promise<boolean> {
    const { count } = await prisma.submissionAttachment.updateMany({
      where: { id, reencodeJobToken: token, reencodeStatus: 'processing' },
      data: { reencodeJobToken: null },
    });

    return count === 1;
  }

  /** Store the latest progress checkpoint, validated upstream. */
  static async setReencodeProgress(id: string, progress: Prisma.InputJsonValue): Promise<void> {
    await prisma.submissionAttachment.update({
      where: { id },
      data: { reencodeProgress: progress },
    });
  }

  /** Mark the re-encode failed with the reason it gave. */
  static async recordReencodeFailed(id: string, error: string): Promise<void> {
    await prisma.submissionAttachment.update({
      where: { id },
      data: { reencodeStatus: 'failed', reencodeError: error },
    });
  }

  /**
   * Store what a re-encode wrote and mark it succeeded. The submission moves
   * on with it: an approver who loaded the page while the file was still
   * processing has not seen it, and must reload before deciding.
   */
  static async recordReencoded(id: string, data: ReencodedAttachmentData): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        const { submissionId } = await tx.submissionAttachment.update({
          where: { id },
          data: { ...data, reencodeStatus: 'succeeded', reencodeError: null },
        });
        await touchSubmission(tx, submissionId);
      })
    );
  }
}
