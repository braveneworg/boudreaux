/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';
import { FORMAT_SIZE_LIMITS, FORMAT_MIME_TYPES } from '@/lib/constants/digital-formats';
import { generatePresignedUploadUrl } from '@/lib/utils/s3-client';
import type { DigitalFormatType, FileInfo } from '@/types/digital-format';

/**
 * Service for handling digital format upload operations
 * Validates file info, generates presigned URLs, creates metadata
 */
export class UploadService {
  /**
   * Validate file information against format-specific rules
   */
  validateFileInfo(fileInfo: FileInfo): {
    valid: boolean;
    error?: string;
  } {
    const { formatType, fileName, fileSize, mimeType } = fileInfo;

    // Validate file name
    if (!fileName || fileName.trim().length === 0) {
      return { valid: false, error: 'File name is required' };
    }

    // Validate file size is positive
    if (fileSize <= 0) {
      return { valid: false, error: 'File size must be positive' };
    }

    // Format-specific size validation
    const sizeLimit = FORMAT_SIZE_LIMITS[formatType];
    if (fileSize > sizeLimit) {
      const limitMB = Math.floor(sizeLimit / (1024 * 1024));
      return {
        valid: false,
        error: `File size exceeds ${limitMB} MB limit for ${formatType}`,
      };
    }

    // MIME type validation (allow empty — browsers may not report MIME for some formats)
    const validMimeTypes: readonly string[] = FORMAT_MIME_TYPES[formatType];
    if (mimeType !== '' && !validMimeTypes.includes(mimeType)) {
      return {
        valid: false,
        error: `Invalid MIME type. Expected: ${validMimeTypes.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Generate presigned upload URL for S3
   * 15-minute expiration for upload window
   */
  async generatePresignedUploadUrl(
    releaseId: string,
    formatType: DigitalFormatType,
    fileName: string,
    mimeType: string
  ): Promise<{ uploadUrl: string; s3Key: string; contentType: string }> {
    // Generate S3 key with timestamp to avoid collisions
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
    const s3Key = `releases/${releaseId}/digital-formats/${formatType}/${timestamp}-${sanitizedFileName}`;

    const result = await generatePresignedUploadUrl(s3Key, formatType, mimeType);

    return { uploadUrl: result.uploadUrl, s3Key, contentType: result.contentType };
  }

  /**
   * Create format metadata object for database storage
   */
  createFormatMetadata(params: {
    releaseId: string;
    formatType: DigitalFormatType;
    s3Key: string;
    fileName: string;
    fileSize: number | bigint;
    mimeType: string;
  }): {
    releaseId: string;
    formatType: DigitalFormatType;
    s3Key: string;
    fileName: string;
    fileSize: bigint;
    mimeType: string;
    uploadedAt: Date;
  } {
    return {
      releaseId: params.releaseId,
      formatType: params.formatType,
      s3Key: params.s3Key,
      fileName: params.fileName,
      fileSize: typeof params.fileSize === 'bigint' ? params.fileSize : BigInt(params.fileSize),
      mimeType: params.mimeType,
      uploadedAt: new Date(),
    };
  }
}
