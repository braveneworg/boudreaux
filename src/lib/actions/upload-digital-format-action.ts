/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import { z } from 'zod';

import { UploadService } from '@/lib/services/upload-service';
import { requireRole } from '@/lib/utils/auth/require-role';
import type { ActionResult, PresignedUploadResponse } from '@/types/digital-format';

/**
 * Input schema for upload action
 * Includes releaseId + file metadata
 */
const uploadActionSchema = z.object({
  releaseId: z.string().min(1),
  formatType: z.enum(['MP3_V0', 'MP3_320KBPS', 'AAC', 'OGG_VORBIS', 'FLAC', 'ALAC', 'WAV', 'AIFF']),
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string(),
});

/**
 * Server Action: Generate presigned upload URL for digital format
 *
 * Flow:
 * 1. Validate user is admin (via withAuth decorator)
 * 2. Validate file metadata with Zod schema
 * 3. Check format-specific size and MIME type constraints
 * 4. Generate presigned S3 upload URL (15-minute expiration)
 * 5. Return URL + S3 key to client for direct upload
 *
 * @param formData - Release ID and file metadata
 * @returns ActionResult with uploadUrl and s3Key
 */
async function uploadDigitalFormatActionHandler(
  formData: FormData
): Promise<ActionResult<PresignedUploadResponse>> {
  try {
    // Parse and validate input
    const rawData = {
      releaseId: formData.get('releaseId') as string,
      formatType: formData.get('formatType') as string,
      fileName: formData.get('fileName') as string,
      fileSize: parseInt(formData.get('fileSize') as string, 10),
      mimeType: formData.get('mimeType') as string,
    };

    const validationResult = uploadActionSchema.safeParse(rawData);

    if (!validationResult.success) {
      return {
        success: false,
        error: validationResult.error.issues[0].message,
      };
    }

    const { releaseId, formatType, fileName, fileSize, mimeType } = validationResult.data;

    // Additional format-specific validation via service
    const uploadService = new UploadService();
    const fileValidation = uploadService.validateFileInfo({
      formatType,
      fileName,
      fileSize,
      mimeType,
    });

    if (!fileValidation.valid) {
      return {
        success: false,
        error: fileValidation.error || 'File validation failed',
      };
    }

    // Generate presigned upload URL
    const { uploadUrl, s3Key, contentType } = await uploadService.generatePresignedUploadUrl(
      releaseId,
      formatType,
      fileName,
      mimeType
    );

    return {
      success: true,
      data: {
        uploadUrl,
        s3Key,
        expiresIn: 900,
        contentType,
      },
    };
  } catch (error) {
    console.error('Upload action error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    };
  }
}

/**
 * Server Action with admin authentication
 * Only admins can upload digital formats
 */
export async function uploadDigitalFormatAction(
  formData: FormData
): Promise<ActionResult<PresignedUploadResponse>> {
  await requireRole('admin');
  return uploadDigitalFormatActionHandler(formData);
}
