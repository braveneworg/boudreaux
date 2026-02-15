/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import { revalidatePath } from 'next/cache';

import { requireRole } from '@/lib/utils/auth/require-role';

import { auth } from '../../../auth';
import { prisma } from '../prisma';
import { logSecurityEvent } from '../utils/audit-log';

/**
 * Input for registering an uploaded image
 */
export interface RegisterImageInput {
  s3Key: string;
  cdnUrl: string;
  caption?: string;
  altText?: string;
}

/**
 * Result of image registration
 */
export interface RegisterImageResult {
  id: string;
  src: string;
  caption?: string;
  altText?: string;
  sortOrder: number;
}

/**
 * Action result type
 */
export interface RegisterImageActionResult {
  success: boolean;
  data?: RegisterImageResult[];
  error?: string;
}

/**
 * Server action to register images after direct S3 upload
 * This creates the database records for images that were uploaded directly to S3
 */
export const registerArtistImagesAction = async (
  artistId: string,
  images: RegisterImageInput[]
): Promise<RegisterImageActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Verify artist exists
    const artistExists = await prisma.artist.findUnique({
      where: { id: artistId },
      select: { id: true },
    });

    if (!artistExists) {
      return { success: false, error: 'Artist not found' };
    }

    // Get the next sort order for this artist
    const existingImages = await prisma.image.findMany({
      where: { artistId },
      select: { id: true },
    });
    let nextSortOrder = existingImages.length;

    const results: RegisterImageResult[] = [];

    for (const image of images) {
      const dbImage = await prisma.image.create({
        data: {
          src: image.cdnUrl,
          caption: image.caption,
          altText: image.altText,
          artistId,
          sortOrder: nextSortOrder,
        },
      });

      results.push({
        id: dbImage.id,
        src: dbImage.src ?? '',
        caption: dbImage.caption ?? undefined,
        altText: dbImage.altText ?? undefined,
        sortOrder: dbImage.sortOrder ?? nextSortOrder,
      });

      nextSortOrder++;
    }

    // Log image registration for security audit
    logSecurityEvent({
      event: 'media.artist.images.uploaded',
      userId: session.user.id,
      metadata: {
        artistId,
        fileCount: images.length,
        success: true,
      },
    });

    // Revalidate artist page
    revalidatePath(`/artists/[slug]`, 'page');
    revalidatePath('/admin/artists');

    return { success: true, data: results };
  } catch (error) {
    console.error('Register artist images action error:', error);
    return { success: false, error: 'Failed to register images' };
  }
};

/**
 * Server action to register images after direct S3 upload for groups
 */
export const registerGroupImagesAction = async (
  groupId: string,
  images: RegisterImageInput[]
): Promise<RegisterImageActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Verify group exists
    const groupExists = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!groupExists) {
      return { success: false, error: 'Group not found' };
    }

    // Get the next sort order for this group
    const existingImages = await prisma.image.findMany({
      where: { groupId },
      select: { id: true },
    });
    let nextSortOrder = existingImages.length;

    const results: RegisterImageResult[] = [];

    for (const image of images) {
      const dbImage = await prisma.image.create({
        data: {
          src: image.cdnUrl,
          caption: image.caption,
          altText: image.altText,
          groupId,
          sortOrder: nextSortOrder,
        },
      });

      results.push({
        id: dbImage.id,
        src: dbImage.src ?? '',
        caption: dbImage.caption ?? undefined,
        altText: dbImage.altText ?? undefined,
        sortOrder: dbImage.sortOrder ?? nextSortOrder,
      });

      nextSortOrder++;
    }

    // Log image registration for security audit
    logSecurityEvent({
      event: 'media.group.images.uploaded',
      userId: session.user.id,
      metadata: {
        groupId,
        fileCount: images.length,
        success: true,
      },
    });

    // Revalidate group page
    revalidatePath(`/groups/[id]`, 'page');
    revalidatePath('/admin/groups');

    return { success: true, data: results };
  } catch (error) {
    console.error('Register group images action error:', error);
    return { success: false, error: 'Failed to register images' };
  }
};

/**
 * Server action to register images after direct S3 upload for releases
 */
export const registerReleaseImagesAction = async (
  releaseId: string,
  images: RegisterImageInput[]
): Promise<RegisterImageActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Verify release exists
    const releaseExists = await prisma.release.findUnique({
      where: { id: releaseId },
      select: { id: true },
    });

    if (!releaseExists) {
      return { success: false, error: 'Release not found' };
    }

    // Get the next sort order for this release
    const existingImages = await prisma.image.findMany({
      where: { releaseId },
      select: { id: true },
    });
    let nextSortOrder = existingImages.length;

    const results: RegisterImageResult[] = [];

    for (const image of images) {
      const dbImage = await prisma.image.create({
        data: {
          src: image.cdnUrl,
          caption: image.caption,
          altText: image.altText,
          releaseId,
          sortOrder: nextSortOrder,
        },
      });

      results.push({
        id: dbImage.id,
        src: dbImage.src ?? '',
        caption: dbImage.caption ?? undefined,
        altText: dbImage.altText ?? undefined,
        sortOrder: dbImage.sortOrder ?? nextSortOrder,
      });

      nextSortOrder++;
    }

    // Log image registration for security audit
    logSecurityEvent({
      event: 'media.release.images.uploaded',
      userId: session.user.id,
      metadata: {
        releaseId,
        fileCount: images.length,
        success: true,
      },
    });

    // Revalidate release page
    revalidatePath(`/releases/[slug]`, 'page');
    revalidatePath('/admin/releases');

    return { success: true, data: results };
  } catch (error) {
    console.error('Register release images action error:', error);
    return { success: false, error: 'Failed to register images' };
  }
};

/**
 * Server action to register images after direct S3 upload for tracks
 */
export const registerTrackImagesAction = async (
  trackId: string,
  images: RegisterImageInput[]
): Promise<RegisterImageActionResult> => {
  await requireRole('admin');

  try {
    const session = await auth();

    if (!session?.user?.id || session?.user?.role !== 'admin') {
      return { success: false, error: 'Unauthorized' };
    }

    // Verify track exists
    const trackExists = await prisma.track.findUnique({
      where: { id: trackId },
      select: { id: true },
    });

    if (!trackExists) {
      return { success: false, error: 'Track not found' };
    }

    // Get the next sort order for this track
    const existingImages = await prisma.image.findMany({
      where: { trackId },
      select: { id: true },
    });
    let nextSortOrder = existingImages.length;

    const results: RegisterImageResult[] = [];

    for (const image of images) {
      const dbImage = await prisma.image.create({
        data: {
          src: image.cdnUrl,
          caption: image.caption,
          altText: image.altText,
          trackId,
          sortOrder: nextSortOrder,
        },
      });

      results.push({
        id: dbImage.id,
        src: dbImage.src ?? '',
        caption: dbImage.caption ?? undefined,
        altText: dbImage.altText ?? undefined,
        sortOrder: dbImage.sortOrder ?? nextSortOrder,
      });

      nextSortOrder++;
    }

    // Log image registration for security audit
    logSecurityEvent({
      event: 'media.track.images.uploaded',
      userId: session.user.id,
      metadata: {
        trackId,
        fileCount: images.length,
        success: true,
      },
    });

    // Revalidate track page
    revalidatePath(`/tracks/[id]`, 'page');
    revalidatePath('/admin/tracks');

    return { success: true, data: results };
  } catch (error) {
    console.error('Register track images action error:', error);
    return { success: false, error: 'Failed to register images' };
  }
};
