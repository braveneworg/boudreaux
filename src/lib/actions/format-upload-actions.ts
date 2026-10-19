/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { formatUpload } from '@/lib/services/format-upload/format-upload';
import type {
  ConfirmedFormatUpload,
  DiscardInput,
  FormatUploadConfirmation,
  NewReleaseTitleCheck,
} from '@/lib/services/format-upload/types';
import { loggers } from '@/lib/utils/logger';
import {
  formatUploadConfirmationSchema,
  formatUploadDiscardSchema,
  newReleaseTitleCheckSchema,
} from '@/lib/validation/format-upload-schema';
import type { ActionResult } from '@/types/digital-format';

/**
 * Server Action: check a new Release's album title before any file is sent.
 * Refused when another Release holds the title; the form's own Release (the
 * same id, on a retry) passes.
 */
export const checkNewReleaseTitleAction = async (
  params: NewReleaseTitleCheck
): Promise<ActionResult<null>> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }

  const parsed = newReleaseTitleCheckSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const checked = await formatUpload.checkNewReleaseTitle(parsed.data);
    return checked.success
      ? { success: true, data: null }
      : { success: false, error: checked.error };
  } catch (error) {
    loggers.media.error('[format-upload] Title check action error', error);
    return { success: false, error: 'Failed to check the release title' };
  }
};

/**
 * Server Action: confirm a format's uploaded files — one file as the legacy
 * single-file format, several as its tracks. In create mode `newRelease`
 * creates the Release under `releaseId` first. A failed confirm deletes the
 * files it was given.
 */
export const confirmFormatUploadAction = async (
  params: FormatUploadConfirmation
): Promise<ActionResult<ConfirmedFormatUpload>> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }

  const parsed = formatUploadConfirmationSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const confirmed = await formatUpload.confirm({ ...parsed.data, userId: gate.session.user.id });
    if (!confirmed.success) {
      return { success: false, error: confirmed.error };
    }
    if (confirmed.data.created) {
      revalidatePath('/admin/releases');
    }
    return { success: true, data: confirmed.data };
  } catch (error) {
    loggers.media.error('[format-upload] Confirm action error', error);
    return { success: false, error: 'Failed to confirm upload' };
  }
};

/**
 * Server Action: delete uploaded files confirm has not taken — a batch
 * cancelled before its confirm. Keys outside the format's prefix, and keys a
 * row references, are skipped.
 */
export const discardFormatUploadAction = async (
  params: DiscardInput
): Promise<ActionResult<{ deletedCount: number }>> => {
  const gate = await gateAction('admin');
  if (!gate.success) {
    return gate;
  }

  const parsed = formatUploadDiscardSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  try {
    const discarded = await formatUpload.discard(parsed.data);
    return discarded.success
      ? { success: true, data: discarded.data }
      : { success: false, error: discarded.error };
  } catch (error) {
    loggers.media.error('[format-upload] Discard action error', error);
    return { success: false, error: 'Failed to discard the uploaded files' };
  }
};
