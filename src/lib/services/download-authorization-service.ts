/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import { SOFT_DELETE_GRACE_PERIOD_DAYS } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';
import { generatePresignedDownloadUrl } from '@/lib/utils/s3-client';

import type { ReleaseDigitalFormat } from '@prisma/client';

/**
 * Service for authorizing digital format downloads with purchase verification
 * and soft delete grace period checks
 */
export class DownloadAuthorizationService {
  /**
   * Check if user has purchased a release
   *
   * @param userId - User ID
   * @param releaseId - Release ID
   * @returns True if user has a successful purchase, false otherwise
   */
  async checkPurchaseStatus(userId: string, releaseId: string): Promise<boolean> {
    const purchase = await prisma.releasePurchase.findUnique({
      where: {
        userId_releaseId: {
          userId,
          releaseId,
        },
      },
    });

    return purchase !== null;
  }

  /**
   * Check if a digital format exists and is not soft-deleted
   *
   * @param releaseId - Release ID
   * @param formatType - Digital format type
   * @returns Format record if exists and not deleted, null otherwise
   */
  async checkFormatExists(
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<ReleaseDigitalFormat | null> {
    return prisma.releaseDigitalFormat.findFirst({
      where: {
        releaseId,
        formatType,
        deletedAt: null,
      },
    });
  }

  /**
   * Check if a soft-deleted format is within the grace period
   *
   * @param format - Digital format record
   * @returns True if within grace period or not deleted, false if beyond grace period
   */
  async checkSoftDeleteGracePeriod(format: ReleaseDigitalFormat): Promise<boolean> {
    // If not deleted, always allow
    if (!format.deletedAt) {
      return true;
    }

    const now = new Date();
    const gracePeriodMs = SOFT_DELETE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const deletedTime = format.deletedAt.getTime();
    const expirationTime = deletedTime + gracePeriodMs;

    return now.getTime() <= expirationTime;
  }

  /**
   * Generate presigned S3 download URL with 24-hour expiration
   *
   * @param s3Key - S3 object key
   * @param fileName - Original filename for Content-Disposition header
   * @returns Presigned download URL
   */
  async generateDownloadUrl(s3Key: string, fileName: string): Promise<string> {
    return generatePresignedDownloadUrl(s3Key, fileName);
  }

  /**
   * Authorize download with full validation: purchase check, format existence,
   * and grace period verification
   *
   * @param userId - User ID requesting download
   * @param releaseId - Release ID
   * @param formatType - Digital format type
   * @returns Authorization result with download URL if authorized, error details if not
   */
  async authorizeDownload(
    userId: string,
    releaseId: string,
    formatType: DigitalFormatType
  ): Promise<
    | {
        authorized: true;
        downloadUrl: string;
        format: ReleaseDigitalFormat;
      }
    | {
        authorized: false;
        errorCode: string;
        message: string;
      }
  > {
    // Step 1: Check purchase status
    const hasPurchased = await this.checkPurchaseStatus(userId, releaseId);
    if (!hasPurchased) {
      return {
        authorized: false,
        errorCode: 'PURCHASE_REQUIRED',
        message: 'Purchase required to download this release',
      };
    }

    // Step 2: Check if format exists
    const format = await this.checkFormatExists(releaseId, formatType);
    if (!format) {
      return {
        authorized: false,
        errorCode: 'FORMAT_NOT_FOUND',
        message: 'Digital format not available',
      };
    }

    // Step 3: Check grace period (only relevant if deletedAt is set)
    if (format.deletedAt) {
      const withinGracePeriod = await this.checkSoftDeleteGracePeriod(format);
      if (!withinGracePeriod) {
        return {
          authorized: false,
          errorCode: 'FORMAT_EXPIRED',
          message: 'Digital format no longer available',
        };
      }
    }

    // Step 4: Generate presigned download URL
    if (!format.s3Key || !format.fileName) {
      return {
        authorized: false,
        errorCode: 'INTERNAL_ERROR',
        message: 'Format file data is incomplete',
      };
    }

    const downloadUrl = await this.generateDownloadUrl(format.s3Key, format.fileName);

    return {
      authorized: true,
      downloadUrl,
      format,
    };
  }
}
