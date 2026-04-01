/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import { ReleaseDigitalFormatFileRepository } from '@/lib/repositories/release-digital-format-file-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { requireRole } from '@/lib/utils/auth/require-role';
import { deleteS3Object } from '@/lib/utils/s3-client';
import type { ActionResult, DigitalFormatType } from '@/types/digital-format';

interface DeleteFormatFilesParams {
  releaseId: string;
  formatType: DigitalFormatType;
}

/**
 * Server Action: Delete all files for a specific digital format.
 * Used before re-uploading files to replace existing ones.
 *
 * 1. Find the format record by releaseId + formatType
 * 2. Fetch all child file records
 * 3. Delete S3 objects for each file
 * 4. Delete all child file records from DB
 * 5. Reset parent format's cached counts
 */
async function deleteFormatFilesActionHandler(
  params: DeleteFormatFilesParams
): Promise<ActionResult<{ deletedCount: number }>> {
  try {
    const { releaseId, formatType } = params;

    const formatRepo = new ReleaseDigitalFormatRepository();
    const format = await formatRepo.findByReleaseAndFormat(releaseId, formatType);

    if (!format) {
      return { success: false, error: 'Digital format not found for this release' };
    }

    // Fetch all child files to get their S3 keys
    const fileRepo = new ReleaseDigitalFormatFileRepository();
    const files = await fileRepo.findAllByFormatId(format.id);

    // Delete S3 objects (best-effort — continue even if some fail)
    const s3Promises = files.filter((f) => f.s3Key).map((f) => deleteS3Object(f.s3Key));
    await Promise.allSettled(s3Promises);

    // Delete all child file records from DB
    const deletedCount = await fileRepo.deleteAllByFormatId(format.id);

    // Reset parent format's cached counts
    await formatRepo.updateTrackCounts(format.id);

    return { success: true, data: { deletedCount } };
  } catch (error) {
    console.error('Delete format files action error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete format files',
    };
  }
}

/**
 * Server Action with admin authentication
 */
export async function deleteFormatFilesAction(
  params: DeleteFormatFilesParams
): Promise<ActionResult<{ deletedCount: number }>> {
  await requireRole('admin');
  return deleteFormatFilesActionHandler(params);
}
