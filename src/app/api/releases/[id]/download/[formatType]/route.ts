/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextResponse } from 'next/server';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import {
  FREE_FORMAT_TYPES,
  MAX_FREE_DOWNLOAD_QUOTA,
  VALID_FORMAT_TYPES,
  isFreeFormatType,
} from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { withAuth } from '@/lib/decorators/with-auth';
import { withLogging } from '@/lib/decorators/with-logging';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { DownloadAuthorizationService } from '@/lib/services/download-authorization-service';
import { QuotaEnforcementService } from '@/lib/services/quota-enforcement-service';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

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

type FormatRecord = NonNullable<
  Awaited<ReturnType<DownloadAuthorizationService['checkFormatExists']>>
>;

// Rate limiting — skipped in E2E test mode to avoid 429s during test runs,
// matching the `withRateLimit` decorator on the sibling free-status route.
const enforceDownloadRateLimit = async (ip: string): Promise<NextResponse | null> => {
  if (process.env.E2E_MODE === 'true') {
    return null;
  }
  try {
    await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    return null;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      },
      { status: 429 }
    );
  }
};

const validateDownloadParams = (releaseId: string, formatType: string): NextResponse | null => {
  if (!isValidObjectId(releaseId)) {
    return NextResponse.json(
      { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
      { status: 400 }
    );
  }
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
  return null;
};

const logFailedDownload = async (args: {
  repo: DownloadEventRepository;
  request: Request;
  userId: string;
  releaseId: string;
  formatType: DigitalFormatType;
  errorCode: string;
}): Promise<void> => {
  await args.repo.logDownloadEvent({
    userId: args.userId,
    releaseId: args.releaseId,
    formatType: args.formatType,
    success: false,
    errorCode: args.errorCode,
    ipAddress: args.request.headers.get('x-forwarded-for') ?? 'unknown',
    userAgent: args.request.headers.get('user-agent') || 'unknown',
  });
};

// A non-purchaser may only pull free formats (MP3_320KBPS / AAC) through the
// freemium path. Lossless masters (FLAC/WAV/AIFF/ALAC) — and any other paid
// format — require a purchase; the freemium quota is keyed on unique releases,
// not format, so without this gate it would hand out lossless masters for free.
const enforceFreeFormatRestriction = async (args: {
  downloadEventRepo: DownloadEventRepository;
  request: Request;
  userId: string;
  releaseId: string;
  formatType: DigitalFormatType;
}): Promise<NextResponse | null> => {
  const { downloadEventRepo, request, userId, releaseId, formatType } = args;
  if (isFreeFormatType(formatType)) {
    return null;
  }

  await logFailedDownload({
    repo: downloadEventRepo,
    request,
    userId,
    releaseId,
    formatType,
    errorCode: 'PURCHASE_REQUIRED',
  });
  return NextResponse.json(
    {
      success: false,
      error: 'PURCHASE_REQUIRED',
      message: `This format requires a purchase. Free downloads are limited to ${FREE_FORMAT_TYPES.join(', ')}.`,
      contactSupportUrl: '/support',
    },
    { status: 403 }
  );
};

const enforceFreemiumQuota = async (args: {
  quotaService: QuotaEnforcementService;
  downloadEventRepo: DownloadEventRepository;
  request: Request;
  userId: string;
  releaseId: string;
  formatType: DigitalFormatType;
}): Promise<NextResponse | null> => {
  const { quotaService, downloadEventRepo, request, userId, releaseId, formatType } = args;

  // Free formats only for non-purchasers — lossless masters need a purchase.
  const formatResponse = await enforceFreeFormatRestriction({
    downloadEventRepo,
    request,
    userId,
    releaseId,
    formatType,
  });
  if (formatResponse) return formatResponse;

  const quotaCheck = await quotaService.checkFreeDownloadQuota({ kind: 'user', userId }, releaseId);

  if (!quotaCheck.allowed) {
    await logFailedDownload({
      repo: downloadEventRepo,
      request,
      userId,
      releaseId,
      formatType,
      errorCode: 'QUOTA_EXCEEDED',
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
    await quotaService.incrementQuota({ kind: 'user', userId }, releaseId);
  }

  return null;
};

const enforceSoftDeleteGrace = async (args: {
  authService: DownloadAuthorizationService;
  downloadEventRepo: DownloadEventRepository;
  request: Request;
  format: FormatRecord;
  userId: string;
  releaseId: string;
  formatType: DigitalFormatType;
  hasPurchased: boolean;
}): Promise<NextResponse | null> => {
  const {
    authService,
    downloadEventRepo,
    request,
    format,
    userId,
    releaseId,
    formatType,
    hasPurchased,
  } = args;
  const withinGracePeriod = await authService.checkSoftDeleteGracePeriod(format);

  if (!withinGracePeriod && !hasPurchased) {
    await logFailedDownload({
      repo: downloadEventRepo,
      request,
      userId,
      releaseId,
      formatType,
      errorCode: 'DELETED',
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
  return null;
};

const buildDownloadSuccess = async (args: {
  authService: DownloadAuthorizationService;
  downloadEventRepo: DownloadEventRepository;
  request: Request;
  format: FormatRecord;
  userId: string;
  releaseId: string;
  formatType: DigitalFormatType;
}): Promise<NextResponse> => {
  const { authService, downloadEventRepo, request, format, userId, releaseId, formatType } = args;

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
    formatType,
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
};

export const GET = withLogging<{ id: string; formatType: string }>('DOWNLOADS')(
  withAuth<{ id: string; formatType: string }>(async (request, context, session) => {
    try {
      const ip = extractClientIp(request);
      const rateLimitResponse = await enforceDownloadRateLimit(ip);
      if (rateLimitResponse) return rateLimitResponse;

      const userId = session.user.id;
      const { id: releaseId, formatType } = await context.params;

      const paramResponse = validateDownloadParams(releaseId, formatType);
      if (paramResponse) return paramResponse;

      // Initialize services and repositories
      const authService = new DownloadAuthorizationService();
      const downloadEventRepo = new DownloadEventRepository();
      const quotaService = new QuotaEnforcementService();

      // Step 2: Check if format exists and is not soft-deleted
      const format = await authService.checkFormatExists(
        releaseId,
        formatType as DigitalFormatType
      );

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

      // Step 4: If no purchase, restrict to free formats + enforce the quota
      if (!hasPurchased) {
        const quotaResponse = await enforceFreemiumQuota({
          quotaService,
          downloadEventRepo,
          request,
          userId,
          releaseId,
          formatType: formatType as DigitalFormatType,
        });
        if (quotaResponse) return quotaResponse;
      }

      // Step 5: Check soft delete grace period (only if deletedAt is set)
      if (format.deletedAt) {
        const deleteResponse = await enforceSoftDeleteGrace({
          authService,
          downloadEventRepo,
          request,
          format,
          userId,
          releaseId,
          formatType: formatType as DigitalFormatType,
          hasPurchased,
        });
        if (deleteResponse) return deleteResponse;
      }

      // Step 6: Generate presigned download URL
      return buildDownloadSuccess({
        authService,
        downloadEventRepo,
        request,
        format,
        userId,
        releaseId,
        formatType: formatType as DigitalFormatType,
      });
    } catch (error) {
      loggers.downloads.error('Download authorization error', error);

      return NextResponse.json(
        {
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        },
        { status: 500 }
      );
    }
  })
);
