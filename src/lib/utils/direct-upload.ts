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
  try {
    const response = await fetch(presignedUrl.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
        'Content-Length': file.size.toString(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('S3 upload error:', {
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

    return {
      success: true,
      s3Key: presignedUrl.s3Key,
      cdnUrl: presignedUrl.cdnUrl,
    };
  } catch (error) {
    console.error('Direct S3 upload error:', error);
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
