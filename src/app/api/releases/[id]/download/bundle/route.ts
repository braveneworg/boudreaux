/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomUUID } from 'node:crypto';
import { PassThrough, type Readable } from 'node:stream';

import type { NextRequest } from 'next/server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import { getToken } from 'next-auth/jwt';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS, type DigitalFormatType } from '@/lib/constants/digital-formats';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { prisma } from '@/lib/prisma';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { PurchaseService } from '@/lib/services/purchase-service';
import { generatePresignedDownloadUrl, getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import { bundleDownloadQuerySchema } from '@/lib/validation/bundle-download-schema';

/**
 * Allow up to 5 minutes for large multi-format bundles (WAV, AIFF).
 */
export const maxDuration = 300;

/**
 * GET /api/releases/[id]/download/bundle?formats=FLAC,WAV,...
 *
 * Bundle multiple digital format files into a single ZIP, upload it to S3
 * as a temporary object, and return a presigned download URL. This approach
 * works reliably on all platforms including iOS Safari, which silently
 * ignores blob: URL downloads triggered by programmatic anchor clicks.
 *
 * Authorization:
 * 1. Authenticate user
 * 2. Validate formats query parameter
 * 3. Verify purchase exists
 * 4. Check download limit (< MAX_RELEASE_DOWNLOAD_COUNT)
 * 5. Fetch release title for ZIP filename
 * 6. Resolve requested format records with child files from DB
 * 7. Stream files from S3 into archiver → Upload to S3 temp object
 * 8. Generate presigned download URL
 * 9. Increment download count once (bundle = 1 download)
 * 10. Log download event per format
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Rate limiting
    const ip = extractClientIp(request);
    try {
      await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    } catch {
      return Response.json(
        {
          success: false,
          error: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
        { status: 429 }
      );
    }

    // Step 1: Authentication
    const secureCookie = process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName: secureCookie ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      secureCookie,
    });

    if (!token?.sub) {
      return Response.json(
        { success: false, error: 'UNAUTHORIZED', message: 'You must be logged in to download.' },
        { status: 401 }
      );
    }

    const userId = token.sub;
    const { id: releaseId } = await context.params;

    // Validate release ID
    if (!isValidObjectId(releaseId)) {
      return Response.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400 }
      );
    }

    // Step 2: Parse and validate formats query parameter
    const formatsParam = request.nextUrl.searchParams.get('formats');
    const parseResult = bundleDownloadQuerySchema.safeParse({ formats: formatsParam });

    if (!parseResult.success) {
      return Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: parseResult.error.issues[0]?.message ?? 'Invalid formats parameter.',
        },
        { status: 400 }
      );
    }

    const requestedFormats = parseResult.data.formats as DigitalFormatType[];

    // Steps 3–4: Verify purchase and check download limit (with 6-hour auto-reset)
    const access = await PurchaseService.getDownloadAccess(userId, releaseId);

    if (!access.allowed && access.reason === 'no_purchase') {
      return Response.json(
        { success: false, error: 'PURCHASE_REQUIRED', message: 'Purchase required to download.' },
        { status: 403 }
      );
    }

    if (!access.allowed && access.reason === 'download_limit_reached') {
      return Response.json(
        {
          success: false,
          error: 'DOWNLOAD_LIMIT',
          message: `Download limit reached (${MAX_RELEASE_DOWNLOAD_COUNT}). Contact support.`,
        },
        { status: 403 }
      );
    }

    // Step 5: Fetch release title for ZIP filename
    const release = await prisma.release.findFirst({
      where: { id: releaseId, publishedAt: { not: null } },
      select: { id: true, title: true },
    });

    if (!release) {
      return Response.json(
        { success: false, error: 'NOT_FOUND', message: 'Release not found.' },
        { status: 404 }
      );
    }

    // Step 6: Resolve all requested format records with their files
    const formatRepo = new ReleaseDigitalFormatRepository();
    const resolvedFormats: Array<{
      formatType: DigitalFormatType;
      files: Array<{ s3Key: string; fileName: string }>;
    }> = [];

    for (const formatType of requestedFormats) {
      const format = await formatRepo.findByReleaseAndFormat(releaseId, formatType);

      if (!format) {
        continue; // skip unavailable formats silently
      }

      // Prefer multi-track child files; fall back to legacy single-file
      if (format.files && format.files.length > 0) {
        resolvedFormats.push({
          formatType,
          files: format.files.map((f) => ({ s3Key: f.s3Key, fileName: f.fileName })),
        });
      } else if (format.s3Key && format.fileName) {
        resolvedFormats.push({
          formatType,
          files: [{ s3Key: format.s3Key, fileName: format.fileName }],
        });
      }
    }

    if (resolvedFormats.length === 0) {
      return Response.json(
        { success: false, error: 'NO_FILES', message: 'No downloadable files found.' },
        { status: 404 }
      );
    }

    // Step 7: Create ZIP archive and upload to S3 as a temporary object
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    const archive = archiver('zip', { zlib: { level: 0 } }); // store mode (no compression)
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    // Abort the S3 upload if archiver encounters an error
    archive.on('error', (err) => passThrough.destroy(err));

    // Pipe S3 objects into the archive
    for (const { formatType, files } of resolvedFormats) {
      const folderName = FORMAT_LABELS[formatType] ?? formatType;

      for (const file of files) {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: file.s3Key,
        });

        const s3Response = await s3Client.send(command);

        if (s3Response.Body) {
          // S3 SDK v3 returns a Readable-compatible stream
          archive.append(s3Response.Body as Readable, {
            name: `${folderName}/${file.fileName}`,
          });
        }
      }
    }

    // Sanitize filename for Content-Disposition
    const safeTitle = release.title.replace(/[^\w\s.-]/g, '').trim() || 'release';
    const zipFileName = `${safeTitle}.zip`;

    // Upload the archive stream to a temporary S3 object
    const tempS3Key = `tmp/bundles/${userId}/${randomUUID()}.zip`;
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: tempS3Key,
        Body: passThrough,
        ContentType: 'application/zip',
        ContentDisposition: `attachment; filename="${encodeURIComponent(zipFileName)}"`,
      },
      partSize: 10 * 1024 * 1024, // 10 MB
      queueSize: 4,
      leavePartsOnError: false,
    });

    // Finalize the archive (no more entries) — starts emitting data
    archive.finalize();

    // Wait for the full upload to complete
    await upload.done();

    // Step 8: Generate a presigned download URL for the temporary ZIP
    const downloadUrl = await generatePresignedDownloadUrl(tempS3Key, zipFileName);

    // Step 9: Increment download count (bundle = 1 download action)
    await PurchaseRepository.upsertDownloadCount(userId, releaseId);

    // Step 10: Log download events per format
    const downloadEventRepo = new DownloadEventRepository();
    const ipAddress = request.headers.get('x-forwarded-for') ?? 'unknown';
    const userAgent = request.headers.get('user-agent') ?? 'unknown';

    await Promise.all(
      resolvedFormats.map(({ formatType }) =>
        downloadEventRepo.logDownloadEvent({
          userId,
          releaseId,
          formatType,
          success: true,
          ipAddress,
          userAgent,
        })
      )
    );

    return Response.json({
      success: true,
      downloadUrl,
      fileName: zipFileName,
    });
  } catch (error) {
    console.error('Bundle download error:', error);

    return Response.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
