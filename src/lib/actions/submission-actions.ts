/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import type { ServerSession } from '@/lib/auth/get-server-session';
import { ManagerService } from '@/lib/services/manager-service';
import { SubmissionService } from '@/lib/services/submission-service';
import type {
  SavedSubmission,
  SubmissionActionResult,
  SubmissionRecord,
} from '@/lib/types/domain/submission';
import {
  approveSubmissionInputSchema,
  managerUsernameInputSchema,
  rejectSubmissionInputSchema,
  saveSubmissionInputSchema,
  setSubmissionListedInputSchema,
  submissionIdInputSchema,
} from '@/lib/validation/submission-schema';

import {
  communityClosedRefusal,
  COMMUNITY_MANAGERS_PATH,
  COMMUNITY_MINE_PATH,
  COMMUNITY_QUEUE_PATH,
  failureFromError,
  invalidInputFailure,
  submissionPath,
  turnstileRefusal,
} from './submission-action-helpers';

/**
 * Server Actions for community submissions (ADR-0025). Each one crosses the
 * action gate in its own body, validates its input, and maps a failure onto
 * the form; every rule lives in the services.
 *
 * - An owner's actions cross as `'signed-in'` and, until the community page
 *   launches, are refused to anyone who is not an approver.
 * - A decision crosses as `'approver'`: an admin or a manager.
 * - Granting or removing the manager role crosses as `'admin'`.
 */

const SAVE_FAILED = 'We could not save your submission. Please try again.';
const LISTED_FAILED = 'We could not change where your submission appears. Please try again.';
const DELETE_FAILED = 'We could not delete your submission. Please try again.';
const DECISION_FAILED = 'We could not record that decision. Please try again.';
const MANAGER_FAILED = 'We could not change that role. Please try again.';

/** Every page a change to one submission may have changed. */
const revalidateSubmission = (id: string): void => {
  revalidatePath(COMMUNITY_MINE_PATH);
  revalidatePath(submissionPath(id));
  revalidatePath(COMMUNITY_QUEUE_PATH);
};

const savedFrom = (
  { id, status, listed }: SubmissionRecord,
  queuePosition: number | null = null
): SavedSubmission => ({ id, status, listed, queuePosition });

/** A manager-service refusal names the one field its form has. */
const onUsername = <T>(result: SubmissionActionResult<T>): SubmissionActionResult<T> =>
  result.success || result.fieldErrors !== undefined
    ? result
    : { ...result, fieldErrors: { username: [result.error] } };

/**
 * What Save draft and Publish share once the gate is crossed: the pre-launch
 * check, the wire validation, the Turnstile token, then the service.
 */
const saveAs = async (
  { user }: ServerSession,
  input: unknown,
  publish: boolean
): Promise<SubmissionActionResult<SavedSubmission>> => {
  const closed = communityClosedRefusal(user.role);
  if (closed) return closed;

  const parsed = saveSubmissionInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  const { turnstileToken, ...data } = parsed.data;
  const unverified = await turnstileRefusal(turnstileToken);
  if (unverified) return unverified;

  try {
    const submission = await SubmissionService.save(
      { id: user.id, uploadAgreementVersion: user.uploadAgreementVersion },
      data,
      { publish }
    );
    revalidateSubmission(submission.id);

    return {
      success: true,
      data: savedFrom(submission, await SubmissionService.queuePositionOf(submission)),
    };
  } catch (error) {
    return failureFromError(error, SAVE_FAILED);
  }
};

/**
 * Save the submission form as a draft only its owner can see. On an existing
 * submission it saves the edit: a content edit to an approved one takes it
 * offline until it is approved again.
 */
export const saveSubmissionDraftAction = async (
  input: unknown
): Promise<SubmissionActionResult<SavedSubmission>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;

  return saveAs(gate.session, input, false);
};

/**
 * Save the submission form and send it for approval. Nobody but its owner and
 * approvers can open it until an approver approves it. The result carries its
 * queue position.
 */
export const publishSubmissionAction = async (
  input: unknown
): Promise<SubmissionActionResult<SavedSubmission>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;

  return saveAs(gate.session, input, true);
};

/**
 * Switch the owner's approved submission between listed and unlisted. Not a
 * content edit: it stays approved and needs no verification token.
 */
export const setSubmissionListedAction = async (
  input: unknown
): Promise<SubmissionActionResult<SavedSubmission>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;
  const { user } = gate.session;

  const closed = communityClosedRefusal(user.role);
  if (closed) return closed;

  const parsed = setSubmissionListedInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const { submissionId, listed } = parsed.data;
    const submission = await SubmissionService.setListed(user.id, submissionId, listed);
    revalidateSubmission(submission.id);

    return { success: true, data: savedFrom(submission) };
  } catch (error) {
    return failureFromError(error, LISTED_FAILED);
  }
};

/** Delete the owner's submission, in any state. */
export const deleteSubmissionAction = async (
  input: unknown
): Promise<SubmissionActionResult<{ id: string }>> => {
  const gate = await gateAction('signed-in');
  if (!gate.success) return gate;
  const { user } = gate.session;

  const closed = communityClosedRefusal(user.role);
  if (closed) return closed;

  const parsed = submissionIdInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const { submissionId } = parsed.data;
    await SubmissionService.delete(user.id, submissionId);
    revalidateSubmission(submissionId);

    return { success: true, data: { id: submissionId } };
  } catch (error) {
    return failureFromError(error, DELETE_FAILED);
  }
};

/**
 * Approve a submission awaiting approval, as the approver loaded it. Refused
 * with `DUPLICATE` when it has changed since.
 */
export const approveSubmissionAction = async (
  input: unknown
): Promise<SubmissionActionResult<SavedSubmission>> => {
  const gate = await gateAction('approver');
  if (!gate.success) return gate;
  const { id, role } = gate.session.user;

  const parsed = approveSubmissionInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const submission = await SubmissionService.approve({ id, role }, parsed.data);
    revalidateSubmission(submission.id);

    return { success: true, data: savedFrom(submission) };
  } catch (error) {
    return failureFromError(error, DECISION_FAILED);
  }
};

/**
 * Reject a submission, before or after approval, with the reason its owner
 * reads. Refused with `DUPLICATE` when it has changed since the approver
 * loaded it.
 */
export const rejectSubmissionAction = async (
  input: unknown
): Promise<SubmissionActionResult<SavedSubmission>> => {
  const gate = await gateAction('approver');
  if (!gate.success) return gate;
  const { id, role } = gate.session.user;

  const parsed = rejectSubmissionInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    const submission = await SubmissionService.reject({ id, role }, parsed.data);
    revalidateSubmission(submission.id);

    return { success: true, data: savedFrom(submission) };
  } catch (error) {
    return failureFromError(error, DECISION_FAILED);
  }
};

/** Make the user with a username a manager. Admins only. */
export const grantManagerAction = async (
  input: unknown
): Promise<SubmissionActionResult<{ username: string }>> => {
  const gate = await gateAction('admin');
  if (!gate.success) return gate;

  const parsed = managerUsernameInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    await ManagerService.grant(parsed.data.username);
    revalidatePath(COMMUNITY_MANAGERS_PATH);

    return { success: true, data: { username: parsed.data.username } };
  } catch (error) {
    return onUsername(failureFromError(error, MANAGER_FAILED));
  }
};

/** Return the manager with a username to the user role. Admins only. */
export const removeManagerAction = async (
  input: unknown
): Promise<SubmissionActionResult<{ username: string }>> => {
  const gate = await gateAction('admin');
  if (!gate.success) return gate;

  const parsed = managerUsernameInputSchema.safeParse(input);
  if (!parsed.success) return invalidInputFailure(parsed.error.issues);

  try {
    await ManagerService.remove(parsed.data.username);
    revalidatePath(COMMUNITY_MANAGERS_PATH);

    return { success: true, data: { username: parsed.data.username } };
  } catch (error) {
    return onUsername(failureFromError(error, MANAGER_FAILED));
  }
};
