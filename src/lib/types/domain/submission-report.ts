/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type {
  SubmissionCategory,
  SubmissionReportReason,
  SubmissionStatus,
} from '@/lib/constants/submissions';

/**
 * Domain types for submission reports (ADR-0025, ADR-0028). The record types
 * are the repository's read models: each is bound to its Prisma `select` by a
 * drift guard in `submission-report-repository.ts`. Nothing here names a
 * reporter, because nothing about one is stored.
 */

/** The scalar fields of a stored report. */
export interface SubmissionReportRecord {
  id: string;
  submissionId: string;
  reason: SubmissionReportReason;
  /** Plain text, as the reporter typed it. Never HTML. */
  note: string;
  /** Left by choice; read by admins only; erased 90 days after filing. */
  contactEmail: string | null;
  handled: boolean;
  handledAt: Date | null;
  handledBy: string | null;
  createdAt: Date;
}

/** What the repository needs to store a report. */
export interface CreateSubmissionReportData {
  submissionId: string;
  reason: SubmissionReportReason;
  note: string;
  contactEmail: string | null;
}

/** A report with what the handling rules read of its submission. */
export interface SubmissionReportTargetRecord {
  id: string;
  handled: boolean;
  submissionId: string;
  submission: { ownerId: string };
}

/** Who handled a report and when. */
export interface SubmissionReportHandling {
  by: string;
  at: Date;
}

/** One submission's open reports, as the Reported tab counts them. */
export interface ReportedSubmissionGroup {
  submissionId: string;
  openReports: number;
  oldestReportAt: Date;
}

/** One page of the submissions that hold an open report, oldest report first. */
export interface ReportedSubmissionsPage {
  groups: ReportedSubmissionGroup[];
  /** How many submissions hold an open report, across every page. */
  total: number;
}

/**
 * One report as an approver reads it. Built for one reader: `contactEmail`
 * is set only for an admin, and `hasContact` is all a manager learns of it.
 */
export interface SubmissionReportView {
  id: string;
  reason: SubmissionReportReason;
  note: string;
  createdAt: Date;
  handled: boolean;
  handledAt: Date | null;
  /** The approver who handled it, when they still have a username. */
  handledByUsername: string | null;
  hasContact: boolean;
  contactEmail: string | null;
}

/** One row of the Reported tab. */
export interface ReportedSubmissionRow {
  id: string;
  title: string;
  category: SubmissionCategory;
  status: SubmissionStatus;
  ownerUsername: string | null;
  openReports: number;
  oldestReportAt: Date;
}

/** What filing a report did. A report that is not stored still reads as sent. */
export type FiledSubmissionReport =
  | { stored: true; report: SubmissionReportRecord }
  /** The submission is not public, or already holds the most open reports. */
  | { stored: false };
