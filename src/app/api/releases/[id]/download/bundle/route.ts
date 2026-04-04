/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Readable } from 'node:stream';

import type { NextRequest } from 'next/server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import { getToken } from 'next-auth/jwt';

import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS, type DigitalFormatType } from '@/lib/constants/digital-formats';
import { prisma } from '@/lib/prisma';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { PurchaseService } from '@/lib/services/purchase-service';
import { getS3BucketName, getS3Client } from '@/lib/utils/s3-client';
import { bundleDownloadQuerySchema } from '@/lib/validation/bundle-download-schema';

/**
 * Allow up to 5 minutes for large multi-format bundles (WAV, AIFF).
 */
export const maxDuration = 300;

/**
 * GET /api/releases/[id]/download/bundle?formats=FLAC,WAV,...
 *
 * Bundle multiple digital format files into a single ZIP and stream it
 * directly to the client. Audio files are stored (level 0) since they
 * are already compressed.
 *
 * Authorization:
 * 1. Authenticate user
 * 2. Validate formats query parameter
 * 3. Verify purchase exists
 * 4. Check download limit (< MAX_RELEASE_DOWNLOAD_COUNT)
 * 5. Fetch format records with child files from DB
 * 6. Stream files from S3 into archiver → Web ReadableStream
 * 7. Increment download count once (bundle = 1 download)
 * 8. Log download event per format
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
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

    // Step 3: Verify purchase and check download limit (with 6-hour auto-reset)
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

    // Step 7: Create ZIP archive and stream S3 files into it
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    const archive = archiver('zip', { zlib: { level: 0 } }); // store mode (no compression)

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

    // Finalize the archive (no more entries)
    archive.finalize();

    // Convert Node.js Readable to Web ReadableStream
    const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;

    // Sanitize filename for Content-Disposition
    const safeTitle = release.title.replace(/[^\w\s.-]/g, '').trim() || 'release';
    const zipFileName = `${safeTitle}.zip`;

    // Step 8: Increment download count (bundle = 1 download action)
    await PurchaseRepository.upsertDownloadCount(userId, releaseId);

    // Step 9: Log download events per format
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

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipFileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Bundle download error:', error);

    return Response.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
