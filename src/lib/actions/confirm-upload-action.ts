/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import { ReleaseDigitalFormatFileRepository } from '@/lib/repositories/release-digital-format-file-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { UploadService } from '@/lib/services/upload-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import { verifyS3ObjectExists } from '@/lib/utils/s3-client';
import {
  digitalFormatConfirmationSchema,
  multiTrackConfirmationSchema,
} from '@/lib/validation/digital-format-schema';
import type {
  ActionResult,
  MultiTrackUploadConfirmationParams,
  UploadConfirmationParams,
} from '@/types/digital-format';

/**
 * Server Action: Confirm digital format upload after S3 transfer
 *
 * Flow:
 * 1. Validate user is admin (via withAuth decorator)
 * 2. Validate confirmation data with Zod schema
 * 3. Verify S3 object exists at specified key
 * 4. Create ReleaseDigitalFormat record in database
 * 5. Return success with format ID
 *
 * Client uploads file to presigned URL directly to S3, then calls this
 * action to confirm and create the database record.
 *
 * @param params - Release ID, format type, S3 key, file metadata
 * @returns ActionResult with created format ID
 */
async function confirmDigitalFormatUploadActionHandler(
  params: UploadConfirmationParams
): Promise<ActionResult<{ id: string }>> {
  try {
    // Validate input with Zod schema
    const validationResult = digitalFormatConfirmationSchema.safeParse(params);

    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error.issues[0].message,
      };
    }

    const { releaseId, formatType, s3Key, fileName, fileSize, mimeType } = validationResult.data;

    // Verify S3 object exists before creating DB record
    const objectExists = await verifyS3ObjectExists(s3Key);

    if (!objectExists) {
      return {
        success: false,
        error: 'File not found in S3 storage. Upload may have failed.',
      };
    }

    // Create format metadata
    const uploadService = new UploadService();
    const metadata = uploadService.createFormatMetadata({
      releaseId,
      formatType,
      s3Key,
      fileName,
      fileSize,
      mimeType,
    });

    // Create database record
    const repository = new ReleaseDigitalFormatRepository();
    const createdFormat = await repository.create({
      release: { connect: { id: releaseId } },
      formatType: metadata.formatType,
      s3Key: metadata.s3Key,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      mimeType: metadata.mimeType,
      uploadedAt: metadata.uploadedAt,
    });

    return {
      success: true,
      data: {
        id: createdFormat.id,
      },
    };
  } catch (error) {
    console.error('Confirmation action error:', error);

    // Handle unique constraint violation (format already exists)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return {
        success: false,
        error: 'A digital format of this type already exists for this release',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm upload',
    };
  }
}

/**
 * Server Action with admin authentication
 * Only admins can confirm uploads
 */
export async function confirmDigitalFormatUploadAction(
  params: UploadConfirmationParams
): Promise<ActionResult<{ id: string }>> {
  await requireRole('admin');
  return confirmDigitalFormatUploadActionHandler(params);
}

/**
 * Server Action: Confirm multi-track digital format upload
 *
 * Creates the parent ReleaseDigitalFormat record (or upserts if it exists)
 * and creates child ReleaseDigitalFormatFile records for each track.
 * If the format already has tracks, they are replaced (full re-upload).
 */
async function confirmMultiTrackUploadActionHandler(
  params: MultiTrackUploadConfirmationParams
): Promise<ActionResult<{ formatId: string; fileCount: number }>> {
  try {
    const validationResult = multiTrackConfirmationSchema.safeParse(params);

    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error.issues[0].message,
      };
    }

    const { releaseId, formatType, files } = validationResult.data;

    // Verify at least the first S3 object exists (full verification would be too slow)
    const firstFileExists = await verifyS3ObjectExists(files[0].s3Key);
    if (!firstFileExists) {
      return {
        success: false,
        error: 'File not found in S3 storage. Upload may have failed.',
      };
    }

    // Upsert the parent format record
    const formatRepo = new ReleaseDigitalFormatRepository();
    const parent = await formatRepo.upsertParent(releaseId, formatType);

    // Delete existing child files (re-upload replaces all tracks)
    const fileRepo = new ReleaseDigitalFormatFileRepository();
    await fileRepo.deleteAllByFormatId(parent.id);

    // Create new child track files
    const fileCount = await fileRepo.createMany(
      parent.id,
      files.map((f) => ({
        trackNumber: f.trackNumber,
        s3Key: f.s3Key,
        fileName: f.fileName,
        fileSize: BigInt(f.fileSize),
        mimeType: f.mimeType,
        title: f.title,
        duration: f.duration,
      }))
    );

    // Update cached counts on parent
    await formatRepo.updateTrackCounts(parent.id);

    return {
      success: true,
      data: { formatId: parent.id, fileCount },
    };
  } catch (error) {
    console.error('Multi-track confirmation action error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm multi-track upload',
    };
  }
}

/**
 * Server Action with admin authentication for multi-track uploads
 */
export async function confirmMultiTrackUploadAction(
  params: MultiTrackUploadConfirmationParams
): Promise<ActionResult<{ formatId: string; fileCount: number }>> {
  await requireRole('admin');
  return confirmMultiTrackUploadActionHandler(params);
}
