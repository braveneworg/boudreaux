/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

import { PRESIGNED_URL_EXPIRATION } from '@/lib/constants/digital-formats';

interface StreamSigningConfig {
  keyPairId: string;
  privateKey: string;
  cdnDomain: string;
}

/**
 * Resolve the CloudFront signing identity for streaming URLs.
 *
 * Returns `null` when any required env var is missing, which lets callers
 * fall back to an unsigned CDN URL in dev / E2E / preview environments
 * where the CloudFront key pair is not provisioned.
 */
function getStreamSigningConfig(): StreamSigningConfig | null {
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const rawPem = process.env.CLOUDFRONT_PRIVATE_KEY;
  const base64Pem = process.env.CLOUDFRONT_PRIVATE_KEY_BASE64;
  const cdnDomainRaw = process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? '';

  if (!keyPairId || (!rawPem && !base64Pem) || !cdnDomainRaw) {
    return null;
  }

  const privateKey = base64Pem
    ? Buffer.from(base64Pem, 'base64').toString('utf8')
    : (rawPem ?? '').replace(/\\n/g, '\n');

  const cdnDomain = cdnDomainRaw.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return { keyPairId, privateKey, cdnDomain };
}

/**
 * Generate a CloudFront signed URL for streaming a private S3 object
 * via the CDN's `<audio>`/`<video>` tag.
 *
 * Unlike download signing, this URL does NOT embed a
 * `response-content-disposition` query string, so the browser plays the
 * media inline rather than triggering a "Save As" dialog.
 *
 * @param s3Key - S3 object key (no leading slash). When falsy, returns `null`.
 * @param expiresInSeconds - Expiration window. Defaults to the standard
 *   24-hour download TTL so a single signed URL is valid for the whole
 *   listening session including auto-advance through a tracklist.
 * @returns Signed CloudFront URL, or `null` when signing is unconfigured
 *   (caller should fall back to an unsigned CDN URL via `buildCdnUrl`).
 */
export function signStreamUrl(
  s3Key: string | null | undefined,
  expiresInSeconds: number = PRESIGNED_URL_EXPIRATION.DOWNLOAD
): string | null {
  if (!s3Key) {
    return null;
  }

  const config = getStreamSigningConfig();
  if (!config) {
    return null;
  }

  const encodedPath = s3Key.split('/').map(encodeURIComponent).join('/');
  const url = `https://${config.cdnDomain}/${encodedPath}`;
  const dateLessThan = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  try {
    return getSignedUrl({
      url,
      keyPairId: config.keyPairId,
      privateKey: config.privateKey,
      dateLessThan,
    });
  } catch (err) {
    console.error('CloudFront stream signing failed; falling back to unsigned URL:', err);
    return null;
  }
}
