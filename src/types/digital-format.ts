/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Digital Format Types
 *
 * TypeScript type definitions for digital audio format management.
 * Feature: 004-release-digital-formats
 */

import type { DigitalFormatType } from '@/lib/constants/digital-formats';

export type { DigitalFormatType };

/**
 * Upload state machine for digital format uploads
 */
export type UploadState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'uploading'; progress: number; currentFile: number; totalFiles: number }
  | { status: 'confirming' }
  | { status: 'pending-save'; s3Keys: string[] }
  | { status: 'success'; s3Keys: string[] }
  | { status: 'error'; message: string };

/**
 * File information for upload validation
 */
export interface FileInfo {
  formatType: DigitalFormatType; // Digital format type (e.g., "MP3_320KBPS")
  fileName: string; // Original filename (e.g., "album.mp3")
  mimeType: string; // MIME type (e.g., "audio/mpeg")
  fileSize: number; // File size in bytes
}

/**
 * Presigned upload URL response from Server Action
 */
export interface PresignedUploadResponse {
  uploadUrl: string; // S3 presigned PUT URL, valid for 15 minutes
  s3Key: string; // S3 object key for tracking upload completion
  expiresIn: number; // Expiration time in seconds (900 = 15 minutes)
  contentType: string; // Resolved Content-Type used to sign the URL (must match PUT header)
}

/**
 * Download authorization response from API endpoint
 */
export interface DownloadAuthorizationResponse {
  success: boolean;
  downloadUrl?: string; // S3 presigned GET URL, valid for 24 hours
  expiresAt?: string; // ISO8601 timestamp when the URL expires
  fileName?: string; // Suggested filename for browser download
  error?: string; // Error code (UNAUTHORIZED, QUOTA_EXCEEDED, NOT_FOUND, DELETED, INTERNAL_ERROR)
  message?: string; // Human-readable error message
  contactSupportUrl?: string; // Support URL (only for QUOTA_EXCEEDED errors)
}

/**
 * Digital format metadata from Prisma ReleaseDigitalFormat model
 */
export interface DigitalFormatMetadata {
  id: string;
  releaseId: string;
  formatType: DigitalFormatType;
  s3Key: string;
  fileName: string;
  fileSize: bigint; // BigInt from Prisma
  mimeType: string;
  checksum: string | null;
  deletedAt: Date | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User download quota information
 */
export interface UserDownloadQuotaInfo {
  userId: string;
  uniqueReleaseIds: string[]; // Array of release ObjectId strings
  remainingDownloads: number; // Calculated: MAX_FREE_DOWNLOAD_QUOTA - uniqueReleaseIds.length
  isQuotaExceeded: boolean; // uniqueReleaseIds.length >= MAX_FREE_DOWNLOAD_QUOTA
}

/**
 * Download analytics data for admin dashboard
 */
export interface DownloadAnalytics {
  releaseId: string;
  totalDownloads: number;
  uniqueUsers: number;
  formatBreakdown: Array<{
    formatType: DigitalFormatType;
    count: number;
  }>;
  periodStart?: string; // ISO8601 date
  periodEnd?: string; // ISO8601 date
}

/**
 * Download event tracking data
 */
export interface DownloadEventData {
  userId: string | null; // Null for guest downloads (future)
  releaseId: string;
  formatType: DigitalFormatType;
  success: boolean;
  errorCode?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Soft delete grace period check result
 */
export interface SoftDeleteCheckResult {
  isDeleted: boolean;
  deletedAt: Date | null;
  isWithinGracePeriod: boolean;
  gracePeriodEndsAt: Date | null;
  canAccess: boolean; // true if not deleted OR within grace period AND user has purchased
}

/**
 * Server Action result wrapper
 */
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Upload completion confirmation parameters
 */
export interface UploadConfirmationParams {
  releaseId: string;
  formatType: DigitalFormatType;
  s3Key: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum?: string;
  trackNumber?: number;
}

/**
 * Parameters for confirming a multi-track upload (all files for one format)
 */
export interface MultiTrackUploadConfirmationParams {
  releaseId: string;
  formatType: DigitalFormatType;
  files: Array<{
    trackNumber: number;
    s3Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }>;
}

/**
 * Individual track file metadata from Prisma ReleaseDigitalFormatFile model
 */
export interface DigitalFormatFileMetadata {
  id: string;
  formatId: string;
  trackNumber: number;
  s3Key: string;
  fileName: string;
  fileSize: bigint;
  mimeType: string;
  checksum: string | null;
  uploadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
