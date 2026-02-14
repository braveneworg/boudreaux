'use server';

import { revalidatePath } from 'next/cache';

import { NotificationBannerService } from '../services/notification-banner-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { requireRole } from '../utils/auth/require-role';
import { loggers } from '../utils/logger';
import { notificationBannerSchema } from '../validation/notification-banner-schema';

import type { FormState } from '../types/form-state';
import type { Session } from 'next-auth';

const logger = loggers.notifications;

const permittedFieldNames = [
  'message',
  'secondaryMessage',
  'notes',
  'originalImageUrl',
  'imageUrl',
  'linkUrl',
  'backgroundColor',
  'isOverlayed',
  'sortOrder',
  'isActive',
  'displayFrom',
  'displayUntil',
  'messageFont',
  'messageFontSize',
  'messageContrast',
  'secondaryMessageFont',
  'secondaryMessageFontSize',
  'secondaryMessageContrast',
  'messageTextColor',
  'secondaryMessageTextColor',
  'messageTextShadow',
  'messageTextShadowDarkness',
  'secondaryMessageTextShadow',
  'secondaryMessageTextShadowDarkness',
  'messagePositionX',
  'messagePositionY',
  'secondaryMessagePositionX',
  'secondaryMessagePositionY',
  'messageRotation',
  'secondaryMessageRotation',
  'imageOffsetX',
  'imageOffsetY',
  'messageWidth',
  'messageHeight',
  'secondaryMessageWidth',
  'secondaryMessageHeight',
];

export const createNotificationBannerAction = async (
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
      errors: { general: ['You must be a logged in admin user to create a notification banner'] },
    };
  }

  // Debug: Log received payload
  logger.debug('CREATE - Received FormData entries');
  for (const [key, value] of payload.entries()) {
    logger.debug(`  ${key}: ${value}`);
  }

  // Convert numeric and boolean fields
  const sortOrderValue = payload.get('sortOrder');
  if (sortOrderValue) {
    payload.set('sortOrder', String(parseInt(sortOrderValue.toString(), 10)));
  }

  // Convert isOverlayed and isActive to boolean
  const isOverlayedValue = payload.get('isOverlayed');
  const isActiveValue = payload.get('isActive');
  const messageTextShadowValue = payload.get('messageTextShadow');
  const secondaryMessageTextShadowValue = payload.get('secondaryMessageTextShadow');

  const processedPayload = new FormData();
  for (const [key, value] of payload.entries()) {
    processedPayload.append(key, value);
  }

  // Handle checkbox/switch boolean conversion
  const formDataObj: Record<string, unknown> = {};
  for (const [key, value] of processedPayload.entries()) {
    if (key === 'sortOrder') {
      formDataObj[key] = parseInt(value.toString(), 10) || 0;
    } else if (
      key === 'isOverlayed' ||
      key === 'isActive' ||
      key === 'messageTextShadow' ||
      key === 'secondaryMessageTextShadow'
    ) {
      formDataObj[key] = value === 'true' || value === 'on';
    } else if (
      key === 'messageFontSize' ||
      key === 'messageContrast' ||
      key === 'secondaryMessageFontSize' ||
      key === 'secondaryMessageContrast' ||
      key === 'messageTextShadowDarkness' ||
      key === 'secondaryMessageTextShadowDarkness' ||
      key === 'messagePositionX' ||
      key === 'messagePositionY' ||
      key === 'secondaryMessagePositionX' ||
      key === 'secondaryMessagePositionY' ||
      key === 'messageRotation' ||
      key === 'secondaryMessageRotation' ||
      key === 'imageOffsetX' ||
      key === 'imageOffsetY' ||
      key === 'messageWidth' ||
      key === 'messageHeight' ||
      key === 'secondaryMessageWidth' ||
      key === 'secondaryMessageHeight'
    ) {
      formDataObj[key] = parseFloat(value.toString()) || 0;
    } else {
      formDataObj[key] = value.toString();
    }
  }

  // Set defaults for boolean fields if not present
  if (formDataObj.isOverlayed === undefined) {
    formDataObj.isOverlayed = isOverlayedValue === 'on' || isOverlayedValue === 'true';
  }
  if (formDataObj.isActive === undefined) {
    formDataObj.isActive = isActiveValue === 'on' || isActiveValue === 'true';
  }
  if (formDataObj.messageTextShadow === undefined) {
    formDataObj.messageTextShadow =
      messageTextShadowValue === 'on' || messageTextShadowValue === 'true';
  }
  if (formDataObj.secondaryMessageTextShadow === undefined) {
    formDataObj.secondaryMessageTextShadow =
      secondaryMessageTextShadowValue === 'on' || secondaryMessageTextShadowValue === 'true';
  }
  if (formDataObj.sortOrder === undefined) {
    formDataObj.sortOrder = 0;
  }

  // Debug: Log dimension values before validation
  logger.debug('CREATE - Dimension values', {
    messageWidth: formDataObj.messageWidth,
    messageHeight: formDataObj.messageHeight,
    secondaryMessageWidth: formDataObj.secondaryMessageWidth,
    secondaryMessageHeight: formDataObj.secondaryMessageHeight,
    messagePositionX: formDataObj.messagePositionX,
    messagePositionY: formDataObj.messagePositionY,
  });

  // Validate with Zod
  const parsed = notificationBannerSchema.safeParse(formDataObj);

  const formState: FormState = {
    fields: {},
    success: false,
  };

  // Populate fields for form state
  for (const key of permittedFieldNames) {
    if (formDataObj[key] !== undefined) {
      formState.fields[key] =
        typeof formDataObj[key] === 'boolean' ? formDataObj[key] : String(formDataObj[key] ?? '');
    }
  }

  if (!parsed.success) {
    logger.warn('CREATE - Validation failed', { issues: parsed.error.issues });
    formState.errors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0]?.toString() || 'general';
      if (!formState.errors[path]) {
        formState.errors[path] = [];
      }
      formState.errors[path].push(issue.message);
    }
    return formState;
  }

  try {
    const {
      message,
      secondaryMessage,
      notes,
      originalImageUrl,
      imageUrl,
      linkUrl,
      backgroundColor,
      isOverlayed,
      isActive,
      displayFrom,
      displayUntil,
      messageFont,
      messageFontSize,
      messageContrast,
      secondaryMessageFont,
      secondaryMessageFontSize,
      secondaryMessageContrast,
      messageTextColor,
      secondaryMessageTextColor,
      messageTextShadow,
      messageTextShadowDarkness,
      secondaryMessageTextShadow,
      secondaryMessageTextShadowDarkness,
      messagePositionX,
      messagePositionY,
      secondaryMessagePositionX,
      secondaryMessagePositionY,
      messageRotation,
      secondaryMessageRotation,
      imageOffsetX,
      imageOffsetY,
      messageWidth,
      messageHeight,
      secondaryMessageWidth,
      secondaryMessageHeight,
    } = parsed.data;

    // Debug: Log image URLs being saved
    logger.debug('CREATE - Image URLs', {
      originalImageUrl,
      imageUrl,
    });

    const createData = {
      message,
      secondaryMessage: secondaryMessage || null,
      notes: notes || null,
      originalImageUrl: originalImageUrl || null,
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      backgroundColor: backgroundColor || null,
      isOverlayed: isOverlayed ?? true,
      sortOrder: 0,
      isActive: isActive ?? true,
      displayFrom: displayFrom ? new Date(displayFrom) : null,
      displayUntil: displayUntil ? new Date(displayUntil) : null,
      messageFont: messageFont || 'system-ui',
      messageFontSize: messageFontSize ?? 2.5,
      messageContrast: messageContrast ?? 100,
      secondaryMessageFont: secondaryMessageFont || 'system-ui',
      secondaryMessageFontSize: secondaryMessageFontSize ?? 2,
      secondaryMessageContrast: secondaryMessageContrast ?? 95,
      messageTextColor: messageTextColor || '#ffffff',
      secondaryMessageTextColor: secondaryMessageTextColor || '#ffffff',
      messageTextShadow: messageTextShadow ?? true,
      messageTextShadowDarkness: messageTextShadowDarkness ?? 50,
      secondaryMessageTextShadow: secondaryMessageTextShadow ?? true,
      secondaryMessageTextShadowDarkness: secondaryMessageTextShadowDarkness ?? 50,
      messagePositionX: messagePositionX ?? 50,
      messagePositionY: messagePositionY ?? 10,
      secondaryMessagePositionX: secondaryMessagePositionX ?? 50,
      secondaryMessagePositionY: secondaryMessagePositionY ?? 90,
      messageRotation: messageRotation ?? 0,
      secondaryMessageRotation: secondaryMessageRotation ?? 0,
      imageOffsetX: imageOffsetX ?? 0,
      imageOffsetY: imageOffsetY ?? 0,
      messageWidth: messageWidth ?? 80,
      messageHeight: messageHeight ?? 30,
      secondaryMessageWidth: secondaryMessageWidth ?? 80,
      secondaryMessageHeight: secondaryMessageHeight ?? 30,
      addedById: session.user.id,
    };

    const result = await NotificationBannerService.createNotificationBanner(createData);

    if (!result.success) {
      logger.error('CREATE - Service error', { error: result.error });
      formState.errors = { general: ['Failed to create notification banner'] };
      return formState;
    }

    logSecurityEvent({
      event: 'notification.banner.created',
      userId: session.user.id,
      metadata: {
        notificationId: result.data.id,
        message: message.substring(0, 50),
      },
    });

    formState.success = true;
    formState.data = { notificationId: result.data.id };

    revalidatePath('/');
    revalidatePath('/admin/notifications');

    return formState;
  } catch (error) {
    logger.error('Error creating notification banner', error);
    setUnknownError(formState);
    return formState;
  }
};

export const updateNotificationBannerAction = async (
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
      errors: { general: ['You must be a logged in admin user to update a notification banner'] },
    };
  }

  // Debug: Log received payload
  logger.debug('UPDATE - Received FormData entries');
  for (const [key, value] of payload.entries()) {
    logger.debug(`  ${key}: ${value}`);
  }

  const notificationId = payload.get('notificationId')?.toString();

  if (!notificationId) {
    return {
      fields: {},
      success: false,
      errors: { general: ['Notification ID is required'] },
    };
  }

  // Remove notificationId from payload for validation
  payload.delete('notificationId');

  // Process form data
  const formDataObj: Record<string, unknown> = {};
  for (const [key, value] of payload.entries()) {
    if (key === 'sortOrder') {
      formDataObj[key] = parseInt(value.toString(), 10) || 0;
    } else if (
      key === 'isOverlayed' ||
      key === 'isActive' ||
      key === 'messageTextShadow' ||
      key === 'secondaryMessageTextShadow'
    ) {
      formDataObj[key] = value === 'true' || value === 'on';
    } else if (
      key === 'messageFontSize' ||
      key === 'messageContrast' ||
      key === 'secondaryMessageFontSize' ||
      key === 'secondaryMessageContrast' ||
      key === 'messageTextShadowDarkness' ||
      key === 'secondaryMessageTextShadowDarkness' ||
      key === 'messagePositionX' ||
      key === 'messagePositionY' ||
      key === 'secondaryMessagePositionX' ||
      key === 'secondaryMessagePositionY' ||
      key === 'messageRotation' ||
      key === 'secondaryMessageRotation' ||
      key === 'imageOffsetX' ||
      key === 'imageOffsetY' ||
      key === 'messageWidth' ||
      key === 'messageHeight' ||
      key === 'secondaryMessageWidth' ||
      key === 'secondaryMessageHeight'
    ) {
      formDataObj[key] = parseFloat(value.toString()) || 0;
    } else {
      formDataObj[key] = value.toString();
    }
  }

  // Set defaults for checkboxes if not present
  if (!payload.has('isOverlayed')) {
    formDataObj.isOverlayed = false;
  }
  if (!payload.has('isActive')) {
    formDataObj.isActive = false;
  }
  if (!payload.has('messageTextShadow')) {
    formDataObj.messageTextShadow = false;
  }
  if (!payload.has('secondaryMessageTextShadow')) {
    formDataObj.secondaryMessageTextShadow = false;
  }
  if (formDataObj.sortOrder === undefined) {
    formDataObj.sortOrder = 0;
  }

  // Debug: Log dimension values before validation
  logger.debug('UPDATE - Dimension values', {
    messageWidth: formDataObj.messageWidth,
    messageHeight: formDataObj.messageHeight,
    secondaryMessageWidth: formDataObj.secondaryMessageWidth,
    secondaryMessageHeight: formDataObj.secondaryMessageHeight,
    messagePositionX: formDataObj.messagePositionX,
    messagePositionY: formDataObj.messagePositionY,
  });

  const parsed = notificationBannerSchema.safeParse(formDataObj);

  const formState: FormState = {
    fields: {},
    success: false,
  };

  for (const key of permittedFieldNames) {
    if (formDataObj[key] !== undefined) {
      formState.fields[key] =
        typeof formDataObj[key] === 'boolean' ? formDataObj[key] : String(formDataObj[key] ?? '');
    }
  }

  if (!parsed.success) {
    logger.warn('UPDATE - Validation failed', { issues: parsed.error.issues });
    formState.errors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0]?.toString() || 'general';
      if (!formState.errors[path]) {
        formState.errors[path] = [];
      }
      formState.errors[path].push(issue.message);
    }
    return formState;
  }

  try {
    const {
      message,
      secondaryMessage,
      notes,
      originalImageUrl,
      imageUrl,
      linkUrl,
      backgroundColor,
      isOverlayed,
      isActive,
      displayFrom,
      displayUntil,
      messageFont,
      messageFontSize,
      messageContrast,
      secondaryMessageFont,
      secondaryMessageFontSize,
      secondaryMessageContrast,
      messageTextColor,
      secondaryMessageTextColor,
      messageTextShadow,
      messageTextShadowDarkness,
      secondaryMessageTextShadow,
      secondaryMessageTextShadowDarkness,
      messagePositionX,
      messagePositionY,
      secondaryMessagePositionX,
      secondaryMessagePositionY,
      messageRotation,
      secondaryMessageRotation,
      imageOffsetX,
      imageOffsetY,
      messageWidth,
      messageHeight,
      secondaryMessageWidth,
      secondaryMessageHeight,
    } = parsed.data;

    // Debug: Log image URLs being saved
    logger.debug('UPDATE - Image URLs', {
      notificationId,
      originalImageUrl,
      imageUrl,
    });

    const updateData = {
      message,
      secondaryMessage: secondaryMessage || null,
      notes: notes || null,
      originalImageUrl: originalImageUrl || null,
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      backgroundColor: backgroundColor || null,
      isOverlayed: isOverlayed ?? true,
      sortOrder: 0,
      isActive: isActive ?? true,
      displayFrom: displayFrom ? new Date(displayFrom) : null,
      displayUntil: displayUntil ? new Date(displayUntil) : null,
      messageFont: messageFont || 'system-ui',
      messageFontSize: messageFontSize ?? 2.5,
      messageContrast: messageContrast ?? 100,
      secondaryMessageFont: secondaryMessageFont || 'system-ui',
      secondaryMessageFontSize: secondaryMessageFontSize ?? 2,
      secondaryMessageContrast: secondaryMessageContrast ?? 95,
      messageTextColor: messageTextColor || '#ffffff',
      secondaryMessageTextColor: secondaryMessageTextColor || '#ffffff',
      messageTextShadow: messageTextShadow ?? true,
      messageTextShadowDarkness: messageTextShadowDarkness ?? 50,
      secondaryMessageTextShadow: secondaryMessageTextShadow ?? true,
      secondaryMessageTextShadowDarkness: secondaryMessageTextShadowDarkness ?? 50,
      messagePositionX: messagePositionX ?? 50,
      messagePositionY: messagePositionY ?? 10,
      secondaryMessagePositionX: secondaryMessagePositionX ?? 50,
      secondaryMessagePositionY: secondaryMessagePositionY ?? 90,
      messageRotation: messageRotation ?? 0,
      secondaryMessageRotation: secondaryMessageRotation ?? 0,
      imageOffsetX: imageOffsetX ?? 0,
      imageOffsetY: imageOffsetY ?? 0,
      messageWidth: messageWidth ?? 80,
      messageHeight: messageHeight ?? 30,
      secondaryMessageWidth: secondaryMessageWidth ?? 80,
      secondaryMessageHeight: secondaryMessageHeight ?? 30,
    };

    logger.debug('UPDATE - Calling service', { notificationId });

    const result = await NotificationBannerService.updateNotificationBanner(
      notificationId,
      updateData
    );

    logger.debug('UPDATE - Service result', { success: result.success });

    if (!result.success) {
      logger.error('UPDATE - Service error', { error: result.error, notificationId });
      formState.errors = { general: ['Failed to update notification banner'] };
      return formState;
    }

    logSecurityEvent({
      event: 'notification.banner.updated',
      userId: session.user.id,
      metadata: {
        notificationId,
        message: message.substring(0, 50),
      },
    });

    formState.success = true;
    formState.data = { notificationId };

    revalidatePath('/');
    revalidatePath('/admin/notifications');

    return formState;
  } catch (error) {
    logger.error('Error updating notification banner', error, { notificationId });
    setUnknownError(formState);
    return formState;
  }
};

export const deleteNotificationBannerAction = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  let session: Session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const result = await NotificationBannerService.deleteNotificationBanner(notificationId);

    if (!result.success) {
      logger.error('DELETE - Service error', { error: result.error, notificationId });
      return { success: false, error: 'Failed to delete notification banner' };
    }

    logSecurityEvent({
      event: 'notification.banner.deleted',
      userId: session.user.id,
      metadata: { notificationId },
    });

    revalidatePath('/');
    revalidatePath('/admin/notifications');

    return { success: true };
  } catch (error) {
    logger.error('Error deleting notification banner', error, { notificationId });
    return { success: false, error: 'Failed to delete notification banner' };
  }
};

export const publishNotificationBannerAction = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  let session: Session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const result = await NotificationBannerService.publishNotificationBanner(
      notificationId,
      session.user.id
    );

    if (!result.success) {
      logger.error('PUBLISH - Service error', { error: result.error, notificationId });
      return { success: false, error: 'Failed to publish notification banner' };
    }

    logSecurityEvent({
      event: 'notification.banner.published',
      userId: session.user.id,
      metadata: { notificationId },
    });

    revalidatePath('/');
    revalidatePath('/admin/notifications');

    return { success: true };
  } catch (error) {
    logger.error('Error publishing notification banner', error, { notificationId });
    return { success: false, error: 'Failed to publish notification banner' };
  }
};

export const unpublishNotificationBannerAction = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  let session: Session;
  try {
    session = await requireRole('admin');
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const result = await NotificationBannerService.unpublishNotificationBanner(notificationId);

    if (!result.success) {
      logger.error('UNPUBLISH - Service error', { error: result.error, notificationId });
      return { success: false, error: 'Failed to unpublish notification banner' };
    }

    logSecurityEvent({
      event: 'notification.banner.unpublished',
      userId: session.user.id,
      metadata: { notificationId },
    });

    revalidatePath('/');
    revalidatePath('/admin/notifications');

    return { success: true };
  } catch (error) {
    logger.error('Error unpublishing notification banner', error, { notificationId });
    return { success: false, error: 'Failed to unpublish notification banner' };
  }
};
