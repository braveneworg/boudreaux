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
import {
  bannerNotificationSchema,
  rotationIntervalSchema,
} from '@/lib/validation/banner-notification-schema';

import type { Session } from 'next-auth';

const logger = loggers.notifications;

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
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) {
        fieldErrors[key] = [];
      }
      fieldErrors[key].push(issue.message);
    }
    return {
      fields: {},
      success: false,
      errors: fieldErrors,
    };
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

  const result = await BannerNotificationService.upsertNotification(slotNumber, {
    content: content ?? null,
    textColor: textColor ?? null,
    backgroundColor: backgroundColor ?? null,
    displayFrom: displayFrom ?? null,
    displayUntil: displayUntil ?? null,
    repostedFromId: repostedFromId ?? null,
    addedById: session.user.id,
  });

  if (!result.success) {
    return {
      fields: {},
      success: false,
      errors: { _form: [result.error] },
    };
  }

  revalidatePath('/');
  revalidatePath('/admin/notifications');

  return {
    fields: {},
    success: true,
    data: { notificationId: result.data.id },
  };
};

/**
 * Delete a banner notification for a given slot.
 * Direct call (not useActionState).
 */
export const deleteBannerNotificationAction = async (
  slotNumber: number
): Promise<{ success: boolean; error?: string }> => {
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
): Promise<{ success: boolean; error?: string }> => {
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
