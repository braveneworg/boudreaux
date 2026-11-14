/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  MAX_OPEN_REPORTS_PER_SUBMISSION,
  REPORT_CONTACT_RETENTION_DAYS,
} from '@/lib/constants/submissions';
import { SubmissionReportRepository } from '@/lib/repositories/submission-report-repository';
import { isPublicSubmission, SubmissionRepository } from '@/lib/repositories/submission-repository';
import { UserRepository } from '@/lib/repositories/user-repository';
import { notifyApproversOfReport } from '@/lib/services/submission-notices';
import { SubmissionRuleError } from '@/lib/services/submission-service';
import type { SubmissionActor, SubmissionWithOwnerRecord } from '@/lib/types/domain/submission';
import type {
  CreateSubmissionReportData,
  FiledSubmissionReport,
  ReportedSubmissionRow,
  SubmissionReportRecord,
  SubmissionReportView,
} from '@/lib/types/domain/submission-report';
import { loggers } from '@/lib/utils/logger';
import { isAdminRole } from '@/lib/utils/roles';
import {
  allowSubmissionReportNotice,
  checkSubmissionReportRateLimit,
} from '@/lib/utils/submission-report-rate-limit';
import type { SubmissionReportLimit } from '@/lib/utils/submission-report-rate-limit';

const logger = loggers.notifications;

const NOT_FOUND_MESSAGE = 'Report not found.';

const ALREADY_REPORTED_MESSAGE =
  'You have already reported this submission. Our team has your report.';
const TOO_MANY_REPORTS_MESSAGE =
  'You have sent several reports today. Try again tomorrow, or write to us through the contact page.';

/** What a reporter is told when a limit refuses their report. */
const limitMessageFor = (limit: SubmissionReportLimit): string =>
  limit === 'submission' ? ALREADY_REPORTED_MESSAGE : TOO_MANY_REPORTS_MESSAGE;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether an approver is kept from a submission's reports: a manager, on a
 * submission of their own. They cannot decide on it (ADR-0025), and a
 * report's note can name its reporter (ADR-0028). An admin never is, so a
 * label with one admin is not stuck.
 */
const isKeptFrom = (ownerId: string, { id, role }: SubmissionActor): boolean =>
  ownerId === id && !isAdminRole(role);

/**
 * Business rules for submission reports (ADR-0025, ADR-0028): who may file
 * one and how often, who is told, who may read what, and how one is handled.
 * Nothing here writes to a submission. A report informs approvers; only an
 * approver's rejection takes a submission offline.
 */
export class SubmissionReportService {
  /**
   * File a report against a public submission and tell approvers.
   *
   * A report against anything that is not a public submission, or against
   * one that already holds the most open reports, is not stored and still
   * reads as sent: the answer never says whether an id names a submission.
   * The limits are asked only once the submission is known to be public, so
   * a limit's answer cannot be used to probe an id either.
   *
   * @param reporterKey - The signed-in account, else the visitor fingerprint
   *   hash. Handed to the rate limiter and never stored.
   * @throws SubmissionRuleError `LIMIT_EXCEEDED` when the reporter has
   *   already reported this submission, or has filed too many today.
   */
  static async file(
    data: CreateSubmissionReportData,
    reporterKey: string
  ): Promise<FiledSubmissionReport> {
    const { submissionId, reason } = data;
    const submission = await SubmissionRepository.findByIdWithOwner(submissionId);
    if (!submission || !isPublicSubmission(submission)) {
      return { stored: false };
    }

    const { blockedBy } = await checkSubmissionReportRateLimit({ reporterKey, submissionId });
    if (blockedBy !== null) {
      throw new SubmissionRuleError('LIMIT_EXCEEDED', limitMessageFor(blockedBy));
    }

    const open = await SubmissionReportRepository.countOpenFor(submissionId);
    if (open >= MAX_OPEN_REPORTS_PER_SUBMISSION) {
      return { stored: false };
    }

    const report = await SubmissionReportRepository.create(data);
    await SubmissionReportService.tellApprovers(submission, reason);

    return { stored: true, report };
  }

  /**
   * Tell approvers about a stored report, unless this submission has had its
   * notices for the day. The report is already stored, so nothing here may
   * fail it: a failure is logged, without anything the reporter typed.
   */
  private static async tellApprovers(
    submission: SubmissionWithOwnerRecord,
    reason: CreateSubmissionReportData['reason']
  ): Promise<void> {
    try {
      if (await allowSubmissionReportNotice(submission.id)) {
        await notifyApproversOfReport(submission, reason);
      }
    } catch (error) {
      logger.error('[SubmissionReportService] report notice failed', {
        submissionId: submission.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * A submission's reports as one approver reads them, open first, or `null`
   * for a manager on their own submission. The contact email is set only for
   * an admin; a manager learns that one was left.
   */
  static async listForSubmission(
    { id, ownerId }: { id: string; ownerId: string },
    reader: SubmissionActor
  ): Promise<SubmissionReportView[] | null> {
    if (isKeptFrom(ownerId, reader)) {
      return null;
    }

    const reports = await SubmissionReportRepository.listBySubmission(id);
    const handlers = await SubmissionReportService.usernamesOf(reports);
    const seesContact = isAdminRole(reader.role);

    return reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      note: report.note,
      createdAt: report.createdAt,
      handled: report.handled,
      handledAt: report.handledAt,
      handledByUsername: handlers.get(report.handledBy ?? '') ?? null,
      hasContact: report.contactEmail !== null,
      contactEmail: seesContact ? report.contactEmail : null,
    }));
  }

  /** The username of each approver who handled one of `reports`, by id. */
  private static async usernamesOf(
    reports: SubmissionReportRecord[]
  ): Promise<Map<string, string | null>> {
    const ids = [
      ...new Set(reports.flatMap(({ handledBy }) => (handledBy === null ? [] : [handledBy]))),
    ];
    const users = await UserRepository.findUsernamesByIds(ids);

    return new Map(users.map(({ id, username }) => [id, username]));
  }

  /**
   * Mark a report handled by this approver. It changes the report and
   * nothing else. A report another approver already handled succeeds and is
   * left as they marked it.
   *
   * @returns The submission the report is on, for the pages to refresh.
   * @throws SubmissionRuleError `NOT_FOUND` when no such report exists, and
   *   for a manager on their own submission, who is not shown that it does.
   */
  static async markHandled(
    approver: SubmissionActor,
    reportId: string
  ): Promise<{ submissionId: string }> {
    const target = await SubmissionReportRepository.findTarget(reportId);
    if (!target || isKeptFrom(target.submission.ownerId, approver)) {
      throw new SubmissionRuleError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    await SubmissionReportRepository.markHandled(reportId, { by: approver.id, at: new Date() });

    return { submissionId: target.submissionId };
  }

  /**
   * One page of the Reported tab: the submissions that hold an open report,
   * the one with the oldest open report first. A manager's own submissions
   * are left out of what they read.
   */
  static async listReported(
    reader: SubmissionActor,
    page: { skip: number; take: number }
  ): Promise<{ rows: ReportedSubmissionRow[]; total: number }> {
    const { groups, total } = await SubmissionReportRepository.listReportedSubmissions({
      ...page,
      ...(!isAdminRole(reader.role) && { exceptOwnerId: reader.id }),
    });
    const submissions = await SubmissionRepository.findManyWithOwnerByIds(
      groups.map(({ submissionId }) => submissionId)
    );
    const byId = new Map(submissions.map((submission) => [submission.id, submission]));

    return {
      // In the groups' order; a submission deleted between the two reads has no row.
      rows: groups.flatMap(({ submissionId, openReports, oldestReportAt }) => {
        const submission = byId.get(submissionId);

        return submission
          ? [
              {
                id: submission.id,
                title: submission.title,
                category: submission.category,
                status: submission.status,
                ownerUsername: submission.owner.username,
                openReports,
                oldestReportAt,
              },
            ]
          : [];
      }),
      total,
    };
  }

  /**
   * How many submissions hold an open report, as this approver's Reported
   * tab counts them: a manager's own are left out.
   */
  static async countReported(reader: SubmissionActor): Promise<number> {
    return SubmissionReportRepository.countReportedSubmissions(
      isAdminRole(reader.role) ? undefined : reader.id
    );
  }

  /** How many reports are open, on any submission. */
  static async countOpen(): Promise<number> {
    return SubmissionReportRepository.countOpen();
  }

  /**
   * Erase the contact email from every report filed more than
   * {@link REPORT_CONTACT_RETENTION_DAYS} days before `now` (ADR-0028). The
   * reports stay.
   *
   * @param now - The moment to judge from; nothing here reads the clock.
   * @returns How many contact emails were erased.
   */
  static async eraseExpiredContacts(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - REPORT_CONTACT_RETENTION_DAYS * MS_PER_DAY);

    return SubmissionReportRepository.eraseContactsFiledBefore(cutoff);
  }
}
