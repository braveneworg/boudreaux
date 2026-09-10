/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/** Entity namespaces media keys are filed under. */
export type MediaEntityType =
  | 'artists'
  | 'releases'
  | 'tracks'
  | 'notifications'
  | 'featured-artists'
  | 'videos'
  | 'tours'
  | 'tour-dates';

interface BuildMediaS3KeyArgs {
  entityType: MediaEntityType;
  entityId: string;
  /** The client-supplied original file name. Treated as untrusted. */
  fileName: string;
  /** Extension used when the candidate is missing or not allowlisted. */
  fallbackExtension?: string;
}

/**
 * An extension we are willing to echo into a key: short and alphanumeric.
 *
 * The extension is the one part of a key derived from an untrusted name that
 * is not otherwise stripped, so it is allowlisted rather than sanitized. A name
 * like `photo.jpg/nested/evil` yields `/nested/evil` from a naive
 * `split('.').pop()`, which would push extra path segments into the key — and
 * these keys are later handed to `deleteS3Object`.
 */
const SAFE_EXTENSION = /^[a-z0-9]{1,8}$/;

/**
 * Build a collision-resistant, namespaced S3 key for an uploaded media file.
 *
 * The single builder for every media upload path — artist images, tour images,
 * posters, cover art, and videos. It previously existed as four separate
 * copies of the same algorithm, of which only the video one allowlisted the
 * extension; the other three would echo an attacker-shaped suffix into the key.
 *
 * @param args - Namespace, owning entity, untrusted file name, and fallback.
 * @returns `media/{entityType}/{entityId}/{name}-{timestamp}-{random}.{ext}`
 */
export const buildMediaS3Key = ({
  entityType,
  entityId,
  fileName,
  fallbackExtension = 'jpg',
}: BuildMediaS3KeyArgs): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);

  // `split('.').pop()` returns the whole name when there is no dot, so a file
  // called `noext` would become its own extension. Require a real separator,
  // and treat a leading dot (`.gitignore`) as no extension rather than one.
  const lastDot = fileName.lastIndexOf('.');
  const candidate = lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
  const extension = SAFE_EXTENSION.test(candidate) ? candidate : fallbackExtension;

  const sanitizedName = fileName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  return `media/${entityType}/${entityId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
};

/**
 * A virtual-hosted S3 endpoint: `{bucket}.s3.{region}.amazonaws.com`, or the
 * legacy region-less `{bucket}.s3.amazonaws.com`. Anchored to
 * `amazonaws.com` — a bare `.s3.` test also matched hosts like
 * `bucket.s3.attacker.example.com`, and the namespace guards downstream only
 * inspect the KEY, so any host that yields `media/videos/{id}/…` passed them.
 */
const S3_VIRTUAL_HOST =
  /^([a-z0-9][a-z0-9.-]{1,61}[a-z0-9])\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;

/**
 * The S3 key of an S3-hosted URL, or `null` when the host is not our bucket's
 * own S3 endpoint. When no bucket is configured the endpoint shape is still
 * required — that alone rejects look-alike hosts — but the bucket identity
 * cannot be checked, so a real S3 host is accepted.
 */
const extractKeyFromS3Host = (host: string, key: string): string | null => {
  const bucket = S3_VIRTUAL_HOST.exec(host)?.[1];
  if (!bucket || !key) return null;
  const ourBucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET;
  return !ourBucket || bucket === ourBucket ? key : null;
};

/**
 * Extract the S3 key from a CDN or S3 URL
 *
 * Supports:
 * - CDN URLs: https://{cdnDomain}/{s3Key}
 * - S3 URLs: https://{bucket}.s3.{region}.amazonaws.com/{s3Key}
 *
 * @param url - The full CDN or S3 URL
 * @returns The S3 key, or null if extraction fails
 */
export const extractS3KeyFromUrl = (url: string): string | null => {
  if (!url || url === 'pending://upload') {
    return null;
  }

  const cdnDomainRaw = process.env.CDN_DOMAIN;
  const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');

  if (cdnDomain && url.includes(cdnDomain)) {
    // Extract key from CDN URL (handles both correct and malformed URLs with double https://)
    return url.replace(/^(?:https:\/\/|http:\/\/)+/, '').replace(`${cdnDomain}/`, '');
  }

  // Extract key from S3 URL: https://{bucket}.s3.{region}.amazonaws.com/{s3Key}
  const [host = '', ...keySegments] = url.replace(/^(?:https?:\/\/)+/, '').split('/');
  return extractKeyFromS3Host(host.toLowerCase(), keySegments.join('/'));
};
