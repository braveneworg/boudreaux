/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { requireRole } from '@/lib/utils/auth/require-role';

import { ArtistService } from '../services/artist-service';
import { ImageService } from '../services/image-service';
import { ReleaseService } from '../services/release-service';
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

    if (!(await ArtistService.existsById(artistId))) {
      return { success: false, error: 'Artist not found' };
    }

    const results = await ImageService.registerForArtist(
      artistId,
      images.map(({ cdnUrl, caption, altText }) => ({ cdnUrl, caption, altText }))
    );

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

    if (!(await ReleaseService.existsById(releaseId))) {
      return { success: false, error: 'Release not found' };
    }

    const results = await ImageService.registerForRelease(
      releaseId,
      images.map(({ cdnUrl, caption, altText }) => ({ cdnUrl, caption, altText }))
    );

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
