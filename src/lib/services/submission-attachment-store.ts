/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { publishedAttachmentKey } from '@fakefour/job-contract';

import { isLocalUpload, localObjectUrl, localReadObject } from '@/lib/actions/upload-local-adapter';
import { getSubmissionUploadsBucket, isFeatureEnabled } from '@/lib/config/runtime-config';
import { buildCdnUrl } from '@/lib/utils/cdn-url';
import { invalidateCloudFrontPaths } from '@/lib/utils/cloudfront-invalidation';
import { loggers } from '@/lib/utils/logger';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';

/**
 * Where a submission's attachment files are kept and served from (ADR-0027).
 * Uploads and re-encoded copies sit in a private bucket the CDN cannot read;
 * approving a submission copies its files to the media bucket, and taking it
 * offline deletes them there. One port, an S3 adapter, and a local adapter
 * for E2E, where there is no bucket.
 */

const logger = loggers.s3;

/** How long a presigned upload stays usable, in seconds. */
const UPLOAD_URL_SECONDS = 900;

/** How long a signed link to a private copy stays usable, in seconds. */
const PREVIEW_URL_SECONDS = 3600;

/** The bucket name the local adapter hands the fake re-encode. */
const LOCAL_BUCKET = 'local-submission-uploads';

/** What the store knows of an uploaded object. */
export interface StoredUpload {
  bytes: number;
  contentType: string;
}

/** The upload a presigned URL is made for. */
export interface UploadTarget {
  key: string;
  contentType: string;
  contentLength: number;
}

/** The store, as the attachment rules see it. Keys are private-bucket keys throughout. */
export interface AttachmentStore {
  /** Whether uploads can be taken at all. */
  isConfigured: () => boolean;
  /** The private bucket's name, for the re-encode's invoke payload. */
  bucket: () => string;
  /** A URL the browser PUTs one upload to. The length and type are signed in. */
  presignUpload: (target: UploadTarget) => Promise<string>;
  /** What was uploaded at a key, or `null` when nothing is there. */
  headUpload: (key: string) => Promise<StoredUpload | null>;
  /** A short-lived link to a private copy, for its owner or an approver. */
  previewUrl: (copyKey: string) => Promise<string>;
  /** The CDN address a copy is served at while its submission is approved. */
  publicUrl: (copyKey: string) => string;
  /** Copy private files to the media bucket. All of them, or none. */
  publish: (copyKeys: string[]) => Promise<void>;
  /** Remove the published files and ask the CDN to drop them. */
  unpublish: (copyKeys: string[]) => Promise<void>;
  /** Delete uploads or copies from the private bucket. */
  deletePrivate: (keys: string[]) => Promise<void>;
}

const privateBucket = (): string => {
  const bucket = getSubmissionUploadsBucket();
  if (!bucket) {
    throw new Error('Submission uploads bucket not configured (SUBMISSION_UPLOADS_BUCKET)');
  }

  return bucket;
};

/** Delete `keys` from `bucket`. Every caller has already ruled out an empty list. */
const deleteFrom = async (bucket: string, keys: string[]): Promise<void> => {
  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    })
  );
};

/** A stale file at the edge is a nuisance, never a reason to fail the write it follows. */
const invalidate = async (publishedKeys: string[]): Promise<void> => {
  if (!isFeatureEnabled('cloudfrontInvalidation')) {
    return;
  }

  try {
    await invalidateCloudFrontPaths(publishedKeys.map((key) => `/${key}`));
  } catch (error) {
    logger.error('[attachment store] CDN invalidation failed', error);
  }
};

const s3Store: AttachmentStore = {
  isConfigured: () => getSubmissionUploadsBucket() !== undefined,
  bucket: privateBucket,

  presignUpload: ({ key, contentType, contentLength }) =>
    getSignedUrl(
      getS3Client(),
      new PutObjectCommand({
        Bucket: privateBucket(),
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: UPLOAD_URL_SECONDS }
    ),

  headUpload: async (key) => {
    try {
      const { ContentLength, ContentType } = await getS3Client().send(
        new HeadObjectCommand({ Bucket: privateBucket(), Key: key })
      );

      return ContentLength === undefined
        ? null
        : { bytes: ContentLength, contentType: ContentType ?? 'application/octet-stream' };
    } catch {
      // Not there, or not readable: either way there is no upload to confirm.
      return null;
    }
  },

  previewUrl: (copyKey) =>
    getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: privateBucket(), Key: copyKey }), {
      expiresIn: PREVIEW_URL_SECONDS,
    }),

  publicUrl: (copyKey) => buildCdnUrl(publishedAttachmentKey(copyKey)),

  publish: async (copyKeys) => {
    if (copyKeys.length === 0) {
      return;
    }

    const client = getS3Client();
    const source = privateBucket();
    const media = getS3BucketName();

    try {
      await Promise.all(
        copyKeys.map((key) =>
          client.send(
            new CopyObjectCommand({
              Bucket: media,
              Key: publishedAttachmentKey(key),
              CopySource: `${source}/${key}`,
              // The re-encode set the type and cache headers; keep them.
              MetadataDirective: 'COPY',
            })
          )
        )
      );
    } catch (error) {
      // All or none: a half-published submission must not look approved.
      await deleteFrom(media, copyKeys.map(publishedAttachmentKey)).catch((cleanupError) => {
        logger.error('[attachment store] cleanup after a failed publish failed', cleanupError);
      });
      throw error;
    }
  },

  unpublish: async (copyKeys) => {
    const publishedKeys = copyKeys.map(publishedAttachmentKey);
    if (publishedKeys.length === 0) {
      return;
    }

    await deleteFrom(getS3BucketName(), publishedKeys);
    await invalidate(publishedKeys);
  },

  deletePrivate: (keys) =>
    keys.length === 0 ? Promise.resolve() : deleteFrom(privateBucket(), keys),
};

/**
 * The E2E stand-in: uploads go to the in-memory sink, and a copy is "served"
 * from its CDN address, which the suite routes to a local fixture. Nothing is
 * copied or deleted, because nothing was stored.
 */
const localStore: AttachmentStore = {
  isConfigured: () => true,
  bucket: () => LOCAL_BUCKET,
  presignUpload: async ({ key }) => localObjectUrl(key),
  headUpload: async (key) => {
    const object = localReadObject(key);

    return object ? { bytes: object.body.byteLength, contentType: object.contentType } : null;
  },
  previewUrl: async (copyKey) => buildCdnUrl(publishedAttachmentKey(copyKey)),
  publicUrl: (copyKey) => buildCdnUrl(publishedAttachmentKey(copyKey)),
  publish: async () => undefined,
  unpublish: async () => undefined,
  deletePrivate: async () => undefined,
};

const current = (): AttachmentStore => (isLocalUpload() ? localStore : s3Store);

/** The store every caller uses: the adapter is chosen per call, by `E2E_MODE`. */
export const attachmentStore: AttachmentStore = {
  isConfigured: () => current().isConfigured(),
  bucket: () => current().bucket(),
  presignUpload: (target) => current().presignUpload(target),
  headUpload: (key) => current().headUpload(key),
  previewUrl: (copyKey) => current().previewUrl(copyKey),
  publicUrl: (copyKey) => current().publicUrl(copyKey),
  publish: (copyKeys) => current().publish(copyKeys),
  unpublish: (copyKeys) => current().unpublish(copyKeys),
  deletePrivate: (keys) => current().deletePrivate(keys),
};
