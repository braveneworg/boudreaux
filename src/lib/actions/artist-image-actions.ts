/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { ArtistService, type ImageUploadInput } from '../services/artist-service';
import { logSecurityEvent } from '../utils/audit-log';

/**
 * Result type for image upload actions
 */
export interface ImageUploadActionResult {
  success: boolean;
  data?: {
    id: string;
    src: string;
    caption?: string;
    altText?: string;
    sortOrder: number;
  }[];
  error?: string;
}

/**
 * Server action to upload images for an artist
 */
export const uploadArtistImagesAction = async (
  artistId: string,
  formData: FormData
): Promise<ImageUploadActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Get files from form data
    const files = formData.getAll('files') as File[];
    const captions = formData.getAll('captions') as string[];
    const altTexts = formData.getAll('altTexts') as string[];

    if (files.length === 0) {
      return { success: false, error: 'No files provided' };
    }

    // Validate files
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return {
          success: false,
          error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`,
        };
      }
      if (file.size > maxFileSize) {
        return {
          success: false,
          error: `File ${file.name} exceeds maximum size of 5MB`,
        };
      }
    }

    // Convert files to ImageUploadInput format
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

    // Upload images
    const response = await ArtistService.uploadArtistImages(artistId, imageInputs);

    // Log image upload for security audit
    logSecurityEvent({
      event: 'media.artist.images.uploaded',
      userId: session.user.id,
      metadata: {
        artistId,
        fileCount: files.length,
        success: response.success,
      },
    });

    if (response.success) {
      // Revalidate artist page
      revalidatePath(`/artists/[slug]`, 'page');
      revalidatePath('/admin/artists');

      return {
        success: true,
        data: response.data,
      };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Upload artist images action error:', error);
    return { success: false, error: 'Failed to upload images' };
  }
};

/**
 * Server action to delete an artist image
 */
export const deleteArtistImageAction = async (
  imageId: string
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const response = await ArtistService.deleteArtistImage(imageId);

    // Log image deletion for security audit
    logSecurityEvent({
      event: 'media.artist.image.deleted',
      userId: session.user.id,
      metadata: {
        imageId,
        success: response.success,
      },
    });

    if (response.success) {
      // Revalidate paths
      revalidatePath(`/artists/[slug]`, 'page');
      revalidatePath('/admin/artists');
      return { success: true };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Delete artist image action error:', error);
    return { success: false, error: 'Failed to delete image' };
  }
};

/**
 * Server action to get images for an artist
 */
export const getArtistImagesAction = async (artistId: string): Promise<ImageUploadActionResult> => {
  try {
    const response = await ArtistService.getArtistImages(artistId);

    if (response.success) {
      return { success: true, data: response.data };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Get artist images action error:', error);
    return { success: false, error: 'Failed to retrieve images' };
  }
};

/**
 * Server action to update image metadata
 */
export const updateArtistImageAction = async (
  imageId: string,
  data: { caption?: string; altText?: string }
): Promise<{ success: boolean; error?: string }> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    const response = await ArtistService.updateArtistImage(imageId, data);

    // Log image update for security audit
    logSecurityEvent({
      event: 'media.artist.image.updated',
      userId: session.user.id,
      metadata: {
        imageId,
        updatedFields: Object.keys(data).filter(
          (key) => data[key as keyof typeof data] !== undefined
        ),
        success: response.success,
      },
    });

    if (response.success) {
      revalidatePath(`/artists/[slug]`, 'page');
      return { success: true };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Update artist image action error:', error);
    return { success: false, error: 'Failed to update image' };
  }
};

/**
 * Server action to reorder images for an artist
 * @param artistId - The artist ID
 * @param imageIds - Array of image IDs in the desired order
 */
export const reorderArtistImagesAction = async (
  artistId: string,
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

    const response = await ArtistService.reorderArtistImages(artistId, imageIds);

    // Log image reorder for security audit
    logSecurityEvent({
      event: 'media.artist.images.reordered',
      userId: session.user.id,
      metadata: {
        artistId,
        imageCount: imageIds.length,
        success: response.success,
      },
    });

    if (response.success) {
      // Revalidate paths
      revalidatePath(`/artists/[slug]`, 'page');
      revalidatePath('/admin/artists');
      return { success: true, data: response.data };
    }

    return { success: false, error: response.error };
  } catch (error) {
    console.error('Reorder artist images action error:', error);
    return { success: false, error: 'Failed to reorder images' };
  }
};
