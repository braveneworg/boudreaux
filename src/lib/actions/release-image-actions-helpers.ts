/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { DeleteObjectCommand } from '@aws-sdk/client-s3';

import { loggers } from '@/lib/utils/logger';
import { getS3Client } from '@/lib/utils/s3-client';

const logger = loggers.s3;

const PROTOCOL_PREFIX_REGEX = /^(?:https:\/\/|http:\/\/)+/;

/**
 * Derive the S3 object key from a stored image `src`. Handles both CDN-fronted
 * URLs (strip protocol + `${cdnDomain}/`) and direct virtual-hosted S3 URLs
 * (`bucket.s3.region.amazonaws.com/key`). Returns `null` when the src matches
 * no known pattern or is a malformed S3 URL without a key path. Pure — mirrors
 * the prior inline extraction exactly.
 *
 * @param src - The stored image URL.
 * @param cdnDomain - CDN host (protocol-stripped), when configured.
 */
export const extractS3KeyFromImageSrc = (src: string, cdnDomain?: string): string | null => {
  if (cdnDomain && src.includes(cdnDomain)) {
    return src.replace(PROTOCOL_PREFIX_REGEX, '').replace(`${cdnDomain}/`, '');
  }

  if (src.includes('.s3.')) {
    const urlParts = src.split('.s3.');
    if (urlParts[1]) {
      return urlParts[1].split('/').slice(1).join('/');
    }
  }

  return null;
};

/**
 * Best-effort delete of an S3 object. Failures are logged and swallowed so the
 * caller can proceed with the DB delete (orphaned S3 objects are reconciled
 * out-of-band). Mirrors the prior inline try/catch exactly.
 */
export const deleteS3Object = async (bucket: string, key: string): Promise<void> => {
  try {
    const s3Client = getS3Client();
    const deleteCommand = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await s3Client.send(deleteCommand);
  } catch (s3Error) {
    logger.error('S3 delete error (continuing with DB delete)', s3Error);
  }
};
