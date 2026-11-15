/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { z } from 'zod';

import { SUBMISSION_CATEGORIES, SUBMISSION_STATUSES } from '@/lib/constants/submissions';
import type { SubmissionView, SubmissionViewPayload } from '@/lib/types/domain/submission';

import { attachmentViewSchema } from './submission-attachment-schema';

/**
 * One submission as `GET /api/community/submissions/[id]` answers it and the
 * submission modal reads it (ADR-0030). Imported by a client hook, so it
 * must stay free of `server-only` modules.
 */
export const submissionViewPayloadSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(SUBMISSION_CATEGORIES),
  aboutHtml: z.string(),
  writingHtml: z.string(),
  links: z.array(z.string()),
  listed: z.boolean(),
  status: z.enum(SUBMISSION_STATUSES),
  rejectionReason: z.string().nullable(),
  owner: z.object({ username: z.string().nullable(), gravatarHash: z.string() }),
  viewer: z.enum(['owner', 'approver', 'public']),
  isPublic: z.boolean(),
  queuePosition: z.number().int().nullable(),
  attachments: z.array(attachmentViewSchema),
}) satisfies z.ZodType<SubmissionViewPayload>;

/**
 * What leaves the server of a reader's view: every field the modal shows,
 * named one by one, so a field added to the view later is not sent until it
 * is added here.
 */
export const toSubmissionViewPayload = ({
  id,
  title,
  category,
  aboutHtml,
  writingHtml,
  links,
  listed,
  status,
  rejectionReason,
  owner,
  viewer,
  isPublic,
  queuePosition,
  attachments,
}: SubmissionView): SubmissionViewPayload => ({
  id,
  title,
  category,
  aboutHtml,
  writingHtml,
  links,
  listed,
  status,
  rejectionReason,
  owner,
  viewer,
  isPublic,
  queuePosition,
  attachments,
});
