/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectsCommand, ListObjectsV2Command, type _Object } from '@aws-sdk/client-s3';

import { requireRole } from '@/lib/utils/auth/require-role';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { OBJECT_ID_REGEX } from '@/lib/utils/validation/object-id';

export interface FinalizeCoverArtUploadResult {
  success: boolean;
  deletedKeys: string[];
  invalidationId?: string;
  error?: string;
}

const ALLOWED_ENTITY_TYPES = new Set([
  'releases',
  'artists',
  'featured-artists',
  'tracks',
  'notifications',
]);

/**
 * Filename of the new cover original (e.g. `cover.png`). The variant generator
 * writes siblings as `cover_w{N}.png` (same format) and `cover_w{N}.webp`
 * (transcoded). Any other `cover(_w*)?\.{ext}` files in the same prefix are
 * leftovers from a prior upload at a different extension and should be
 * deleted.
 */
function isOrphan(fileName: string, newExt: string): boolean {
  const match = fileName.match(/^cover(_w\d+)?(\.[^.]+)$/);
  if (!match) return false;
  const isVariant = !!match[1];
  const ext = match[2].toLowerCase();
  if (ext === newExt) return false;
  // WebP variants get rewritten by the variant generator (it transcodes every
  // raster format to .webp). Same-key overwrite means they're already fresh,
  // not orphans. The originals (`cover.webp` from a prior upload) ARE orphans
  // because they live at `cover.webp`, not the new key.
  if (isVariant && ext === '.webp') return false;
  return true;
}

/**
 * Run AFTER a successful cover-art upload + variant generation. Two jobs:
 *
 *   1. Delete cross-extension orphans. When the user uploads `cover.jpg` after
 *      previously having `cover.png`, the PNG family doesn't get touched by the
 *      new PUT — it just becomes dead bytes in S3. This action lists everything
 *      under `media/{entityType}/{entityId}/` and removes anything that doesn't
 *      belong to the new cover or the regenerated WebP variant set.
 *
 *   2. Invalidate the CloudFront cache for that entire prefix in one shot, so
 *      the new bytes (and the now-deleted ones) propagate to edge POPs without
 *      waiting on TTL. Single wildcard invalidation = one billable path.
 *
 * Skips the CloudFront step silently when `CLOUDFRONT_DISTRIBUTION_ID` isn't
 * configured (local dev / E2E).
 */
export const finalizeCoverArtUploadAction = async (
  entityType: string,
  entityId: string,
  newCoverKey: string
): Promise<FinalizeCoverArtUploadResult> => {
  await requireRole('admin');

  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return { success: false, deletedKeys: [], error: `Disallowed entityType: ${entityType}` };
  }
  if (!OBJECT_ID_REGEX.test(entityId)) {
    return { success: false, deletedKeys: [], error: 'Invalid entity ID' };
  }

  const prefix = `media/${entityType}/${entityId}/`;
  if (!newCoverKey.startsWith(prefix)) {
    return {
      success: false,
      deletedKeys: [],
      error: `newCoverKey must be under prefix ${prefix}`,
    };
  }

  const newFileName = newCoverKey.substring(prefix.length);
  const newExtMatch = newFileName.match(/\.[^.]+$/);
  if (!newExtMatch) {
    return { success: false, deletedKeys: [], error: 'newCoverKey has no file extension' };
  }
  const newExt = newExtMatch[0].toLowerCase();

  const s3 = getS3Client();
  const bucket = getS3BucketName();

  let listed: _Object[] = [];
  try {
    let continuationToken: string | undefined;
    do {
      const response = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      listed = listed.concat(response.Contents ?? []);
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown S3 list error';
    return { success: false, deletedKeys: [], error: `S3 list failed: ${msg}` };
  }

  const orphans = listed
    .map((o) => o.Key)
    .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
    .filter((k) => isOrphan(k.substring(prefix.length), newExt));

  if (orphans.length > 0) {
    try {
      // S3 DeleteObjects accepts up to 1000 keys per call. Cover-art prefixes
      // hold a handful of files at most, so a single batch is safe.
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: orphans.map((Key) => ({ Key })), Quiet: true },
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown S3 delete error';
      return { success: false, deletedKeys: [], error: `S3 delete failed: ${msg}` };
    }
  }

  // Wildcard invalidation covers (a) the freshly-overwritten new cover key,
  // (b) every regenerated `_w{N}.{ext}` and `_w{N}.webp` variant, and
  // (c) every just-deleted orphan — all in one billable path.
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  let invalidationId: string | undefined;
  if (distributionId) {
    try {
      const region = process.env.AWS_REGION ?? 'us-east-1';
      const cf = new CloudFrontClient({ region });
      const invalidationPath = `/${prefix}*`;
      const result = await cf.send(
        new CreateInvalidationCommand({
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: `cover-art-${entityType}-${entityId}-${Date.now()}`,
            Paths: { Quantity: 1, Items: [invalidationPath] },
          },
        })
      );
      invalidationId = result.Invalidation?.Id;
    } catch (err) {
      // Best-effort: cleanup already succeeded; cache will refresh on TTL.
      console.warn('[finalizeCoverArtUpload] CloudFront invalidation failed:', err);
    }
  }

  return { success: true, deletedKeys: orphans, invalidationId };
};
