/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getToken } from 'next-auth/jwt';

import { MAX_FREE_DOWNLOAD_QUOTA, VALID_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { DownloadAuthorizationService } from '@/lib/services/download-authorization-service';
import { QuotaEnforcementService } from '@/lib/services/quota-enforcement-service';

/**
 * GET /api/releases/[id]/download/[formatType]
 *
 * Authorize and generate presigned download URL for digital format
 *
 * Authorization flow:
 * 1. Authenticate user
 * 2. Check format exists (not soft-deleted or within grace period)
 * 3. Check purchase status OR freemium quota
 * 4. Generate S3 presigned URL (24-hour expiration)
 * 5. Log download event
 * 6. Return signed URL
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; formatType: string }> }
): Promise<NextResponse> {
  try {
    // Step 1: Authentication check
    const secureCookie = process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName: secureCookie ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      secureCookie,
    });

    if (!token?.sub) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'You must be logged in to download releases.',
        },
        { status: 401 }
      );
    }

    const userId = token.sub;
    const { id: releaseId, formatType } = await context.params;

    // Validate formatType
    if (!VALID_FORMAT_TYPES.includes(formatType as DigitalFormatType)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FORMAT',
          message: 'Invalid digital format type.',
        },
        { status: 400 }
      );
    }

    // Initialize services and repositories
    const authService = new DownloadAuthorizationService();
    const downloadEventRepo = new DownloadEventRepository();
    const quotaService = new QuotaEnforcementService();

    // Step 2: Check if format exists and is not soft-deleted
    const format = await authService.checkFormatExists(releaseId, formatType as DigitalFormatType);

    if (!format) {
      return NextResponse.json(
        {
          success: false,
          error: 'NOT_FOUND',
          message: 'The requested digital format is not available for this release.',
        },
        { status: 404 }
      );
    }

    // Step 3: Check purchase status
    const hasPurchased = await authService.checkPurchaseStatus(userId, releaseId);

    // Step 4: If no purchase, check freemium quota
    if (!hasPurchased) {
      const quotaCheck = await quotaService.checkFreeDownloadQuota(userId, releaseId);

      if (!quotaCheck.allowed) {
        // Log failed download attempt
        await downloadEventRepo.logDownloadEvent({
          userId,
          releaseId,
          formatType: formatType as DigitalFormatType,
          success: false,
          errorCode: 'QUOTA_EXCEEDED',
          ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        });

        return NextResponse.json(
          {
            success: false,
            error: 'QUOTA_EXCEEDED',
            message: `You have reached your free download limit (${MAX_FREE_DOWNLOAD_QUOTA} unique releases). Please purchase this release or contact support.`,
            contactSupportUrl: '/support',
          },
          { status: 403 }
        );
      }

      // Track new unique release download (skip if already downloaded)
      if (quotaCheck.reason === 'WITHIN_QUOTA') {
        await quotaService.incrementQuota(userId, releaseId);
      }
    }

    // Step 5: Check soft delete grace period (only if deletedAt is set)
    if (format.deletedAt) {
      const withinGracePeriod = await authService.checkSoftDeleteGracePeriod(format);

      if (!withinGracePeriod && !hasPurchased) {
        // Log failed download attempt
        await downloadEventRepo.logDownloadEvent({
          userId,
          releaseId,
          formatType: formatType as DigitalFormatType,
          success: false,
          errorCode: 'DELETED',
          ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        });

        return NextResponse.json(
          {
            success: false,
            error: 'DELETED',
            message: 'This digital format is no longer available.',
          },
          { status: 410 }
        );
      }

      // If purchased, allow download even if beyond grace period
      // (This is a courtesy for purchasers to retain access to deleted formats)
    }

    // Step 6: Generate presigned download URL
    if (!format.s3Key || !format.fileName) {
      return NextResponse.json(
        {
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Format file data is incomplete.',
        },
        { status: 500 }
      );
    }

    const downloadUrl = await authService.generateDownloadUrl(format.s3Key, format.fileName);

    // Calculate expiration timestamp (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Step 7: Log successful download event
    await downloadEventRepo.logDownloadEvent({
      userId,
      releaseId,
      formatType: formatType as DigitalFormatType,
      success: true,
      ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // Step 8: Return success response
    return NextResponse.json(
      {
        success: true,
        downloadUrl,
        expiresAt,
        fileName: format.fileName,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Download authorization error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
      },
      { status: 500 }
    );
  }
}
