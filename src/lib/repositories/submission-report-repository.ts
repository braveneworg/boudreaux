/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  CreateSubmissionReportData,
  ReportedSubmissionGroup,
  ReportedSubmissionsPage,
  SubmissionReportHandling,
  SubmissionReportRecord,
  SubmissionReportTargetRecord,
} from '@/lib/types/domain/submission-report';

import { runQuery } from './_internal/map-prisma-error';
import { submissionReportWhere } from './_internal/submission-report-where';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// =============================================================================
// Query shapes and drift guards
// =============================================================================

/** What the handling rules read of a report: whether it is open, and whose submission it is on. */
const targetSelect = {
  id: true,
  handled: true,
  submissionId: true,
  submission: { select: { ownerId: true } },
} as const satisfies Prisma.SubmissionReportSelect;

// Fail `pnpm run typecheck` if a hand-written record drifts from its payload.
type _RecordDrift = AssertExact<
  SubmissionReportRecord,
  Prisma.SubmissionReportGetPayload<Record<string, never>>
>;
const _recordDrift: _RecordDrift = true;

type _TargetDrift = AssertExact<
  SubmissionReportTargetRecord,
  Prisma.SubmissionReportGetPayload<{ select: typeof targetSelect }>
>;
const _targetDrift: _TargetDrift = true;

/** The open reports the Reported tab reads, without one owner's submissions when asked. */
const reportedWhere = (exceptOwnerId: string | undefined): Prisma.SubmissionReportWhereInput => ({
  ...submissionReportWhere.open,
  ...(exceptOwnerId !== undefined && {
    submission: { is: { ownerId: { not: exceptOwnerId } } },
  }),
});

/**
 * Data-access layer for the `SubmissionReport` model (ADR-0025, ADR-0028).
 * The only layer that touches Prisma for reports. Nothing here reads or
 * writes who filed a report: the model has nowhere to keep it.
 */
export class SubmissionReportRepository {
  /** Store a report, open. */
  static async create(data: CreateSubmissionReportData): Promise<SubmissionReportRecord> {
    return runQuery(() => prisma.submissionReport.create({ data }));
  }

  /** How many open reports a submission holds. */
  static async countOpenFor(submissionId: string): Promise<number> {
    return prisma.submissionReport.count({
      where: { submissionId, ...submissionReportWhere.open },
    });
  }

  /** How many reports are open, on any submission. */
  static async countOpen(): Promise<number> {
    return prisma.submissionReport.count({ where: submissionReportWhere.open });
  }

  /** Every report on a submission: the open ones first, each group newest first. */
  static async listBySubmission(submissionId: string): Promise<SubmissionReportRecord[]> {
    return prisma.submissionReport.findMany({
      where: { submissionId },
      orderBy: [{ handled: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** A report with its submission's owner. Returns `null` when not found. */
  static async findTarget(id: string): Promise<SubmissionReportTargetRecord | null> {
    return prisma.submissionReport.findUnique({ where: { id }, select: targetSelect });
  }

  /**
   * Mark an open report handled. Says whether this call was the one that
   * handled it: `false` when it was handled already, so the first approver's
   * name and time are never overwritten by a second press.
   */
  static async markHandled(id: string, { by, at }: SubmissionReportHandling): Promise<boolean> {
    const { count } = await runQuery(() =>
      prisma.submissionReport.updateMany({
        where: { id, ...submissionReportWhere.open },
        data: { handled: true, handledAt: at, handledBy: by },
      })
    );

    return count > 0;
  }

  /** Mark every open report on a submission handled. Returns how many there were. */
  static async markAllHandledFor(
    submissionId: string,
    { by, at }: SubmissionReportHandling
  ): Promise<number> {
    const { count } = await runQuery(() =>
      prisma.submissionReport.updateMany({
        where: { submissionId, ...submissionReportWhere.open },
        data: { handled: true, handledAt: at, handledBy: by },
      })
    );

    return count;
  }

  /**
   * One page of the submissions that hold an open report, the one with the
   * oldest open report first, each with its open count. Pass `exceptOwnerId`
   * to leave out the submissions of one owner: a manager is not shown the
   * reports against their own (ADR-0028).
   */
  static async listReportedSubmissions({
    skip,
    take,
    exceptOwnerId,
  }: {
    skip: number;
    take: number;
    exceptOwnerId?: string;
  }): Promise<ReportedSubmissionsPage> {
    const [page, total] = await Promise.all([
      prisma.submissionReport.groupBy({
        by: ['submissionId'],
        where: reportedWhere(exceptOwnerId),
        _count: { _all: true },
        _min: { createdAt: true },
        // The id breaks a tie, so two pages never show one submission twice.
        orderBy: [{ _min: { createdAt: 'asc' } }, { submissionId: 'asc' }],
        skip,
        take,
      }),
      SubmissionReportRepository.countReportedSubmissions(exceptOwnerId),
    ]);

    return {
      groups: page.flatMap(({ submissionId, _count, _min }): ReportedSubmissionGroup[] =>
        _min.createdAt === null
          ? []
          : [{ submissionId, openReports: _count._all, oldestReportAt: _min.createdAt }]
      ),
      total,
    };
  }

  /**
   * How many submissions hold an open report, without one owner's when asked
   * to: the Reported tab's count, and its total across pages.
   */
  static async countReportedSubmissions(exceptOwnerId?: string): Promise<number> {
    const groups = await prisma.submissionReport.groupBy({
      by: ['submissionId'],
      where: reportedWhere(exceptOwnerId),
    });

    return groups.length;
  }

  /**
   * Erase the contact email from every report filed before `cutoff` that
   * still holds one (ADR-0028). The reports stay. Returns how many were
   * erased.
   */
  static async eraseContactsFiledBefore(cutoff: Date): Promise<number> {
    const { count } = await runQuery(() =>
      prisma.submissionReport.updateMany({
        where: submissionReportWhere.contactFiledBefore(cutoff),
        data: { contactEmail: null },
      })
    );

    return count;
  }
}
