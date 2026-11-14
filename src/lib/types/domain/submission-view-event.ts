/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Domain types for view events (ADR-0029): the stored form of a view
 * (CONTEXT.md). Named "view event" because `SubmissionView` already names
 * what a reader is shown of a submission. Nothing here names a viewer,
 * because nothing about one is stored.
 */

/** What the repository needs to store a view event. */
export interface RecordViewEventData {
  submissionId: string;
  /** SHA-256 of the submission, the viewer and the UTC day; unique. */
  viewKey: string;
  viewedAt: Date;
}

/** How many views a submission holds over some stretch of time. */
export interface SubmissionViewCount {
  submissionId: string;
  views: number;
}
