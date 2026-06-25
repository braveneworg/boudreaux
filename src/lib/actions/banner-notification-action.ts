/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { BannerNotificationService } from '@/lib/services/banner-notification-service';
import type { FormState } from '@/lib/types/form-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { sanitizeBannerHtmlServer } from '@/lib/utils/sanitize-banner-html';
import {
  bannerNotificationSchema,
  rotationIntervalSchema,
} from '@/lib/validation/banner-notification-schema';

import type { AdminActionResult } from './run-admin-entity-action';
import type { Session } from 'next-auth';

const logger = loggers.notifications;

/** Converts Zod validation issues into a failed FormState, keying by full dot-joined path. */
const buildBannerFieldErrors = (
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
): FormState => {
  const fieldErrors = new Map<string, string[]>();
  for (const issue of issues) {
    const key = issue.path.join('.');
    const messages = fieldErrors.get(key) ?? [];
    messages.push(issue.message);
    fieldErrors.set(key, messages);
  }
  return { fields: {}, success: false, errors: Object.fromEntries(fieldErrors) };
};

/** Sanitizes content, calls the upsert service, revalidates on success, and returns FormState. */
const executeBannerUpsert = async (
  slotNumber: number,
  data: {
    content: string | null | undefined;
    textColor: string | null | undefined;
    backgroundColor: string | null | undefined;
    displayFrom: Date | null | undefined;
    displayUntil: Date | null | undefined;
    repostedFromId: string | null | undefined;
  },
  userId: string
): Promise<FormState> => {
  const sanitizedContent = data.content ? sanitizeBannerHtmlServer(data.content) : null;
  const result = await BannerNotificationService.upsertNotification(slotNumber, {
    content: sanitizedContent,
    textColor: data.textColor ?? null,
    backgroundColor: data.backgroundColor ?? null,
    displayFrom: data.displayFrom ?? null,
    displayUntil: data.displayUntil ?? null,
    repostedFromId: data.repostedFromId ?? null,
    addedById: userId,
  });
  if (!result.success) {
    return { fields: {}, success: false, errors: { _form: [result.error] } };
  }
  revalidatePath('/');
  revalidatePath('/admin/notifications');
  return { fields: {}, success: true, data: { notificationId: result.data.id } };
};

/**
 * Upsert a banner notification for a given slot.
 * Used with `useActionState` in the admin form.
 */
export const createOrUpdateBannerNotificationAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  let session: Session;
  try {
    session = await requireRole('admin');
  } catch {
    return {
      fields: {},
      success: false,
      errors: { _form: ['Unauthorized'] },
    };
  }

  const raw = {
    slotNumber: payload.get('slotNumber'),
    content: payload.get('content'),
    textColor: payload.get('textColor'),
    backgroundColor: payload.get('backgroundColor'),
    displayFrom: payload.get('displayFrom'),
    displayUntil: payload.get('displayUntil'),
    repostedFromId: payload.get('repostedFromId'),
  };

  const parsed = bannerNotificationSchema.safeParse(raw);

  if (!parsed.success) {
    return buildBannerFieldErrors(parsed.error.issues);
  }

  const {
    slotNumber,
    content,
    textColor,
    backgroundColor,
    displayFrom,
    displayUntil,
    repostedFromId,
  } = parsed.data;

  logger.info(`Upsert banner notification for slot ${slotNumber}`, {
    module: 'NOTIFICATIONS',
    operation: 'upsert',
    userId: session.user.id,
  });

  // Defense-in-depth: re-sanitize with a proper HTML parser before persisting.
  // The Zod transform runs a regex sanitizer (shared with the client preview);
  // this second pass uses sanitize-html so malformed input cannot bypass.
  return executeBannerUpsert(
    slotNumber,
    { content, textColor, backgroundColor, displayFrom, displayUntil, repostedFromId },
    session.user.id
  );
};

/**
 * Delete a banner notification for a given slot.
 * Direct call (not useActionState).
 */
export const deleteBannerNotificationAction = async (
  slotNumber: number
): Promise<AdminActionResult> => {
  try {
    await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  logger.info(`Delete banner notification for slot ${slotNumber}`, {
    module: 'NOTIFICATIONS',
    operation: 'delete',
  });

  const result = await BannerNotificationService.deleteNotification(slotNumber);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath('/');
  revalidatePath('/admin/notifications');

  return { success: true };
};

/**
 * Update the carousel rotation interval.
 * Direct call (not useActionState).
 */
export const updateRotationIntervalAction = async (
  interval: number
): Promise<AdminActionResult> => {
  try {
    await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = rotationIntervalSchema.safeParse({ interval });

  if (!parsed.success) {
    return { success: false, error: 'Invalid interval (must be 3-15)' };
  }

  const result = await BannerNotificationService.updateRotationInterval(parsed.data.interval);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  revalidatePath('/');

  return { success: true };
};
