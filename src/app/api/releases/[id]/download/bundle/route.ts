/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

import type { NextRequest } from 'next/server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import { getToken } from 'next-auth/jwt';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import { FORMAT_LABELS, type DigitalFormatType } from '@/lib/constants/digital-formats';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { PurchaseService } from '@/lib/services/purchase-service';
import { ReleaseService } from '@/lib/services/release-service';
import { buildContentDisposition } from '@/lib/utils/content-disposition';
import {
  generatePresignedDownloadUrl,
  getS3BucketName,
  getS3Client,
  verifyS3ObjectExists,
} from '@/lib/utils/s3-client';
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
 * How many S3 object bodies to download concurrently into memory ahead of
 * the archiver. archiver appends entries serially, and `archive.append`
 * with a Readable holds a single S3 socket open for the duration of that
 * entry — meaning header-only prefetching saves only ~TTFB per file, not
 * actual transfer time. By buffering bodies fully in parallel and feeding
 * archiver in-memory Buffers, the multipart S3 uploader can drain at full
 * throughput while N S3 GETs saturate downstream bandwidth concurrently.
 *
 * Memory cost: up to `depth` × file size held in RAM at peak. For typical
 * lossless releases (~50 MB/track) this caps around 400 MB which is
 * comfortable for serverful runtimes.
 */
const S3_PREFETCH_DEPTH = 8;

/** Multipart upload tuning — large parts + deep queue keeps the egress pipe full. */
const UPLOAD_PART_SIZE_BYTES = 16 * 1024 * 1024;
const UPLOAD_QUEUE_SIZE = 8;

/**
 * Download an S3 object's body fully into a Buffer. Resolves once the
 * entire body has been streamed to memory.
 */
async function fetchObjectBuffer(
  s3Client: ReturnType<typeof getS3Client>,
  bucket: string,
  key: string
): Promise<Buffer | null> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) {
    return null;
  }
  // AWS SDK v3 in Node returns an IncomingMessage with a smithy-injected
  // `transformToByteArray` helper; tests pass a plain `Readable`. Support both.
  const maybeTransform = (body as { transformToByteArray?: () => Promise<Uint8Array> })
    .transformToByteArray;
  if (typeof maybeTransform === 'function') {
    const bytes = await maybeTransform.call(body);
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return null;
}

/**
 * Issue a single prefetch and attach a passive rejection handler so that
 * if the consumer abandons the promise (e.g. another fetch fails first and
 * the surrounding try/catch exits the consume loop), Node does not log it
 * as an unhandled rejection. Awaiting the returned promise still observes
 * the original rejection.
 */
function issuePrefetch(
  s3Client: ReturnType<typeof getS3Client>,
  bucket: string,
  key: string
): Promise<Buffer | null> {
  const promise = fetchObjectBuffer(s3Client, bucket, key);
  // Suppress "unhandled rejection" — the consumer's `await` (or the outer
  // try/catch) is the authoritative handler.
  promise.catch(() => {});
  return promise;
}

function startBufferPrefetch(
  s3Client: ReturnType<typeof getS3Client>,
  bucket: string,
  keys: readonly string[],
  depth: number
): Array<Promise<Buffer | null>> {
  const inFlight: Array<Promise<Buffer | null>> = [];
  const initial = Math.min(depth, keys.length);
  for (let i = 0; i < initial; i++) {
    inFlight.push(issuePrefetch(s3Client, bucket, keys[i]));
  }
  return inFlight;
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
          resetInHours: access.resetInHours,
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // Step 5: Fetch release title for ZIP filename
    const release = await ReleaseService.findPublishedTitleById(releaseId);

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

    // Deterministic cache key keyed by release + sorted format list. Bundle
    // ZIPs are immutable for a given (release, formats) tuple — the
    // underlying digital format files are content-addressed by S3 key — so
    // we can safely reuse a previously-built ZIP across users. The S3
    // lifecycle rule `tmp-bundles-expire-after-1-day` (see
    // `scripts/s3-apply-lifecycle.ts`) bounds the cache TTL to 24 hours,
    // which also bounds the staleness window if a digital format is
    // re-uploaded for a release. The download URL itself is signed
    // per-request and the response Content-Disposition is set via
    // `ResponseContentDisposition` at signing time, so the cached object's
    // upload-time filename does not leak into the user's download.
    const sortedFormatKey = [...requestedFormats].sort().join('-');
    const cachedZipKey = `tmp/bundles/cache/${releaseId}/${sortedFormatKey}.zip`;
    const safeTitleForKey = release.title.replace(/[^\w\s.-]/g, '').trim() || 'release';
    const cachedZipFileName = `${safeTitleForKey}.zip`;

    // SSE streaming path: create a single combined ZIP containing all
    // requested formats as subfolders, streaming progress events to the
    // client as each format is appended. A single presigned download URL
    // is emitted once the archive upload completes — this ensures iOS
    // Safari (which cannot handle multiple concurrent downloads) receives
    // exactly one file.
    if (respondJson) {
      const s3ClientForZip = getS3Client();
      const bucketForZip = getS3BucketName();
      const zipFileName = cachedZipFileName;
      const tempZipKey = cachedZipKey;
      let combinedArchive: ReturnType<typeof archiver> | null = null;
      let combinedPassThrough: PassThrough | null = null;
      let combinedUpload: Upload | null = null;
      let uploadPromise: Promise<unknown> | null = null;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          };

          const completedFormats: DigitalFormatType[] = [];
          const abortSseUpload = async () => {
            combinedArchive?.abort();
            if (combinedPassThrough && !combinedPassThrough.destroyed) {
              combinedPassThrough.destroy();
            }
            combinedUpload?.abort();
            if (uploadPromise) {
              await uploadPromise.catch(() => undefined);
            }
          };

          try {
            // Cache hit fast path — a previously-built ZIP for this exact
            // (release, formats) tuple already exists in S3. Skip archiving
            // entirely, emit synthetic progress events so the UI advances
            // through `done` → `uploading` → `ready` immediately, and sign
            // a fresh download URL.
            if (await verifyS3ObjectExists(tempZipKey)) {
              for (const { formatType } of resolvedFormats) {
                const label = FORMAT_LABELS[formatType] ?? formatType;
                send('progress', { formatType, label, status: 'zipping' });
                completedFormats.push(formatType);
                send('progress', { formatType, label, status: 'done' });
              }
              send('progress', { status: 'uploading' });

              const downloadUrl = await generatePresignedDownloadUrl(
                tempZipKey,
                zipFileName,
                TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
              );
              send('ready', { downloadUrl, fileName: zipFileName });

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
              } catch (analyticsError) {
                console.error('Failed to record bundle download analytics (cache hit)', {
                  completedFormats,
                  analyticsError,
                  releaseId,
                });
              }

              send('complete', {});
              controller.close();
              return;
            }

            const archiveForSse = archiver('zip', { zlib: { level: 0 } });
            const passThroughForSse = new PassThrough();
            combinedArchive = archiveForSse;
            combinedPassThrough = passThroughForSse;
            archiveForSse.pipe(passThroughForSse);
            archiveForSse.on('error', (err) => passThroughForSse.destroy(err));

            // Start the S3 upload immediately so it consumes the archive
            // stream concurrently — otherwise the PassThrough buffer fills,
            // backpressure stalls the archiver, and the entry event never fires.
            combinedUpload = new Upload({
              client: s3ClientForZip,
              params: {
                Bucket: bucketForZip,
                Key: tempZipKey,
                Body: passThroughForSse,
                ContentType: 'application/zip',
                ContentDisposition: buildContentDisposition(zipFileName),
              },
              partSize: UPLOAD_PART_SIZE_BYTES,
              queueSize: UPLOAD_QUEUE_SIZE,
              leavePartsOnError: false,
            });

            uploadPromise = combinedUpload.done();

            // Append files — use format subfolders only when multiple
            // formats are bundled; single-format bundles are flat so the
            // zip filename (release title) is the only label the user sees.
            const useSubfolders = resolvedFormats.length > 1;
            for (const { formatType, files } of resolvedFormats) {
              const label = FORMAT_LABELS[formatType] ?? formatType;
              const safeFolderName = safeArchiveEntryName(label);
              send('progress', { formatType, label, status: 'zipping' });

              try {
                // Download bodies into memory in parallel so archiver only
                // does memory→memory copies and the multipart uploader can
                // drain at full throughput.
                const keys = files.map((f) => f.s3Key);
                const inFlight = startBufferPrefetch(
                  s3ClientForZip,
                  bucketForZip,
                  keys,
                  S3_PREFETCH_DEPTH
                );

                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const buffer = await inFlight[i];
                  // Eagerly enqueue the next download so a body is
                  // already in memory by the time we need it.
                  const nextIndex = i + S3_PREFETCH_DEPTH;
                  if (nextIndex < files.length) {
                    inFlight.push(issuePrefetch(s3ClientForZip, bucketForZip, keys[nextIndex]));
                  }

                  if (buffer === null) continue;
                  const entryName = useSubfolders
                    ? `${safeFolderName}/${safeArchiveEntryName(file.fileName)}`
                    : safeArchiveEntryName(file.fileName);
                  await new Promise<void>((resolve, reject) => {
                    archiveForSse.once('entry', () => resolve());
                    archiveForSse.once('error', reject);
                    archiveForSse.append(buffer, { name: entryName });
                  });
                }

                completedFormats.push(formatType);
                send('progress', { formatType, label, status: 'done' });
              } catch (formatError) {
                console.error(`Failed to append format ${formatType} to archive`, { formatError });
                send('error', { formatType, message: 'Failed to prepare download.' });
              }
            }

            if (completedFormats.length === 0) {
              await abortSseUpload();
              send('error', { message: 'No formats could be prepared.' });
              send('complete', {});
              controller.close();
              return;
            }

            // Finalize archive and wait for upload to complete
            send('progress', { status: 'uploading' });
            archiveForSse.finalize();
            await uploadPromise;

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
            await abortSseUpload();
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

    // Step 7: Create ZIP archive and upload to S3 as a temporary object.
    // Cache hit fast path — reuse a previously-built ZIP for this exact
    // (release, formats) tuple. The cache TTL is bounded by the
    // `tmp-bundles-expire-after-1-day` S3 lifecycle rule.
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();
    const tempS3Key = cachedZipKey;
    const zipFileName = cachedZipFileName;

    if (await verifyS3ObjectExists(tempS3Key)) {
      const downloadUrl = await generatePresignedDownloadUrl(
        tempS3Key,
        zipFileName,
        TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
      );

      try {
        await PurchaseRepository.upsertDownloadCount(userId, releaseId);

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
      } catch (analyticsError) {
        console.error('Failed to record bundle download analytics (cache hit, 302 path)', {
          analyticsError,
          releaseId,
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          Location: downloadUrl,
          ...NO_STORE_HEADERS,
        },
      });
    }

    const archive = archiver('zip', { zlib: { level: 0 } }); // store mode (no compression)
    const passThrough = new PassThrough();
    archive.pipe(passThrough);

    // Abort the S3 upload if archiver encounters an error
    archive.on('error', (err) => passThrough.destroy(err));

    // Start the S3 upload immediately so it consumes the archive stream
    // concurrently — otherwise the PassThrough buffer fills and deadlocks.
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: tempS3Key,
        Body: passThrough,
        ContentType: 'application/zip',
        ContentDisposition: buildContentDisposition(zipFileName),
      },
      partSize: UPLOAD_PART_SIZE_BYTES,
      queueSize: UPLOAD_QUEUE_SIZE,
      leavePartsOnError: false,
    });

    const uploadPromise = upload.done();

    // Pipe S3 objects into the archive — use format subfolders only
    // when multiple formats are bundled; single-format bundles are flat
    // so the zip filename (release title) is the only label the user sees.
    const useSubfolders = resolvedFormats.length > 1;
    const fileEntries = resolvedFormats.flatMap(({ formatType, files }) => {
      const folderName = safeArchiveEntryName(FORMAT_LABELS[formatType] ?? formatType);
      return files.map((file) => ({
        archivePath: useSubfolders
          ? `${folderName}/${safeArchiveEntryName(file.fileName)}`
          : safeArchiveEntryName(file.fileName),
        s3Key: file.s3Key,
      }));
    });

    try {
      // Download bodies into memory in parallel so archiver only does
      // memory→memory copies and the multipart uploader drains at full
      // throughput.
      const keys = fileEntries.map((e) => e.s3Key);
      const inFlight = startBufferPrefetch(s3Client, bucketName, keys, S3_PREFETCH_DEPTH);

      for (let i = 0; i < fileEntries.length; i++) {
        const fileEntry = fileEntries[i];
        const buffer = await inFlight[i];
        const nextIndex = i + S3_PREFETCH_DEPTH;
        if (nextIndex < fileEntries.length) {
          inFlight.push(issuePrefetch(s3Client, bucketName, keys[nextIndex]));
        }

        if (buffer === null) continue;
        await new Promise<void>((resolve, reject) => {
          archive.once('entry', () => resolve());
          archive.once('error', reject);
          archive.append(buffer, { name: fileEntry.archivePath });
        });
      }

      // Finalize the archive (no more entries) — starts emitting data
      archive.finalize();

      // Wait for the full upload to complete
      await uploadPromise;
    } catch (archiveError) {
      archive.abort();
      if (!passThrough.destroyed) {
        passThrough.destroy();
      }
      upload.abort();
      await uploadPromise.catch(() => undefined);
      throw archiveError;
    }

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
      // Intentionally do NOT delete the uploaded ZIP here — it lives at the
      // shared cache key (`tmp/bundles/cache/...`) and remains valid for
      // subsequent requests. The 24-hour S3 lifecycle rule on the
      // `tmp/bundles/` prefix still bounds its lifetime, and a future
      // request will simply reuse it via the cache hit fast path.
      console.error('Bundle post-upload error (cached ZIP retained)', {
        tempS3Key,
        postUploadError,
      });
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
