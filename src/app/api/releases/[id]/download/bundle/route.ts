/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import path from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';

import type { NextRequest } from 'next/server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import { getToken } from 'next-auth/jwt';

import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { MAX_RELEASE_DOWNLOAD_COUNT } from '@/lib/constants';
import {
  FORMAT_LABELS,
  FREE_FORMAT_TYPES,
  isFreeFormatType,
  type DigitalFormatType,
} from '@/lib/constants/digital-formats';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import { DownloadEventRepository } from '@/lib/repositories/download-event-repository';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { freeDownloadLockService } from '@/lib/services/free-download-lock-service';
import {
  CapReachedError,
  freeDownloadQuotaService,
} from '@/lib/services/free-download-quota-service';
import { PurchaseService } from '@/lib/services/purchase-service';
import { ReleaseService } from '@/lib/services/release-service';
import { buildContentDisposition } from '@/lib/utils/content-disposition';
import { readGuestVisitorId, setGuestVisitorIdCookie } from '@/lib/utils/guest-visitor-id';
import {
  generatePresignedDownloadUrl,
  getS3BucketName,
  getS3Client,
  verifyS3ObjectExists,
} from '@/lib/utils/s3-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import { computeFingerprintHash } from '@/lib/utils/visitor-fingerprint';
import { bundleDownloadQuerySchema } from '@/lib/validation/bundle-download-schema';
import type { DownloadSubject } from '@/types/download-subject';

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
  // Hoisted so the outer `finally` can release the in-process collision lock
  // regardless of which exit branch the request takes (success, audit
  // rejection, S3 failure, etc.). The 30s TTL on the lock entry bounds
  // leakage if a process crashes between acquire and release.
  let outerLockAcquired = false;
  let outerLockKey: string | null = null;
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

    // Step 1: Authentication (deferred for mode='free' — guest flow)
    const secureCookie = process.env.NODE_ENV === 'production' && process.env.E2E_MODE !== 'true';
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      cookieName: secureCookie ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      secureCookie,
    });

    const { id: releaseId } = await context.params;

    // Validate release ID
    if (!isValidObjectId(releaseId)) {
      return Response.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Step 2: Parse and validate formats + mode query parameters
    const formatsParam = request.nextUrl.searchParams.get('formats');
    const modeParam = request.nextUrl.searchParams.get('mode') ?? undefined;
    const respondJson = request.nextUrl.searchParams.get('respond') === 'json';
    const respondStream = request.nextUrl.searchParams.get('respond') === 'stream';
    const respondPreflight = request.nextUrl.searchParams.get('respond') === 'preflight';
    const parseResult = bundleDownloadQuerySchema.safeParse({
      formats: formatsParam,
      mode: modeParam,
    });

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
    const mode = parseResult.data.mode;
    const isFreeMode = mode === 'free';

    // Auth gating: paid mode requires a session; free mode is open to guests.
    if (!isFreeMode && !token?.sub) {
      return Response.json(
        { success: false, error: 'UNAUTHORIZED', message: 'You must be logged in to download.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const userId = token?.sub ?? null;

    // Free-mode: resolve guest visitor identity BEFORE any streaming starts so
    // the Set-Cookie header is part of the initial Response. iOS Safari only
    // honors a cookie issued in the very first byte of the response — placing
    // this work after the ReadableStream body would silently strip it.
    //
    // Authenticated users on the free path bypass the visitor cookie entirely
    // (Session 2026-05-08 Q5, T061) — their cap is keyed by `userId`, not
    // by composite identity.
    let guestVisitorId: string | null = null;
    let guestAllVisitorIds: string[] | undefined;
    if (isFreeMode && !userId) {
      const cookieValue = await readGuestVisitorId();
      const fingerprintHash = computeFingerprintHash({
        userAgent: request.headers.get('user-agent'),
        acceptLanguage: request.headers.get('accept-language'),
        ip: extractClientIp(request),
      });
      const identity = await freeDownloadQuotaService.resolveVisitorIdentity({
        cookieValue,
        fingerprintHash,
      });
      if (identity.cookieReissue) {
        await setGuestVisitorIdCookie(identity.primaryVisitorId);
      }
      guestVisitorId = identity.primaryVisitorId;
      guestAllVisitorIds = identity.allVisitorIds;
    }

    // For free-mode flows we still want to retain the format-restriction check
    // (defence-in-depth — schema also validates this).
    const isFreeOnlyRequest = requestedFormats.every(isFreeFormatType);
    if (isFreeMode && !isFreeOnlyRequest) {
      return Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: `Free downloads only support ${FREE_FORMAT_TYPES.join(', ')}`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Steps 3–4: Verify purchase and check download limit (with 6-hour auto-reset).
    // Free mode skips both — guest downloads are gated by the freemium quota
    // service (added in US2/US3). The per-release download cap is still
    // enforced for paid/free-only authenticated downloads below.
    if (!isFreeMode) {
      // Non-null assertion equivalent: userId is guaranteed by the auth gate above.
      const access = await PurchaseService.getDownloadAccess(
        { kind: 'user', userId: userId as string },
        releaseId
      );

      if (!access.allowed && access.reason === 'no_purchase' && !isFreeOnlyRequest) {
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
    }

    // Step 5: Fetch release title for ZIP filename
    const release = await ReleaseService.findPublishedTitleById(releaseId);

    if (!release) {
      return Response.json(
        { success: false, error: 'NOT_FOUND', message: 'Release not found.' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // (Preflight return is performed below, after free-mode cap enforcement,
    // so free-mode clients see CAP_REACHED via the same in-dialog channel as
    // paid clients see PURCHASE_REQUIRED / DOWNLOAD_LIMIT.)

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
    const cachedZipKey = `tmp/bundles/cache/${releaseId}/${mode}/${sortedFormatKey}.zip`;
    const safeTitleForKey = release.title.replace(/[^\w\s.-]/g, '').trim() || 'release';
    const cachedZipFileName = `${safeTitleForKey}.zip`;

    // 007-free-digital-downloads US2/US3 — Cap enforcement and concurrency lock.
    //
    // Free-mode subjects (guest or authenticated) are gated by a rolling 24h
    // cap of 3 successful downloads per (subject, release) keyed by `userId`
    // when authenticated, else by the union of cookie+fingerprint visitorIds
    // (Session 2026-05-08 Q1, Q5). Cap is enforced BEFORE bundle prep so we
    // do not pay the S3 round-trip cost for a request that will be rejected.
    //
    // The lock prevents two concurrent free requests for the same
    // `(subject, release, sortedFormatKey)` from racing on the cap query
    // (research.md §R-3, T059). On collision we fall through to the cache
    // hit fast path if a previously-built ZIP exists; otherwise the second
    // caller is told to retry.
    const freeSubject: DownloadSubject | null = isFreeMode
      ? userId
        ? { kind: 'user', userId }
        : { kind: 'guest', visitorId: guestVisitorId as string }
      : null;
    const freeSubjectKey =
      freeSubject?.kind === 'user'
        ? `user:${freeSubject.userId}`
        : freeSubject !== null
          ? `guest:${freeSubject.visitorId}`
          : null;
    const lockKey =
      freeSubjectKey !== null ? `${freeSubjectKey}|${releaseId}|${sortedFormatKey}` : null;
    let lockAcquired = false;
    outerLockKey = lockKey;
    const auditIp = request.headers.get('x-forwarded-for') ?? 'unknown';
    const auditUserAgent = request.headers.get('user-agent') ?? 'unknown';

    if (isFreeMode && freeSubject !== null) {
      try {
        await freeDownloadQuotaService.assertFreeDownloadAllowed({
          subject: freeSubject,
          visitorIds: guestAllVisitorIds,
          releaseId,
        });
      } catch (capError) {
        if (capError instanceof CapReachedError) {
          // Audit row — `success: false, errorCode: 'CAP_REACHED'`. This row
          // is intentionally NOT counted by future cap queries (the
          // `countSuccessfulDownloadsInWindow` filter requires `success: true`).
          try {
            await new DownloadEventRepository().logDownloadEvent({
              userId,
              visitorId: guestVisitorId,
              releaseId,
              formatType: requestedFormats[0],
              success: false,
              errorCode: 'CAP_REACHED',
              ipAddress: auditIp,
              userAgent: auditUserAgent,
            });
          } catch (auditError) {
            console.error('Failed to write CAP_REACHED audit event', { auditError, releaseId });
          }
          return Response.json(
            {
              errorCode: 'CAP_REACHED',
              message: 'Free download limit reached for this release.',
              resetsAtIso: capError.resetsAt.toISOString(),
            },
            { status: 403, headers: NO_STORE_HEADERS }
          );
        }
        throw capError;
      }

      // Acquire the per-(subject, release, formats) collision lock. If
      // another concurrent caller holds it AND there is no warm cache for
      // the same tuple, return 409 LOCK_HELD so the client can retry.
      //
      // Skip lock acquisition for preflight requests — preflight is a
      // gating-check only and the follow-up streaming request will
      // re-acquire the lock for the actual delivery.
      if (!respondPreflight) {
        lockAcquired = freeDownloadLockService.acquire(lockKey as string);
        outerLockAcquired = lockAcquired;
        if (!lockAcquired) {
          const cacheWarm = await verifyS3ObjectExists(cachedZipKey);
          if (!cacheWarm) {
            return Response.json(
              {
                errorCode: 'LOCK_HELD',
                message: 'Another download is in progress for this release. Please retry shortly.',
              },
              { status: 409, headers: NO_STORE_HEADERS }
            );
          }
          // Cache warm: proceed without holding the lock; the original holder
          // is still responsible for cap accounting on their request, and this
          // path will independently call `recordSuccessfulDownload` below.
        }
      }
    }

    // Preflight: paid- and free-mode clients call this before triggering
    // anchor-based streaming downloads so 4xx errors (auth, purchase,
    // download cap, free-tier cap) surface as in-dialog messages instead
    // of the browser rendering raw JSON. All gating checks above have
    // already executed; reaching here means the download is permitted.
    if (respondPreflight) {
      return Response.json({ success: true }, { status: 200, headers: NO_STORE_HEADERS });
    }

    /**
     * Record a single successful free-tier download for the resolved subject.
     * Called exactly once per successful bundle (T050) — must run BEFORE the
     * SSE `ready` event / 302 response so the cap is incremented atomically
     * with delivery.
     */
    const recordFreeSuccess = async (formatType: DigitalFormatType): Promise<void> => {
      if (!isFreeMode || freeSubject === null) return;
      try {
        await freeDownloadQuotaService.recordSuccessfulDownload({
          subject: freeSubject,
          releaseId,
          formatType,
          ipAddress: auditIp,
          userAgent: auditUserAgent,
        });
      } catch (recordError) {
        console.error('Failed to record successful free download', { recordError, releaseId });
      }
    };

    /**
     * Audit a stream-failure for the free flow. Writes a `success:false,
     * errorCode:'STREAM_FAILED'` event for observability — NOT counted by
     * the cap (T062).
     */
    const recordFreeStreamFailure = async (): Promise<void> => {
      if (!isFreeMode) return;
      try {
        await new DownloadEventRepository().logDownloadEvent({
          userId,
          visitorId: guestVisitorId,
          releaseId,
          formatType: requestedFormats[0],
          success: false,
          errorCode: 'STREAM_FAILED',
          ipAddress: auditIp,
          userAgent: auditUserAgent,
        });
      } catch (auditError) {
        console.error('Failed to write STREAM_FAILED audit event', { auditError, releaseId });
      }
    };

    /** Release the in-process lock if this request acquired it. */
    const releaseLock = (): void => {
      if (lockAcquired && lockKey !== null) {
        freeDownloadLockService.release(lockKey);
        lockAcquired = false;
        outerLockAcquired = false;
      }
    };
    // Reserved for early-release in long-running flows; the outer `finally`
    // is the authoritative release point. Reference here keeps the local
    // helper available without triggering an unused-symbol lint.
    void releaseLock;

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

              // Free mode: increment cap exactly once per bundle BEFORE the
              // SSE `ready` event so delivery and accounting are atomic.
              if (isFreeMode && completedFormats.length > 0) {
                await recordFreeSuccess(completedFormats[0]);
              }
              send('ready', { downloadUrl, fileName: zipFileName });

              try {
                if (!isFreeMode && userId) {
                  await PurchaseRepository.upsertDownloadCount(userId, releaseId);
                }

                if (!isFreeMode) {
                  const downloadEventRepo = new DownloadEventRepository();
                  await Promise.all(
                    completedFormats.map((formatType) =>
                      downloadEventRepo.logDownloadEvent({
                        userId,
                        visitorId: guestVisitorId,
                        releaseId,
                        formatType,
                        success: true,
                        ipAddress: auditIp,
                        userAgent: auditUserAgent,
                      })
                    )
                  );
                }
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
            // We attach a few listeners to the archiver across the lifecycle of
            // the request (one error pipe-through, one error tracker, and
            // potentially per-format entry listeners for progress). Bumping the
            // limit avoids `MaxListenersExceededWarning` noise without hiding a
            // real leak.
            archiveForSse.setMaxListeners(32);
            archiveForSse.on('error', (err) => passThroughForSse.destroy(err));
            // Track the first archiver-level error so the outer try/catch can
            // surface it. archiver also emits this as a stream error which
            // tears down the upload via the pipe-through above.
            let archiveError: Error | null = null;
            archiveForSse.on('error', (err) => {
              archiveError = archiveError ?? err;
            });

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

            // Flatten every file across every requested format into a single
            // ordered list. Prefetching across the entire bundle (rather than
            // per-format) lets multiple formats download from S3 in parallel
            // — critical for the free flow which always bundles MP3 + AAC.
            const flatEntries: Array<{
              formatType: DigitalFormatType;
              label: string;
              s3Key: string;
              entryName: string;
              isLastForFormat: boolean;
            }> = [];
            for (const { formatType, files } of resolvedFormats) {
              const label = FORMAT_LABELS[formatType] ?? formatType;
              const safeFolderName = safeArchiveEntryName(label);
              files.forEach((file, idx) => {
                flatEntries.push({
                  formatType,
                  label,
                  s3Key: file.s3Key,
                  entryName: useSubfolders
                    ? `${safeFolderName}/${safeArchiveEntryName(file.fileName)}`
                    : safeArchiveEntryName(file.fileName),
                  isLastForFormat: idx === files.length - 1,
                });
              });
              send('progress', { formatType, label, status: 'zipping' });
            }

            const flatKeys = flatEntries.map((e) => e.s3Key);
            const inFlight = startBufferPrefetch(
              s3ClientForZip,
              bucketForZip,
              flatKeys,
              S3_PREFETCH_DEPTH
            );

            const formatHasError = new Set<DigitalFormatType>();
            for (let i = 0; i < flatEntries.length; i++) {
              const entry = flatEntries[i];
              try {
                const buffer = await inFlight[i];
                const nextIndex = i + S3_PREFETCH_DEPTH;
                if (nextIndex < flatEntries.length) {
                  inFlight.push(issuePrefetch(s3ClientForZip, bucketForZip, flatKeys[nextIndex]));
                }
                if (buffer === null) continue;
                if (archiveError) throw archiveError;
                // archiver maintains its own internal queue; appending without
                // awaiting `entry` lets multiple appends pipeline through the
                // upload stream rather than each waiting for the previous to
                // fully drain.
                archiveForSse.append(buffer, { name: entry.entryName });
              } catch (formatError) {
                console.error(`Failed to append entry to archive`, {
                  formatType: entry.formatType,
                  s3Key: entry.s3Key,
                  formatError,
                });
                if (!formatHasError.has(entry.formatType)) {
                  formatHasError.add(entry.formatType);
                  send('error', {
                    formatType: entry.formatType,
                    message: 'Failed to prepare download.',
                  });
                }
              }

              if (entry.isLastForFormat && !formatHasError.has(entry.formatType)) {
                completedFormats.push(entry.formatType);
                send('progress', {
                  formatType: entry.formatType,
                  label: entry.label,
                  status: 'done',
                });
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

            // Free mode: record success exactly once BEFORE 'ready' is emitted.
            if (isFreeMode && completedFormats.length > 0) {
              await recordFreeSuccess(completedFormats[0]);
            }
            send('ready', { downloadUrl, fileName: zipFileName });

            // Increment download count and log events server-side on a best-effort basis.
            try {
              if (!isFreeMode && userId) {
                await PurchaseRepository.upsertDownloadCount(userId, releaseId);
              }

              if (!isFreeMode) {
                const downloadEventRepo = new DownloadEventRepository();
                await Promise.all(
                  completedFormats.map((formatType) =>
                    downloadEventRepo.logDownloadEvent({
                      userId,
                      visitorId: guestVisitorId,
                      releaseId,
                      formatType,
                      success: true,
                      ipAddress: auditIp,
                      userAgent: auditUserAgent,
                    })
                  )
                );
              }
            } catch (error) {
              console.error('Failed to record bundle download analytics', {
                completedFormats,
                error,
                releaseId,
              });
            }
          } catch (streamError) {
            await abortSseUpload();
            await recordFreeStreamFailure();
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
        // Free mode: increment cap exactly once per bundle.
        if (isFreeMode && resolvedFormats.length > 0) {
          await recordFreeSuccess(resolvedFormats[0].formatType);
        }

        if (!isFreeMode && userId) {
          await PurchaseRepository.upsertDownloadCount(userId, releaseId);
        }

        if (!isFreeMode) {
          const downloadEventRepo = new DownloadEventRepository();
          await Promise.all(
            resolvedFormats.map(({ formatType }) =>
              downloadEventRepo.logDownloadEvent({
                userId,
                visitorId: guestVisitorId,
                releaseId,
                formatType,
                success: true,
                ipAddress: auditIp,
                userAgent: auditUserAgent,
              })
            )
          );
        }
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

    // Direct-stream fast path (`respond=stream`) — used by both paid and
    // free flows.
    //
    // Removes the S3 multipart upload + presigned-URL round-trip from the
    // critical path: archive bytes are produced and forwarded straight to
    // the client's browser, while a parallel `tee` forks the same bytes to
    // an S3 multipart upload that populates the shared cache key for any
    // subsequent download (which then takes the cache-hit 302 fast path
    // above). All authentication, purchase verification, format gating,
    // download-limit checks, and free-tier cap enforcement have already
    // run above — this branch only changes how the prepared bytes are
    // delivered, not who is allowed to receive them.
    if (respondStream) {
      const archive = archiver('zip', { zlib: { level: 0 } });
      const cachePass = new PassThrough();

      // `teeToCache` forwards every chunk produced by the archiver into
      // both the response body and the cache-upload PassThrough. Cache
      // writes are best-effort: if the cache stream is destroyed (e.g.
      // upload aborted because the client canceled mid-stream), we keep
      // forwarding to the response so the user's download is unaffected.
      const teeToCache = new Transform({
        transform(chunk: Buffer, _enc, cb): void {
          if (!cachePass.destroyed && cachePass.writable) {
            cachePass.write(chunk);
          }
          cb(null, chunk);
        },
        flush(cb): void {
          if (!cachePass.destroyed && cachePass.writable) {
            cachePass.end();
          }
          cb();
        },
      });

      const responsePass: Readable = archive.pipe(teeToCache);
      archive.on('error', (err) => {
        if (!cachePass.destroyed) cachePass.destroy(err);
        if (!teeToCache.destroyed) teeToCache.destroy(err);
      });

      // Fire-and-forget cache upload. `leavePartsOnError: false` aborts
      // the multipart upload if the source stream is destroyed (client
      // cancellation), so we do not leak orphan multipart parts in S3.
      const cacheUpload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Key: tempS3Key,
          Body: cachePass,
          ContentType: 'application/zip',
          ContentDisposition: buildContentDisposition(zipFileName),
        },
        partSize: UPLOAD_PART_SIZE_BYTES,
        queueSize: UPLOAD_QUEUE_SIZE,
        leavePartsOnError: false,
      });
      const cacheUploadPromise = cacheUpload.done().then(
        () => true,
        (cacheError: unknown) => {
          console.error('Bundle cache upload failed (stream path)', { tempS3Key, cacheError });
          return false;
        }
      );

      // Drive the archive: download every file body in parallel and
      // append. Errors here destroy both the response and cache streams.
      const useSubfolders = resolvedFormats.length > 1;
      const fileEntries = resolvedFormats.flatMap(({ formatType, files }) => {
        const folderName = safeArchiveEntryName(FORMAT_LABELS[formatType] ?? formatType);
        return files.map((file) => ({
          formatType,
          archivePath: useSubfolders
            ? `${folderName}/${safeArchiveEntryName(file.fileName)}`
            : safeArchiveEntryName(file.fileName),
          s3Key: file.s3Key,
        }));
      });

      // Kick off the prefetch pipeline and peek at the first object body
      // up-front. This lets the free-tier cap accounting below distinguish a
      // real delivery from an all-missing bundle (every S3 object deleted →
      // empty ZIP) without giving up the "cap committed before the Response is
      // returned" guarantee that concurrent same-tuple requests rely on. (M3)
      //
      // A rejection here (e.g. S3 NoSuchKey when a release has no objects) is
      // coalesced to `null`; it must NOT fault the whole request with a 500.
      // The drive below already handles a failed body by aborting the archive
      // mid-stream — the client observes a connection reset, not an error
      // status. Coalescing to `null` also leaves the cap uncharged for a
      // download that ultimately delivered nothing.
      const streamKeys = fileEntries.map((entry) => entry.s3Key);
      const streamInFlight = startBufferPrefetch(
        s3Client,
        bucketName,
        streamKeys,
        S3_PREFETCH_DEPTH
      );
      const streamFirstBuffer = await streamInFlight[0].catch(() => null);

      void (async () => {
        try {
          for (let i = 0; i < fileEntries.length; i++) {
            const entry = fileEntries[i];
            const buffer = await streamInFlight[i];
            const nextIndex = i + S3_PREFETCH_DEPTH;
            if (nextIndex < fileEntries.length) {
              streamInFlight.push(issuePrefetch(s3Client, bucketName, streamKeys[nextIndex]));
            }
            if (buffer === null) continue;
            archive.append(buffer, { name: entry.archivePath });
          }
          archive.finalize();
        } catch (driveError) {
          console.error('Bundle stream drive error', { driveError, releaseId });
          archive.abort();
          if (!cachePass.destroyed) cachePass.destroy(driveError as Error);
          if (!teeToCache.destroyed) teeToCache.destroy(driveError as Error);
          cacheUpload.abort();
        }
      })();

      // Free-mode cap accounting: record the successful free-tier download
      // BEFORE returning the streaming Response so the cap increment is
      // committed atomically with delivery — same semantics as the SSE
      // pre-`ready` placement. Skipped when the first object body is missing:
      // an all-files-deleted bundle yields an empty ZIP and must not consume
      // the user's cap (M3). Cancellation after the first byte still counts.
      if (isFreeMode && resolvedFormats.length > 0 && streamFirstBuffer !== null) {
        await recordFreeSuccess(resolvedFormats[0].formatType);
      }

      // Paid-mode best-effort analytics: only record once the cache
      // upload completes — that signals the full ZIP made it through the
      // tee, which means the client also received every byte (or that
      // the response stream is still draining; either way we credit a
      // successful delivery). If the client canceled mid-stream the
      // cache upload also fails and we skip analytics. Free mode skips
      // this path entirely — the free quota service is the source of
      // truth and the per-format `logDownloadEvent` is reserved for paid
      // download analytics (matches the SSE free-mode path which also
      // skips per-format event logging on success).
      if (!isFreeMode) {
        void cacheUploadPromise.then(async (uploadOk) => {
          if (!uploadOk) return;
          try {
            if (userId) {
              await PurchaseRepository.upsertDownloadCount(userId, releaseId);
            }
            const repo = new DownloadEventRepository();
            await Promise.all(
              resolvedFormats.map(({ formatType }) =>
                repo.logDownloadEvent({
                  userId,
                  visitorId: guestVisitorId,
                  releaseId,
                  formatType,
                  success: true,
                  ipAddress: auditIp,
                  userAgent: auditUserAgent,
                })
              )
            );
          } catch (analyticsError) {
            console.error('Failed to record bundle download analytics (stream path)', {
              analyticsError,
              releaseId,
            });
          }
        });
      }

      // Adapt the Node Readable into a Web ReadableStream so the
      // Next.js Response API consumes it natively. Cancellation
      // propagates back to the archiver via `responsePass.destroy()`.
      const webStream = new ReadableStream<Uint8Array>({
        start(controller) {
          responsePass.on('data', (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk));
          });
          responsePass.on('end', () => {
            controller.close();
          });
          responsePass.on('error', (err) => {
            controller.error(err);
          });
        },
        cancel() {
          if (!responsePass.destroyed) responsePass.destroy();
          if (!cachePass.destroyed) cachePass.destroy();
          archive.abort();
          cacheUpload.abort();
        },
      });

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': buildContentDisposition(zipFileName),
          'Cache-Control': 'private, no-store',
          'X-Accel-Buffering': 'no',
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
      // Free flow: write a STREAM_FAILED audit row (not counted by cap).
      await recordFreeStreamFailure();
      throw archiveError;
    }

    try {
      // Step 8: Generate a short-lived presigned download URL for the temporary ZIP
      const downloadUrl = await generatePresignedDownloadUrl(
        tempS3Key,
        zipFileName,
        TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
      );

      // Free mode: increment cap exactly once per bundle.
      if (isFreeMode && resolvedFormats.length > 0) {
        await recordFreeSuccess(resolvedFormats[0].formatType);
      }

      // Step 9: Increment download count (bundle = 1 download action) — paid only.
      if (!isFreeMode && userId) {
        await PurchaseRepository.upsertDownloadCount(userId, releaseId);
      }

      // Step 10: Log download events per format — paid flow only. The free
      // flow already wrote a single success row via `recordFreeSuccess`.
      if (!isFreeMode) {
        const downloadEventRepo = new DownloadEventRepository();
        await Promise.all(
          resolvedFormats.map(({ formatType }) =>
            downloadEventRepo.logDownloadEvent({
              userId,
              visitorId: guestVisitorId,
              releaseId,
              formatType,
              success: true,
              ipAddress: auditIp,
              userAgent: auditUserAgent,
            })
          )
        );
      }

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
  } finally {
    if (outerLockAcquired && outerLockKey !== null) {
      freeDownloadLockService.release(outerLockKey);
    }
  }
}
