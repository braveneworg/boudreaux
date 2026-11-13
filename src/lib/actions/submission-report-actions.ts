/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
import type { SubmissionActionResult } from '@/lib/types/domain/submission';
import { submissionReportIdInputSchema } from '@/lib/validation/submission-report-schema';

import {
  COMMUNITY_QUEUE_PATH,
  failureFromError,
  invalidInputFailure,
} from './submission-action-helpers';

/**
 * Server Actions an approver takes on submission reports (ADR-0025,
 * ADR-0028). Filing a report is not here: it is the one public submission
 * action and lives in `file-submission-report-action.ts`, since a module
 * marked public may not cross the gate.
 */

const HANDLE_FAILED = 'We could not mark that report handled. Please try again.';

/**
 * Mark a report handled, as the approver who pressed. It changes the report
 * and nothing else; a report another approver already handled succeeds and is
 * left as they marked it. A manager is refused on their own submission.
 */
export const markSubmissionReportHandledAction = async (
  input: unknown
): Promise<SubmissionActionResult<{ id: string }>> => {
  const gate = await gateAction('approver');
  if (!gate.success) return gate;
  const { id, role } = gate.session.user;

  const parsed = submissionReportIdInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const { reportId } = parsed.data;
    const { submissionId } = await SubmissionReportService.markHandled({ id, role }, reportId);
    revalidatePath(COMMUNITY_QUEUE_PATH);
    revalidatePath(`${COMMUNITY_QUEUE_PATH}/${submissionId}`);

    return { success: true, data: { id: reportId } };
  } catch (error) {
    return failureFromError(error, HANDLE_FAILED);
  }
};
