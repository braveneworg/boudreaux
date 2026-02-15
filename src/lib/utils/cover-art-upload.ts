/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/**
 * Utility for uploading base64 cover art images to S3
 * Handles conversion from data URL to blob and S3 upload
 */

import {
  getPresignedUploadUrlsAction,
  type PresignedUrlResult,
} from '@/lib/actions/presigned-upload-actions';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';

/**
 * Result of uploading cover art
 */
export interface CoverArtUploadResult {
  success: boolean;
  cdnUrl?: string;
  error?: string;
}

/**
 * Extract MIME type from a base64 data URL
 */
const getMimeTypeFromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/jpeg';
};

/**
 * Get file extension from MIME type
 */
const getExtensionFromMimeType = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
  };
  return mimeToExt[mimeType] || 'jpg';
};

/**
 * Convert a base64 data URL to a File object
 */
const base64ToFile = (dataUrl: string, fileName: string): File => {
  const mimeType = getMimeTypeFromDataUrl(dataUrl);
  const base64Data = dataUrl.split(',')[1];
  const byteString = atob(base64Data);
  const byteArray = new Uint8Array(byteString.length);

  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }

  const blob = new Blob([byteArray], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
};

/**
 * Upload a base64 cover art image to S3 and return the CDN URL
 *
 * @param base64DataUrl - The base64 data URL (e.g., data:image/jpeg;base64,...)
 * @param albumName - Album name to use in the file name (optional)
 * @returns The CDN URL of the uploaded image or undefined if upload fails
 */
export const uploadCoverArtToS3 = async (
  base64DataUrl: string,
  albumName?: string
): Promise<CoverArtUploadResult> => {
  try {
    // Extract MIME type and create file
    const mimeType = getMimeTypeFromDataUrl(base64DataUrl);
    const extension = getExtensionFromMimeType(mimeType);
    const sanitizedAlbumName = (albumName || 'cover')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50);
    const fileName = `${sanitizedAlbumName}-cover.${extension}`;

    const file = base64ToFile(base64DataUrl, fileName);

    console.info('[Cover Art Upload] Converting base64 to file:', {
      fileName,
      mimeType,
      fileSize: file.size,
    });

    // Get presigned URL for upload
    // Use 'releases' as entity type since cover art is typically per-album
    const presignedResult = await getPresignedUploadUrlsAction('releases', 'coverart', [
      {
        fileName,
        contentType: mimeType,
        fileSize: file.size,
      },
    ]);

    if (!presignedResult.success || !presignedResult.data?.[0]) {
      console.error('[Cover Art Upload] Failed to get presigned URL:', presignedResult.error);
      return {
        success: false,
        error: presignedResult.error || 'Failed to get upload URL',
      };
    }

    const presignedUrl: PresignedUrlResult = presignedResult.data[0];

    // Upload to S3
    const uploadResult = await uploadFileToS3(file, presignedUrl);

    if (!uploadResult.success) {
      console.error('[Cover Art Upload] S3 upload failed:', uploadResult.error);
      return {
        success: false,
        error: uploadResult.error || 'Upload failed',
      };
    }

    console.info('[Cover Art Upload] Successfully uploaded cover art:', {
      cdnUrl: uploadResult.cdnUrl,
    });

    return {
      success: true,
      cdnUrl: uploadResult.cdnUrl,
    };
  } catch (error) {
    console.error('[Cover Art Upload] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Upload multiple cover art images to S3 in batch
 * Groups by album to avoid uploading duplicate cover art
 *
 * @param coverArts - Array of { base64, albumName } pairs
 * @returns Map of albumName (lowercase) to cdnUrl
 */
export const uploadCoverArtsToS3 = async (
  coverArts: Array<{ base64: string; albumName?: string }>
): Promise<Map<string, string>> => {
  const albumToCdnUrl = new Map<string, string>();

  // Deduplicate by album name to avoid uploading the same cover art multiple times
  const uniqueAlbums = new Map<string, string>();
  for (const { base64, albumName } of coverArts) {
    const key = (albumName || '').toLowerCase().trim() || `unknown-${uniqueAlbums.size}`;
    if (!uniqueAlbums.has(key)) {
      uniqueAlbums.set(key, base64);
    }
  }

  console.info('[Cover Art Upload] Uploading unique cover arts:', {
    total: coverArts.length,
    unique: uniqueAlbums.size,
  });

  // Upload each unique cover art
  for (const [albumKey, base64] of uniqueAlbums) {
    const result = await uploadCoverArtToS3(base64, albumKey);
    if (result.success && result.cdnUrl) {
      albumToCdnUrl.set(albumKey, result.cdnUrl);
    }
  }

  return albumToCdnUrl;
};
