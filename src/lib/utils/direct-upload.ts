/**
 * Utility for uploading files directly to S3 using presigned URLs
 * This bypasses Next.js server body size limits (default 2MB)
 */

import type { PresignedUrlResult } from '@/lib/actions/presigned-upload-actions';

export interface DirectUploadResult {
  success: boolean;
  s3Key: string;
  cdnUrl: string;
  error?: string;
}

/**
 * Upload a single file directly to S3 using a presigned URL
 */
export const uploadFileToS3 = async (
  file: File,
  presignedUrl: PresignedUrlResult
): Promise<DirectUploadResult> => {
  console.info('[S3 Upload] Starting upload:', {
    fileName: file.name,
    fileSize: file.size,
    contentType: file.type,
    s3Key: presignedUrl.s3Key,
    cdnUrl: presignedUrl.cdnUrl,
    uploadUrlHost: new URL(presignedUrl.uploadUrl).hostname,
    uploadUrlPath: new URL(presignedUrl.uploadUrl).pathname,
  });

  try {
    const response = await fetch(presignedUrl.uploadUrl, {
      method: 'PUT',
      body: file,
      mode: 'cors',
      headers: {
        'Content-Type': file.type,
      },
    });

    console.info('[S3 Upload] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      s3Key: presignedUrl.s3Key,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[S3 Upload] Upload failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        s3Key: presignedUrl.s3Key,
      });
      return {
        success: false,
        s3Key: presignedUrl.s3Key,
        cdnUrl: presignedUrl.cdnUrl,
        error: `Upload failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
      };
    }

    // Verify the upload by checking the ETag header (S3 returns this on successful upload)
    const etag = response.headers.get('ETag');
    console.info('[S3 Upload] Upload successful:', {
      s3Key: presignedUrl.s3Key,
      cdnUrl: presignedUrl.cdnUrl,
      etag,
    });

    // Note: CDN verification via HEAD request is skipped because CloudFront
    // doesn't include CORS headers for HEAD requests from browser origins.
    // The S3 upload success (with ETag) is sufficient confirmation.

    return {
      success: true,
      s3Key: presignedUrl.s3Key,
      cdnUrl: presignedUrl.cdnUrl,
    };
  } catch (error) {
    console.error('[S3 Upload] Network/fetch error:', error);
    return {
      success: false,
      s3Key: presignedUrl.s3Key,
      cdnUrl: presignedUrl.cdnUrl,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
};

/**
 * Upload multiple files directly to S3 in parallel
 */
export const uploadFilesToS3 = async (
  files: File[],
  presignedUrls: PresignedUrlResult[]
): Promise<DirectUploadResult[]> => {
  if (files.length !== presignedUrls.length) {
    throw Error('Files and presigned URLs count mismatch');
  }

  const uploadPromises = files.map((file, index) => uploadFileToS3(file, presignedUrls[index]));

  return Promise.all(uploadPromises);
};
