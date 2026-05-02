/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

import { buildContentDisposition } from '@/lib/utils/content-disposition';

interface CloudFrontSignedUrlInput {
  /** S3 object key (no leading slash), e.g. `releases/abc/digital-formats/.../track.mp3`. */
  s3Key: string;
  /** Suggested filename used in the Content-Disposition header. */
  fileName: string;
  /** Expiration in seconds from now. */
  expiresInSeconds: number;
}

/**
 * Returns the configured CloudFront signing identity, or `null` when not
 * configured (lets callers fall back to S3 presigned URLs in dev/test).
 *
 * Required env vars (production):
 *  - `CLOUDFRONT_KEY_PAIR_ID` — the public key ID shown in the CloudFront
 *    console after uploading a public key (starts with `K...`).
 *  - `CLOUDFRONT_PRIVATE_KEY` — the PEM-encoded RSA private key (PKCS#1 or
 *    PKCS#8). Multi-line PEMs from AWS Secrets Manager / SSM work as-is.
 *    For env files use either the literal PEM with `\n` escapes or pass a
 *    base64 blob via `CLOUDFRONT_PRIVATE_KEY_BASE64` instead.
 *  - `NEXT_PUBLIC_CDN_DOMAIN` (or `CDN_DOMAIN`) — the CloudFront domain
 *    the URL is signed for (must match the distribution serving the file).
 */
function getCloudFrontSigningConfig(): {
  keyPairId: string;
  privateKey: string;
  cdnDomain: string;
} | null {
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const rawPem = process.env.CLOUDFRONT_PRIVATE_KEY;
  const base64Pem = process.env.CLOUDFRONT_PRIVATE_KEY_BASE64;
  const cdnDomainRaw = process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? '';

  if (!keyPairId || (!rawPem && !base64Pem) || !cdnDomainRaw) {
    return null;
  }

  // Normalise: env files often store PEMs with literal `\n` rather than real
  // newlines. The signer requires real newlines in the PEM.
  const privateKey = base64Pem
    ? Buffer.from(base64Pem, 'base64').toString('utf8')
    : (rawPem ?? '').replace(/\\n/g, '\n');

  const cdnDomain = cdnDomainRaw.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return { keyPairId, privateKey, cdnDomain };
}

/** Returns true when CloudFront URL signing is fully configured. */
export function isCloudFrontSigningConfigured(): boolean {
  return getCloudFrontSigningConfig() !== null;
}

/**
 * Generate a CloudFront signed URL for a private S3 object served via the
 * CDN. The URL embeds `response-content-disposition` and
 * `response-content-type` query strings so the browser downloads the file
 * with the correct filename — these query strings must be forwarded to the
 * S3 origin by the CloudFront cache behaviour (see setup docs).
 *
 * @returns A signed CloudFront URL, or `null` if CloudFront signing is not
 *   configured (the caller should then fall back to an S3 presigned URL).
 */
export function generateCloudFrontSignedUrl(input: CloudFrontSignedUrlInput): string | null {
  const config = getCloudFrontSigningConfig();
  if (!config) {
    return null;
  }

  const { s3Key, fileName, expiresInSeconds } = input;

  // Build the unsigned URL with response-* query strings so S3 honours the
  // filename when the bytes are served back through CloudFront.
  const encodedPath = s3Key.split('/').map(encodeURIComponent).join('/');
  const params = new URLSearchParams({
    'response-content-disposition': buildContentDisposition(fileName),
    'response-content-type': 'application/octet-stream',
  });
  const url = `https://${config.cdnDomain}/${encodedPath}?${params.toString()}`;

  const dateLessThan = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  try {
    return getSignedUrl({
      url,
      keyPairId: config.keyPairId,
      privateKey: config.privateKey,
      dateLessThan,
    });
  } catch (err) {
    console.error('CloudFront signing failed; falling back to S3 presigned URL:', err);
    return null;
  }
}
