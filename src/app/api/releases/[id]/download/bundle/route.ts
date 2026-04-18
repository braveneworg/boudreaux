/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PassThrough, type Readable } from 'node:stream';

import type { NextRequest } from 'next/server';

import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
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
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;
const TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS = 15 * 60;
/**
 * Temp bundle ZIPs are written to `tmp/bundles/{userId}/{uuid}.zip`.
 * Cleanup contract: an S3 lifecycle rule expires anything under that prefix
 * after 1 day (see `scripts/s3-apply-lifecycle.ts`, rule
 * `tmp-bundles-expire-after-1-day`). We cannot delete synchronously here —
 * the client must still follow the 302 to the presigned URL — and the
 * presigned URL is only valid for 15 minutes, so the lifecycle rule is the
 * authoritative janitor. If you move this code or rename the prefix, update
 * the lifecycle script.
 */

/**
 * Defense-in-depth against zip-slip: force every archive entry to a
 * path.basename without slashes, backslashes, or `..`. Upload-time validation
 * should already guarantee safe names, but an archive with `../../etc/passwd`
 * would escape on server-side extraction (backups, scanners, admin review).
 */
function safeArchiveEntryName(fileName: string): string {
  const base = path.basename(fileName).replace(/[\\/]/g, '_');
  const sanitized = base.replace(/[^A-Za-z0-9._\- ]/g, '_').replace(/\.{2,}/g, '_');
  return sanitized.length > 0 ? sanitized : 'file';
}

/**
 * GET /api/releases/[id]/download/bundle?formats=FLAC,WAV,...[&respond=json]
 *
 * Bundle multiple digital format files into a single ZIP, upload it to S3
 * as a temporary object, and respond with a 302 redirect to a short-lived
 * presigned download URL. Redirecting (rather than returning JSON) lets the
 * client trigger the request with a synchronous `window.open(url, '_self')`
 * inside the user's click gesture — the only pattern iOS Safari honors for
 * downloads. The presigned URL sets Content-Disposition: attachment so the
 * browser downloads the ZIP without leaving the current page.
 *
 * Response contract:
 * - Default: 302 redirect to the short-lived presigned ZIP URL
 * - respond=json: streams SSE events while one combined ZIP is prepared and
 *   uploaded to S3. Events: progress (per-format zipping + uploading), ready
 *   (single download URL), error (per-format/global failure), complete.
 *   Download count increment and per-format download-event logging happen
 *   server-side on a best-effort basis after ready is emitted.
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
        { status: 429, headers: NO_STORE_HEADERS }
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
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const userId = token.sub;
    const { id: releaseId } = await context.params;

    // Validate release ID
    if (!isValidObjectId(releaseId)) {
      return Response.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Step 2: Parse and validate formats query parameter
    const formatsParam = request.nextUrl.searchParams.get('formats');
    const respondJson = request.nextUrl.searchParams.get('respond') === 'json';
    const parseResult = bundleDownloadQuerySchema.safeParse({ formats: formatsParam });

    if (!parseResult.success) {
      return Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: parseResult.error.issues[0]?.message ?? 'Invalid formats parameter.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const requestedFormats = parseResult.data.formats as DigitalFormatType[];

    // Steps 3–4: Verify purchase and check download limit (with 6-hour auto-reset)
    const access = await PurchaseService.getDownloadAccess(userId, releaseId);

    if (!access.allowed && access.reason === 'no_purchase') {
      return Response.json(
        { success: false, error: 'PURCHASE_REQUIRED', message: 'Purchase required to download.' },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (!access.allowed && access.reason === 'download_limit_reached') {
      return Response.json(
        {
          success: false,
          error: 'DOWNLOAD_LIMIT',
          message: `Download limit reached (${MAX_RELEASE_DOWNLOAD_COUNT}). Contact support.`,
        },
        { status: 403, headers: NO_STORE_HEADERS }
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
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Step 6: Resolve all requested format records with their files (single query)
    const formatRepo = new ReleaseDigitalFormatRepository();
    const allFormats = await formatRepo.findAllByRelease(releaseId);
    const formatMap = new Map(allFormats.map((f) => [f.formatType, f]));

    const resolvedFormats: Array<{
      formatType: DigitalFormatType;
      files: Array<{ s3Key: string; fileName: string }>;
    }> = [];

    for (const formatType of requestedFormats) {
      const format = formatMap.get(formatType);

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
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // SSE streaming path: create a single combined ZIP containing all
    // requested formats as subfolders, streaming progress events to the
    // client as each format is appended. A single presigned download URL
    // is emitted once the archive upload completes — this ensures iOS
    // Safari (which cannot handle multiple concurrent downloads) receives
    // exactly one file.
    if (respondJson) {
      const s3ClientForZip = getS3Client();
      const bucketForZip = getS3BucketName();
      const safeTitle = release.title.replace(/[^\w\s.-]/g, '').trim() || 'release';
      const zipFileName = `${safeTitle}.zip`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          };

          const completedFormats: DigitalFormatType[] = [];

          try {
            const combinedArchive = archiver('zip', { zlib: { level: 0 } });
            const combinedPassThrough = new PassThrough();
            combinedArchive.pipe(combinedPassThrough);
            combinedArchive.on('error', (err) => combinedPassThrough.destroy(err));

            // Append files for each format into a subfolder
            for (const { formatType, files } of resolvedFormats) {
              const label = FORMAT_LABELS[formatType] ?? formatType;
              const safeFolderName = safeArchiveEntryName(label);
              send('progress', { formatType, label, status: 'zipping' });

              try {
                for (const file of files) {
                  const s3Response = await s3ClientForZip.send(
                    new GetObjectCommand({ Bucket: bucketForZip, Key: file.s3Key })
                  );
                  if (s3Response.Body) {
                    await new Promise<void>((resolve, reject) => {
                      combinedArchive.once('entry', () => resolve());
                      combinedArchive.once('error', reject);
                      combinedArchive.append(s3Response.Body as Readable, {
                        name: `${safeFolderName}/${safeArchiveEntryName(file.fileName)}`,
                      });
                    });
                  }
                }

                completedFormats.push(formatType);
                send('progress', { formatType, label, status: 'done' });
              } catch (formatError) {
                console.error(`Failed to append format ${formatType} to archive`, { formatError });
                send('error', { formatType, message: 'Failed to prepare download.' });
              }
            }

            if (completedFormats.length === 0) {
              send('error', { message: 'No formats could be prepared.' });
              send('complete', {});
              controller.close();
              return;
            }

            // Finalize archive and upload to S3
            send('progress', { status: 'uploading' });

            const tempZipKey = `tmp/bundles/${userId}/${randomUUID()}.zip`;
            const combinedUpload = new Upload({
              client: s3ClientForZip,
              params: {
                Bucket: bucketForZip,
                Key: tempZipKey,
                Body: combinedPassThrough,
                ContentType: 'application/zip',
                ContentDisposition: `attachment; filename="${encodeURIComponent(zipFileName)}"`,
              },
              partSize: 10 * 1024 * 1024,
              queueSize: 4,
              leavePartsOnError: false,
            });

            combinedArchive.finalize();
            await combinedUpload.done();

            // Generate presigned URL
            const downloadUrl = await generatePresignedDownloadUrl(
              tempZipKey,
              zipFileName,
              TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
            );

            send('ready', { downloadUrl, fileName: zipFileName });

            // Increment download count and log events server-side on a best-effort basis.
            try {
              await PurchaseRepository.upsertDownloadCount(userId, releaseId);

              const downloadEventRepo = new DownloadEventRepository();
              const ipAddress = request.headers.get('x-forwarded-for') ?? 'unknown';
              const userAgent = request.headers.get('user-agent') ?? 'unknown';

              await Promise.all(
                completedFormats.map((formatType) =>
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
            } catch (error) {
              console.error('Failed to record bundle download analytics', {
                completedFormats,
                error,
                releaseId,
              });
            }
          } catch (streamError) {
            console.error('Bundle SSE stream error', { streamError });
            send('error', { message: 'An unexpected error occurred.' });
          }

          send('complete', {});
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'private, no-store',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Step 7: Create ZIP archive and upload to S3 as a temporary object
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();

    const archive = archiver('zip', { zlib: { level: 0 } }); // store mode (no compression)
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    // Abort the S3 upload if archiver encounters an error
    archive.on('error', (err) => passThrough.destroy(err));

    // Pipe S3 objects into the archive (fetch all files concurrently)
    const fileEntries = resolvedFormats.flatMap(({ formatType, files }) => {
      const folderName = safeArchiveEntryName(FORMAT_LABELS[formatType] ?? formatType);
      return files.map((file) => ({
        archivePath: `${folderName}/${safeArchiveEntryName(file.fileName)}`,
        s3Key: file.s3Key,
      }));
    });

    for (const fileEntry of fileEntries) {
      const s3Response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: fileEntry.s3Key })
      );
      const body = s3Response.Body;
      if (body) {
        await new Promise<void>((resolve, reject) => {
          archive.once('entry', () => resolve());
          archive.once('error', reject);
          archive.append(body as Readable, { name: fileEntry.archivePath });
        });
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

    try {
      // Step 8: Generate a short-lived presigned download URL for the temporary ZIP
      const downloadUrl = await generatePresignedDownloadUrl(
        tempS3Key,
        zipFileName,
        TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
      );

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

      return new Response(null, {
        status: 302,
        headers: {
          Location: downloadUrl,
          ...NO_STORE_HEADERS,
        },
      });
    } catch (postUploadError) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: tempS3Key,
          })
        );
      } catch (cleanupError) {
        console.error('Failed to clean up temporary bundle after post-upload error', {
          tempS3Key,
          originalError: postUploadError,
          cleanupError,
        });
      }
      throw postUploadError;
    }
  } catch (error) {
    console.error('Bundle download error', {
      error,
    });

    return Response.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
