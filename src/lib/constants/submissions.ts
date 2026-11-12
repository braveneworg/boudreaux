/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { attachmentUploadLimitBytes } from '@fakefour/job-contract';

import type { AttachmentKind } from '@fakefour/job-contract';

/**
 * Client-safe constants for community submissions (ADR-0025): the categories
 * and states, every limit, the upload agreement and the reply-time promise.
 * Shared by the form (client), the validation schemas and the service
 * (server), so this module carries no `'server-only'` marker.
 */

/** Every category a submission can have, mirroring the Prisma enum. */
export const SUBMISSION_CATEGORIES = [
  'VIDEO',
  'COVER_SONG',
  'ORIGINAL_SONG',
  'INFORMATIONAL_VIDEO',
  'WRITING',
  'MUSIC_OR_LYRIC_VIDEO',
  'LIVE_PERFORMANCE',
  'PHOTO',
] as const;

export type SubmissionCategory = (typeof SUBMISSION_CATEGORIES)[number];

/** Each category with the label its dropdown option shows, in display order. */
export const SUBMISSION_CATEGORY_OPTIONS: ReadonlyArray<{
  value: SubmissionCategory;
  label: string;
}> = [
  { value: 'VIDEO', label: 'Video' },
  { value: 'COVER_SONG', label: 'Cover songs (audio and/or video)' },
  { value: 'ORIGINAL_SONG', label: 'Original songs (audio and/or video)' },
  {
    value: 'INFORMATIONAL_VIDEO',
    label: 'Informational video (community and shameless self-promotion)',
  },
  { value: 'WRITING', label: 'Writings (lyrics, poetry, prose, and blurbs)' },
  { value: 'MUSIC_OR_LYRIC_VIDEO', label: 'Music & lyric videos' },
  { value: 'LIVE_PERFORMANCE', label: 'Live performance and music show videos' },
  {
    value: 'PHOTO',
    label: 'Photos (fan pics with artists and pics of our community doing what they love)',
  },
];

/** The label a category's dropdown option shows. */
export const submissionCategoryLabel = (category: SubmissionCategory): string =>
  SUBMISSION_CATEGORY_OPTIONS.find(({ value }) => value === category)?.label ?? category;

/** Every state a submission can be in, mirroring the Prisma enum. */
export const SUBMISSION_STATUSES = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * The states that count as an unapproved submission: no approver has approved
 * it in its present form.
 */
export const UNAPPROVED_SUBMISSION_STATUSES = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'REJECTED',
] as const satisfies readonly SubmissionStatus[];

/** Most unapproved submissions one user may hold at once. Approved ones are not counted. */
export const MAX_UNAPPROVED_SUBMISSIONS = 5;

/** Most attachments one submission may hold. */
export const MAX_SUBMISSION_ATTACHMENTS = 10;

/** What an owner is told when a submission already holds the most attachments. */
export const ATTACHMENTS_FULL_MESSAGE = `A submission can have ${MAX_SUBMISSION_ATTACHMENTS} attachments. Remove one to add another.`;

/** What an owner is told about a file of a type that is not accepted. */
export const ATTACHMENT_TYPE_MESSAGE =
  'That kind of file is not accepted. Add a photo, an audio file or a video.';

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** What an owner is told a kind's upload limit is. */
export const attachmentLimitMessage = (kind: AttachmentKind): string => {
  const megabytes = attachmentUploadLimitBytes(kind) / BYTES_PER_MEGABYTE;

  switch (kind) {
    case 'IMAGE':
      return `A photo can be up to ${megabytes} MB.`;
    case 'AUDIO':
      return `An audio file can be up to ${megabytes} MB.`;
    default:
      return `A video can be up to ${megabytes} MB.`;
  }
};

/** Most outbound links on one submission: the links field and the writing's links together. */
export const MAX_SUBMISSION_LINKS = 10;

/** Longest title, in characters. */
export const SUBMISSION_TITLE_MAX = 120;

/** Longest about, measured as its text without markup. */
export const SUBMISSION_ABOUT_MAX = 1000;

/** Longest writing, measured as its text without markup. */
export const SUBMISSION_WRITING_MAX = 20_000;

/** Shortest and longest reason an approver may give for a rejection. */
export const REJECTION_REASON_MIN = 10;
export const REJECTION_REASON_MAX = 1000;

/**
 * The version of {@link UPLOAD_AGREEMENT_WORDING}. Any change to the wording
 * is a new version, and every user is asked to accept it again.
 */
export const UPLOAD_AGREEMENT_VERSION = 1;

/** The upload agreement a user accepts before their first submission. */
export const UPLOAD_AGREEMENT_WORDING =
  "I won't post anything that harms this community: no hate speech, harassment or threats. Everything I post is my own, or I have the explicit permission of everyone who owns it to share it here.";

/** The reminder shown beside Publish every time, with no control of its own. */
export const PUBLISH_REMINDER =
  'By publishing you confirm this is yours to share and follows the community rules.';

/** The usual reply time an owner is told to expect. */
export const USUAL_REPLY_TIME = 'We usually reply within 2 to 5 business days.';

/**
 * How many business days a submission may await approval before approvers are
 * reminded of it daily. Business days are weekdays, counted in UTC.
 */
export const OVERDUE_BUSINESS_DAYS = 5;
