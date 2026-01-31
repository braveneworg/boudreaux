'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../auth';
import { NotificationBannerService } from '../services/notification-banner-service';
import { logSecurityEvent } from '../utils/audit-log';
import { setUnknownError } from '../utils/auth/auth-utils';
import { requireRole } from '../utils/auth/require-role';
import { notificationBannerSchema } from '../validation/notification-banner-schema';

import type { FormState } from '../types/form-state';

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
];

export const createNotificationBannerAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

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
      key === 'imageOffsetY'
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
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      formState.errors = {
        general: ['You must be a logged in admin user to create a notification banner'],
      };
      return formState;
    }

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
    } = parsed.data;

    // Debug: Log image URLs being saved
    console.info('[NotificationBannerAction] CREATE - Image URLs:', {
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
      addedBy: { connect: { id: session.user.id } },
    };

    const result = await NotificationBannerService.createNotificationBanner(createData);

    if (!result.success) {
      formState.errors = { general: [result.error] };
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
    console.error('Error creating notification banner:', error);
    setUnknownError(formState);
    return formState;
  }
};

export const updateNotificationBannerAction = async (
  _initialState: FormState,
  payload: FormData
): Promise<FormState> => {
  await requireRole('admin');

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
      key === 'imageOffsetY'
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
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      formState.errors = {
        general: ['You must be a logged in admin user to update a notification banner'],
      };
      return formState;
    }

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
    } = parsed.data;

    // Debug: Log image URLs being saved
    console.info('[NotificationBannerAction] UPDATE - Image URLs:', {
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
    };

    const result = await NotificationBannerService.updateNotificationBanner(
      notificationId,
      updateData
    );

    if (!result.success) {
      formState.errors = { general: [result.error] };
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
    console.error('Error updating notification banner:', error);
    setUnknownError(formState);
    return formState;
  }
};

export const deleteNotificationBannerAction = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await NotificationBannerService.deleteNotificationBanner(notificationId);

    if (!result.success) {
      return { success: false, error: result.error };
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
    console.error('Error deleting notification banner:', error);
    return { success: false, error: 'Failed to delete notification banner' };
  }
};

export const publishNotificationBannerAction = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await NotificationBannerService.publishNotificationBanner(
      notificationId,
      session.user.id
    );

    if (!result.success) {
      return { success: false, error: result.error };
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
    console.error('Error publishing notification banner:', error);
    return { success: false, error: 'Failed to publish notification banner' };
  }
};

export const unpublishNotificationBannerAction = async (
  notificationId: string
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const result = await NotificationBannerService.unpublishNotificationBanner(notificationId);

    if (!result.success) {
      return { success: false, error: result.error };
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
    console.error('Error unpublishing notification banner:', error);
    return { success: false, error: 'Failed to unpublish notification banner' };
  }
};
