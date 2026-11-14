/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import type { SubmissionStatus } from '@/lib/constants/submissions';
import { prisma } from '@/lib/prisma';
import type {
  CreateSubmissionData,
  SubmissionDecisionData,
  SubmissionQueuePage,
  SubmissionRecord,
  SubmissionWithOwnerRecord,
  SubmissionWrite,
  UpdateSubmissionData,
} from '@/lib/types/domain/submission';

import { runQuery } from './_internal/map-prisma-error';
import { submissionWhere } from './_internal/submission-where';
import { retryOnWriteConflict } from './_internal/write-conflict';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

export { isPublicSubmission } from './_internal/submission-where';

// =============================================================================
// Query shapes and drift guards
// =============================================================================

/** What a submission read carries of its owner; the email never leaves the server. */
const ownerInclude = {
  owner: { select: { id: true, username: true, email: true, banned: true } },
} as const satisfies Prisma.SubmissionInclude;

// Fail `pnpm run typecheck` if a hand-written record drifts from its payload.
type _RecordDrift = AssertExact<
  SubmissionRecord,
  Prisma.SubmissionGetPayload<Record<string, never>>
>;
const _recordDrift: _RecordDrift = true;

type _WithOwnerDrift = AssertExact<
  SubmissionWithOwnerRecord,
  Prisma.SubmissionGetPayload<{ include: typeof ownerInclude }>
>;
const _withOwnerDrift: _WithOwnerDrift = true;

/**
 * How many writers may race for one owner's cap before the last is refused
 * with the conflict. An owner saving from two tabs is the realistic case.
 */
const CAP_ATTEMPTS = 3;

/**
 * The two models a submission write reads and writes. Both the client and the
 * client a transaction hands its callback satisfy it, so one helper serves a
 * plain write and a transactional one.
 */
type SubmissionClient = Pick<typeof prisma, 'submission' | 'user'>;

/**
 * Whether the owner already holds `cap` unapproved submissions. It first
 * writes the owner's row: on MongoDB two transactions that only insert never
 * conflict, so without a shared write two concurrent saves could both count
 * four and both pass. Touching the owner makes the second one lose the write
 * conflict and run again, after the first has committed.
 */
const isAtCap = async (tx: SubmissionClient, ownerId: string, cap: number): Promise<boolean> => {
  await tx.user.update({ where: { id: ownerId }, data: { updatedAt: new Date() } });
  const unapproved = await tx.submission.count({
    where: { ownerId, AND: [submissionWhere.unapproved] },
  });
  return unapproved >= cap;
};

/** The submission an owner's write is aimed at, and the state it must still be in. */
export interface OwnedSubmissionTarget {
  id: string;
  ownerId: string;
  expected: SubmissionStatus;
}

/** The order an approver reads each state's queue in. */
const queueOrderFor = (status: SubmissionStatus): Prisma.SubmissionOrderByWithRelationInput => {
  if (status === 'AWAITING_APPROVAL') {
    // Oldest first: the queue position an owner is shown counts the same way.
    return { publishedAt: 'asc' };
  }

  if (status === 'APPROVED') {
    return { approvedAt: 'desc' };
  }

  return status === 'REJECTED' ? { rejectedAt: 'desc' } : { updatedAt: 'desc' };
};

/**
 * Data-access layer for the `Submission` model (ADR-0025). The only layer that
 * touches Prisma for submissions. Every owner write is scoped to the owner
 * and to the state it expects, so a row another request already moved is
 * reported as stale instead of being overwritten; an approver's decision is
 * scoped to the `updatedAt` the approver loaded.
 */
export class SubmissionRepository {
  /**
   * Create a submission unless its owner already holds `cap` unapproved ones.
   * The count and the insert are one transaction serialised per owner.
   */
  static async createWithinCap(data: CreateSubmissionData, cap: number): Promise<SubmissionWrite> {
    const created = await retryOnWriteConflict(
      () =>
        runQuery(() =>
          prisma.$transaction(async (tx) =>
            (await isAtCap(tx, data.ownerId, cap)) ? null : tx.submission.create({ data })
          )
        ),
      CAP_ATTEMPTS
    );

    return created ? { status: 'written', submission: created } : { status: 'full' };
  }

  /** Find a submission by id. Returns `null` when not found. */
  static async findById(id: string): Promise<SubmissionRecord | null> {
    return prisma.submission.findUnique({ where: { id } });
  }

  /** Find a submission by id with its owner. Returns `null` when not found. */
  static async findByIdWithOwner(id: string): Promise<SubmissionWithOwnerRecord | null> {
    return prisma.submission.findUnique({ where: { id }, include: ownerInclude });
  }

  /**
   * The named submissions with their owners, in no promised order: the rows
   * behind a list that was ordered by something else, such as open reports.
   */
  static async findManyWithOwnerByIds(ids: string[]): Promise<SubmissionWithOwnerRecord[]> {
    if (ids.length === 0) {
      return [];
    }

    return prisma.submission.findMany({ where: { id: { in: ids } }, include: ownerInclude });
  }

  /** Every submission an owner holds, in any state, most recently changed first. */
  static async findByOwner(ownerId: string): Promise<SubmissionRecord[]> {
    return prisma.submission.findMany({ where: { ownerId }, orderBy: { updatedAt: 'desc' } });
  }

  /**
   * Write an owner's save onto a submission that is still theirs and still in
   * `expected`. Pass `cap` when the write turns an approved submission back
   * into an unapproved one: it then counts against the owner's cap, in the
   * same serialised transaction as {@link createWithinCap}.
   */
  static async updateOwned(
    { id, ownerId, expected }: OwnedSubmissionTarget,
    data: UpdateSubmissionData,
    cap?: number
  ): Promise<SubmissionWrite> {
    const write = async (client: SubmissionClient): Promise<SubmissionWrite> => {
      const { count } = await client.submission.updateMany({
        where: { id, ownerId, status: expected },
        data,
      });
      if (count === 0) {
        return { status: 'stale' };
      }

      const submission = await client.submission.findUnique({ where: { id } });
      return submission ? { status: 'written', submission } : { status: 'stale' };
    };

    if (cap === undefined) {
      return runQuery(() => write(prisma));
    }

    return retryOnWriteConflict(
      () =>
        runQuery(() =>
          prisma.$transaction(async (tx): Promise<SubmissionWrite> =>
            (await isAtCap(tx, ownerId, cap)) ? { status: 'full' } : write(tx)
          )
        ),
      CAP_ATTEMPTS
    );
  }

  /**
   * Switch an approved submission between listed and unlisted. Not a content
   * edit, so the state does not change. Returns `null` when the submission is
   * not this owner's or is not approved.
   */
  static async setListed(
    id: string,
    ownerId: string,
    listed: boolean
  ): Promise<SubmissionRecord | null> {
    const { count } = await prisma.submission.updateMany({
      where: { id, ownerId, status: 'APPROVED' },
      data: { listed },
    });

    return count === 0 ? null : prisma.submission.findUnique({ where: { id } });
  }

  /**
   * Write an approver's decision, only while the submission is in one of
   * `expected.statuses` and its `updatedAt` is still the one the approver
   * loaded. Returns `null` when it has changed since, so an approver never
   * decides on content they did not see.
   */
  static async decide(
    id: string,
    expected: { statuses: SubmissionStatus[]; updatedAt: Date },
    data: SubmissionDecisionData
  ): Promise<SubmissionRecord | null> {
    const { count } = await prisma.submission.updateMany({
      where: { id, status: { in: expected.statuses }, updatedAt: expected.updatedAt },
      data,
    });

    return count === 0 ? null : prisma.submission.findUnique({ where: { id } });
  }

  /** Delete an owner's submission, in any state. Says whether a row was deleted. */
  static async deleteOwned(id: string, ownerId: string): Promise<boolean> {
    const { count } = await prisma.submission.deleteMany({ where: { id, ownerId } });

    return count > 0;
  }

  /** One page of the submissions in a state, with their owners, in queue order. */
  static async listByStatus(
    status: SubmissionStatus,
    { skip, take }: { skip: number; take: number }
  ): Promise<SubmissionQueuePage> {
    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where: { status },
        include: ownerInclude,
        orderBy: queueOrderFor(status),
        skip,
        take,
      }),
      prisma.submission.count({ where: { status } }),
    ]);

    return { submissions, total };
  }

  /**
   * How many submissions awaiting approval were published before `moment`:
   * a submission's queue position, and with a cutoff, how many are overdue.
   */
  static async countAwaitingBefore(moment: Date): Promise<number> {
    return prisma.submission.count({
      where: { ...submissionWhere.awaitingApproval, publishedAt: { lt: moment } },
    });
  }

  /** How many submissions are awaiting approval. */
  static async countAwaiting(): Promise<number> {
    return prisma.submission.count({ where: submissionWhere.awaitingApproval });
  }
}
