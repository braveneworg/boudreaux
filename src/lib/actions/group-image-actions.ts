/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../auth';
import { GroupService, type ImageUploadInput } from '../services/group-service';
import { logSecurityEvent } from '../utils/audit-log';
import { requireRole } from '../utils/auth/require-role';

export interface ImageUploadActionResult {
  success: boolean;
  error?: string;
  data?: Array<{
    id: string;
    src: string;
    caption?: string;
    altText?: string;
    sortOrder: number;
  }>;
}

/**
 * Server action to upload images for a group
 * @param groupId - The group ID to upload images for
 * @param formData - FormData containing the image files and metadata
 */
export const uploadGroupImagesAction = async (
  groupId: string,
  formData: FormData
): Promise<ImageUploadActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const files = formData.getAll('files') as File[];
    const captions = formData.getAll('captions') as string[];
    const altTexts = formData.getAll('altTexts') as string[];

    if (!files || files.length === 0) {
      return { success: false, error: 'No files provided' };
    }

    // Convert Files to ImageUploadInput format
    const imageInputs: ImageUploadInput[] = await Promise.all(
      files.map(async (file, index) => {
        const arrayBuffer = await file.arrayBuffer();
        return {
          file: Buffer.from(arrayBuffer),
          fileName: file.name,
          contentType: file.type,
          caption: captions[index] || undefined,
          altText: altTexts[index] || undefined,
        };
      })
    );

    const response = await GroupService.uploadGroupImages(groupId, imageInputs);

    // Log image upload for security audit
    logSecurityEvent({
      event: 'media.group.images.uploaded',
      userId: session.user.id,
      metadata: {
        groupId,
        imageCount: files.length,
        success: response.success,
      },
    });

    if (response.success) {
      // Revalidate paths
      revalidatePath(`/groups/[slug]`, 'page');
      revalidatePath('/admin/groups');
      return { success: true, data: response.data };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Upload group images action error:', error);
    return { success: false, error: 'Failed to upload images' };
  }
};

/**
 * Server action to delete a group image
 * @param imageId - The image ID to delete
 */
export const deleteGroupImageAction = async (
  imageId: string
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const response = await GroupService.deleteGroupImage(imageId);

    // Log image deletion for security audit
    logSecurityEvent({
      event: 'media.group.image.deleted',
      userId: session.user.id,
      metadata: {
        imageId,
        success: response.success,
      },
    });

    if (response.success) {
      // Revalidate paths
      revalidatePath(`/groups/[slug]`, 'page');
      revalidatePath('/admin/groups');
      return { success: true };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Delete group image action error:', error);
    return { success: false, error: 'Failed to delete image' };
  }
};

/**
 * Server action to reorder group images
 * @param groupId - The group ID
 * @param imageIds - Array of image IDs in the desired order
 */
export const reorderGroupImagesAction = async (
  groupId: string,
  imageIds: string[]
): Promise<ImageUploadActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    if (!imageIds || imageIds.length === 0) {
      return { success: false, error: 'No image IDs provided' };
    }

    const response = await GroupService.reorderGroupImages(groupId, imageIds);

    // Log image reorder for security audit
    logSecurityEvent({
      event: 'media.group.images.reordered',
      userId: session.user.id,
      metadata: {
        groupId,
        imageCount: imageIds.length,
        success: response.success,
      },
    });

    if (response.success) {
      // Revalidate paths
      revalidatePath(`/groups/[slug]`, 'page');
      revalidatePath('/admin/groups');
      return { success: true, data: response.data };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Reorder group images action error:', error);
    return { success: false, error: 'Failed to reorder images' };
  }
};
