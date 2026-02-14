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
export function extractS3KeyFromUrl(url: string): string | null {
  if (!url || url === 'pending://upload') {
    return null;
  }

  const cdnDomainRaw = process.env.CDN_DOMAIN;
  const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');

  if (cdnDomain && url.includes(cdnDomain)) {
    // Extract key from CDN URL (handles both correct and malformed URLs with double https://)
    return url.replace(/^(https?:\/\/)+/, '').replace(`${cdnDomain}/`, '');
  }

  if (url.includes('.s3.')) {
    // Extract key from S3 URL: https://{bucket}.s3.{region}.amazonaws.com/{s3Key}
    const urlParts = url.split('.s3.');
    if (urlParts[1]) {
      return urlParts[1].split('/').slice(1).join('/');
    }
  }

  return null;
}
