/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import path from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';

import type { NextRequest } from 'next/server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';

import { auth } from '@/lib/auth';
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
import { loggers } from '@/lib/utils/logger';
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
 * Map view over the shared `FORMAT_LABELS` record for safe, key-checked
 * lookups without dynamic object indexing.
 */
const FORMAT_LABEL_MAP = new Map<string, string>(Object.entries(FORMAT_LABELS));

/**
 * Resolve the human-readable label for a digital format, falling back to the
 * format type itself when no label is registered.
 */
const resolveFormatLabel = (formatType: DigitalFormatType): string =>
  FORMAT_LABEL_MAP.get(formatType) ?? formatType;
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
    const key = keys.at(i);
    if (key === undefined) {
      break;
    }
    inFlight.push(issuePrefetch(s3Client, bucket, key));
  }
  return inFlight;
}

/** A requested digital format resolved to its archivable child files. */
interface ResolvedFormat {
  formatType: DigitalFormatType;
  files: Array<{ s3Key: string; fileName: string }>;
}

/**
 * Everything the three response-delivery paths need from the already-resolved
 * setup/auth/validation phase. The GET handler runs all gating once, then
 * dispatches to exactly one path function with this immutable context — so the
 * paths never re-derive auth, cap, or format state and operation order is
 * preserved byte-for-byte.
 */
interface BundleDeliveryContext {
  readonly resolvedFormats: ResolvedFormat[];
  readonly cachedZipKey: string;
  readonly cachedZipFileName: string;
  readonly releaseId: string;
  readonly isFreeMode: boolean;
  readonly userId: string | null;
  readonly guestVisitorId: string | null;
  readonly auditIp: string;
  readonly auditUserAgent: string;
  /** Record one successful free-tier download (no-op for paid mode). */
  readonly recordFreeSuccess: (formatType: DigitalFormatType) => Promise<void>;
  /** Audit a free-flow stream failure (no-op for paid mode). */
  readonly recordFreeStreamFailure: () => Promise<void>;
}

/** A single archive entry flattened across every requested format (SSE path). */
interface FlatSseEntry {
  formatType: DigitalFormatType;
  label: string;
  s3Key: string;
  entryName: string;
  isLastForFormat: boolean;
}

/** A single archive entry for the direct-stream / redirect build paths. */
interface FileEntry {
  formatType: DigitalFormatType;
  archivePath: string;
  s3Key: string;
}

/** An S3 client + bucket pair threaded into the prefetch/drive helpers. */
interface S3Target {
  readonly client: ReturnType<typeof getS3Client>;
  readonly bucket: string;
}

/**
 * Flatten every file across every requested format into one ordered list of
 * SSE archive entries. Prefetching across the entire bundle (rather than
 * per-format) lets multiple formats download from S3 in parallel — critical
 * for the free flow which always bundles MP3 + AAC. `onFormatStart` fires once
 * per format (in order) so the caller can emit the per-format `zipping` event.
 */
const buildFlatSseEntries = (
  resolvedFormats: readonly ResolvedFormat[],
  useSubfolders: boolean,
  onFormatStart: (formatType: DigitalFormatType, label: string) => void
): FlatSseEntry[] => {
  const flatEntries: FlatSseEntry[] = [];
  for (const { formatType, files } of resolvedFormats) {
    const label = resolveFormatLabel(formatType);
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
    onFormatStart(formatType, label);
  }
  return flatEntries;
};

/**
 * Flatten requested formats into archive entries for the direct-stream and
 * redirect build paths. Uses format subfolders only when multiple formats are
 * bundled; single-format bundles are flat so the zip filename (release title)
 * is the only label the user sees.
 */
const buildFileEntries = (
  resolvedFormats: readonly ResolvedFormat[],
  useSubfolders: boolean
): FileEntry[] =>
  resolvedFormats.flatMap(({ formatType, files }) => {
    const folderName = safeArchiveEntryName(resolveFormatLabel(formatType));
    return files.map((file) => ({
      formatType,
      archivePath: useSubfolders
        ? `${folderName}/${safeArchiveEntryName(file.fileName)}`
        : safeArchiveEntryName(file.fileName),
      s3Key: file.s3Key,
    }));
  });

/**
 * Best-effort paid-mode bundle analytics: increment the per-release download
 * count once (bundle = 1 download action) and write a success download-event
 * per format. No-op for free mode — the free quota service is the source of
 * truth there. Never throws: failures are logged with `errorMessage` context.
 */
const recordPaidBundleAnalytics = async (
  ctx: BundleDeliveryContext,
  formats: readonly DigitalFormatType[],
  errorMessage: string
): Promise<void> => {
  const { isFreeMode, userId, guestVisitorId, releaseId, auditIp, auditUserAgent } = ctx;
  try {
    if (!isFreeMode && userId) {
      await PurchaseRepository.upsertDownloadCount(userId, releaseId);
    }

    if (!isFreeMode) {
      const downloadEventRepo = new DownloadEventRepository();
      await Promise.all(
        formats.map((formatType) =>
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
    loggers.downloads.error(errorMessage, analyticsError, {
      completedFormats: [...formats],
      releaseId,
    });
  }
};

/** Mutable handle threaded through the SSE archive build for teardown. */
interface SseArchiveHandles {
  combinedArchive: ReturnType<typeof archiver> | null;
  combinedPassThrough: PassThrough | null;
  combinedUpload: Upload | null;
  uploadPromise: Promise<unknown> | null;
}

/** Per-SSE-request session: the controller emitter plus mutable archive handles. */
interface SseSession {
  readonly ctx: BundleDeliveryContext;
  readonly send: (event: string, data: Record<string, unknown>) => void;
  readonly s3Client: ReturnType<typeof getS3Client>;
  readonly bucket: string;
  readonly handles: SseArchiveHandles;
}

/**
 * Cache hit fast path — a previously-built ZIP for this exact (release,
 * formats) tuple already exists in S3. Skip archiving entirely, emit synthetic
 * progress events so the UI advances through `done` → `uploading` → `ready`
 * immediately, sign a fresh download URL, and record analytics. Returns after
 * emitting `ready`; the caller emits `complete` and closes the controller.
 */
const runSseCacheHit = async (session: SseSession): Promise<void> => {
  const { ctx, send } = session;
  const { resolvedFormats, cachedZipKey, cachedZipFileName, isFreeMode } = ctx;
  const completedFormats: DigitalFormatType[] = [];
  for (const { formatType } of resolvedFormats) {
    const label = resolveFormatLabel(formatType);
    send('progress', { formatType, label, status: 'zipping' });
    completedFormats.push(formatType);
    send('progress', { formatType, label, status: 'done' });
  }
  send('progress', { status: 'uploading' });

  const downloadUrl = await generatePresignedDownloadUrl(
    cachedZipKey,
    cachedZipFileName,
    TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
  );

  // Free mode: increment cap exactly once per bundle BEFORE the
  // SSE `ready` event so delivery and accounting are atomic.
  if (isFreeMode && completedFormats.length > 0) {
    await ctx.recordFreeSuccess(completedFormats[0]);
  }
  send('ready', { downloadUrl, fileName: cachedZipFileName });

  await recordPaidBundleAnalytics(
    ctx,
    completedFormats,
    'Failed to record bundle download analytics (cache hit)'
  );
};

/**
 * Construct the archiver + S3 multipart upload for the live SSE build and wire
 * the error listeners. Mutates `session.handles` so the surrounding
 * `abortSseUpload` can tear everything down. Returns the archive plus an
 * `archiveError` getter capturing the first archiver-level error.
 */
const initSseArchive = (
  session: SseSession
): { archive: ReturnType<typeof archiver>; getArchiveError: () => Error | null } => {
  const { ctx, s3Client, bucket, handles } = session;
  const archiveForSse = archiver('zip', { zlib: { level: 0 } });
  const passThroughForSse = new PassThrough();
  handles.combinedArchive = archiveForSse;
  handles.combinedPassThrough = passThroughForSse;
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
  handles.combinedUpload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucket,
      Key: ctx.cachedZipKey,
      Body: passThroughForSse,
      ContentType: 'application/zip',
      ContentDisposition: buildContentDisposition(ctx.cachedZipFileName),
    },
    partSize: UPLOAD_PART_SIZE_BYTES,
    queueSize: UPLOAD_QUEUE_SIZE,
    leavePartsOnError: false,
  });

  handles.uploadPromise = handles.combinedUpload.done();
  return { archive: archiveForSse, getArchiveError: () => archiveError };
};

/** Mutable drain state shared across the per-entry SSE append steps. */
interface SseDrainState {
  readonly flatKeys: readonly string[];
  readonly inFlight: Array<Promise<Buffer | null>>;
  readonly archive: ReturnType<typeof archiver>;
  readonly getArchiveError: () => Error | null;
  readonly completedFormats: DigitalFormatType[];
  readonly formatHasError: Set<DigitalFormatType>;
}

/**
 * Drain the prefetched buffers into the SSE archive, emitting per-format
 * progress / error events. Returns the formats that fully appended without
 * error (drives cap accounting + the "no formats" abort decision). Awaits each
 * entry serially so progress/error ordering matches a sequential build. Mirrors
 * the redirect/stream drive loop but adds SSE progress emission and per-format
 * error tracking, so it is intentionally not shared with those paths.
 */
const drainSseEntries = async (
  session: SseSession,
  flatEntries: readonly FlatSseEntry[],
  archive: ReturnType<typeof archiver>,
  getArchiveError: () => Error | null
): Promise<DigitalFormatType[]> => {
  const { send, s3Client, bucket } = session;
  const flatKeys = flatEntries.map((e) => e.s3Key);
  const state: SseDrainState = {
    flatKeys,
    inFlight: startBufferPrefetch(s3Client, bucket, flatKeys, S3_PREFETCH_DEPTH),
    archive,
    getArchiveError,
    completedFormats: [],
    formatHasError: new Set<DigitalFormatType>(),
  };

  for (let i = 0; i < flatEntries.length; i++) {
    const entry = flatEntries.at(i);
    if (entry === undefined) {
      continue;
    }
    await appendSseEntry(session, state, entry, i);

    if (entry.isLastForFormat && !state.formatHasError.has(entry.formatType)) {
      state.completedFormats.push(entry.formatType);
      send('progress', { formatType: entry.formatType, label: entry.label, status: 'done' });
    }
  }
  return state.completedFormats;
};

/**
 * Await one prefetched buffer, refill the prefetch pipeline, and append it to
 * the SSE archive — surfacing the first archiver error and emitting a single
 * per-format SSE `error` event on failure. Extracted so `drainSseEntries` stays
 * a tight loop; the caller awaits it so it runs to completion before advancing.
 */
const appendSseEntry = async (
  session: SseSession,
  state: SseDrainState,
  entry: FlatSseEntry,
  index: number
): Promise<void> => {
  const { send, s3Client, bucket } = session;
  const { flatKeys, inFlight, archive, getArchiveError, formatHasError } = state;
  try {
    const buffer = await inFlight.at(index);
    const nextIndex = index + S3_PREFETCH_DEPTH;
    const nextKey = flatKeys.at(nextIndex);
    if (nextIndex < flatKeys.length && nextKey !== undefined) {
      inFlight.push(issuePrefetch(s3Client, bucket, nextKey));
    }
    if (buffer === null || buffer === undefined) return;
    const archiveError = getArchiveError();
    if (archiveError) throw archiveError;
    // archiver maintains its own internal queue; appending without
    // awaiting `entry` lets multiple appends pipeline through the
    // upload stream rather than each waiting for the previous to
    // fully drain.
    archive.append(buffer, { name: entry.entryName });
  } catch (formatError) {
    loggers.downloads.error('Failed to append entry to archive', formatError, {
      formatType: entry.formatType,
      s3Key: entry.s3Key,
    });
    if (!formatHasError.has(entry.formatType)) {
      formatHasError.add(entry.formatType);
      send('error', { formatType: entry.formatType, message: 'Failed to prepare download.' });
    }
  }
};

/**
 * Live SSE build path — archive every format from prefetched buffers, stream
 * progress, finalize + upload, sign a download URL, and record analytics.
 * Returns after emitting `ready` (or after the early `complete` when no formats
 * could be prepared); the caller emits the trailing `complete` + close. Throws
 * only via the archive build, which the caller's catch turns into an `error`
 * event + free-flow STREAM_FAILED audit.
 */
const runSseLiveBuild = async (
  session: SseSession,
  abortSseUpload: () => Promise<void>
): Promise<void> => {
  const { ctx, send } = session;
  const { resolvedFormats, cachedZipKey, cachedZipFileName, isFreeMode } = ctx;
  const { archive, getArchiveError } = initSseArchive(session);

  // Append files — use format subfolders only when multiple
  // formats are bundled; single-format bundles are flat so the
  // zip filename (release title) is the only label the user sees.
  const useSubfolders = resolvedFormats.length > 1;
  const flatEntries = buildFlatSseEntries(resolvedFormats, useSubfolders, (formatType, label) =>
    send('progress', { formatType, label, status: 'zipping' })
  );

  const completedFormats = await drainSseEntries(session, flatEntries, archive, getArchiveError);

  if (completedFormats.length === 0) {
    await abortSseUpload();
    send('error', { message: 'No formats could be prepared.' });
    // `complete` + controller close is emitted once by the caller's trailing
    // handler for every path — do not emit it here (would duplicate it).
    return;
  }

  // Finalize archive and wait for upload to complete
  send('progress', { status: 'uploading' });
  archive.finalize();
  await session.handles.uploadPromise;

  // Generate presigned URL
  const downloadUrl = await generatePresignedDownloadUrl(
    cachedZipKey,
    cachedZipFileName,
    TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
  );

  // Free mode: record success exactly once BEFORE 'ready' is emitted.
  if (isFreeMode && completedFormats.length > 0) {
    await ctx.recordFreeSuccess(completedFormats[0]);
  }
  send('ready', { downloadUrl, fileName: cachedZipFileName });

  // Increment download count and log events server-side on a best-effort basis.
  await recordPaidBundleAnalytics(
    ctx,
    completedFormats,
    'Failed to record bundle download analytics'
  );
};

/**
 * SSE streaming path (`respond=json`): create a single combined ZIP containing
 * all requested formats as subfolders, streaming progress events to the client
 * as each format is appended. A single presigned download URL is emitted once
 * the archive upload completes — this ensures iOS Safari (which cannot handle
 * multiple concurrent downloads) receives exactly one file.
 */
const streamSseResponse = (ctx: BundleDeliveryContext): Response => {
  const s3Client = getS3Client();
  const bucket = getS3BucketName();
  const handles: SseArchiveHandles = {
    combinedArchive: null,
    combinedPassThrough: null,
    combinedUpload: null,
    uploadPromise: null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>): void => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const session: SseSession = { ctx, send, s3Client, bucket, handles };
      const abortSseUpload = async (): Promise<void> => {
        handles.combinedArchive?.abort();
        if (handles.combinedPassThrough && !handles.combinedPassThrough.destroyed) {
          handles.combinedPassThrough.destroy();
        }
        handles.combinedUpload?.abort();
        if (handles.uploadPromise) {
          await handles.uploadPromise.catch(() => undefined);
        }
      };

      try {
        if (await verifyS3ObjectExists(ctx.cachedZipKey)) {
          await runSseCacheHit(session);
        } else {
          await runSseLiveBuild(session, abortSseUpload);
        }
      } catch (streamError) {
        await abortSseUpload();
        await ctx.recordFreeStreamFailure();
        loggers.downloads.error('Bundle SSE stream error', streamError);
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
};

/**
 * Cache hit fast path (302) — reuse a previously-built ZIP for this exact
 * (release, formats) tuple. The cache TTL is bounded by the
 * `tmp-bundles-expire-after-1-day` S3 lifecycle rule. Records cap/analytics on
 * a best-effort basis, then 302-redirects to a fresh presigned URL.
 */
const respondCacheHit302 = async (ctx: BundleDeliveryContext): Promise<Response> => {
  const { resolvedFormats, cachedZipKey, cachedZipFileName, isFreeMode } = ctx;
  const downloadUrl = await generatePresignedDownloadUrl(
    cachedZipKey,
    cachedZipFileName,
    TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
  );

  // Free mode: increment cap exactly once per bundle.
  if (isFreeMode && resolvedFormats.length > 0) {
    await ctx.recordFreeSuccess(resolvedFormats[0].formatType);
  }

  await recordPaidBundleAnalytics(
    ctx,
    resolvedFormats.map(({ formatType }) => formatType),
    'Failed to record bundle download analytics (cache hit, 302 path)'
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: downloadUrl,
      ...NO_STORE_HEADERS,
    },
  });
};

/** Wiring for the direct-stream tee path: archiver → response + cache upload. */
interface StreamPipeline {
  archive: ReturnType<typeof archiver>;
  cachePass: PassThrough;
  teeToCache: Transform;
  responsePass: Readable;
  cacheUpload: Upload;
  cacheUploadPromise: Promise<boolean>;
}

/**
 * Build the direct-stream pipeline: archiver bytes are forwarded to the
 * response while a parallel `tee` forks the same bytes into an S3 multipart
 * upload that populates the shared cache key. Cache writes are best-effort —
 * if the cache stream is destroyed (client cancel), forwarding to the response
 * continues unaffected.
 */
const buildStreamPipeline = (
  ctx: BundleDeliveryContext,
  s3Client: ReturnType<typeof getS3Client>,
  bucketName: string
): StreamPipeline => {
  const { cachedZipKey, cachedZipFileName } = ctx;
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
      Key: cachedZipKey,
      Body: cachePass,
      ContentType: 'application/zip',
      ContentDisposition: buildContentDisposition(cachedZipFileName),
    },
    partSize: UPLOAD_PART_SIZE_BYTES,
    queueSize: UPLOAD_QUEUE_SIZE,
    leavePartsOnError: false,
  });
  const cacheUploadPromise = cacheUpload.done().then(
    () => true,
    (cacheError: unknown) => {
      loggers.downloads.error('Bundle cache upload failed (stream path)', cacheError, {
        tempS3Key: cachedZipKey,
      });
      return false;
    }
  );

  return { archive, cachePass, teeToCache, responsePass, cacheUpload, cacheUploadPromise };
};

/**
 * Drive the direct-stream archive: append every file body (sharing the
 * `streamInFlight` prefetch list peeked at by the caller — the first batch of
 * S3 GETs is issued exactly once) and refill the pipeline as it drains. Errors
 * destroy both the response and cache streams and abort the cache upload. Runs
 * detached (fire-and-forget) so the Response can be returned while bytes stream.
 */
const driveStreamArchive = (
  ctx: BundleDeliveryContext,
  pipeline: StreamPipeline,
  fileEntries: readonly FileEntry[],
  prefetch: { inFlight: Array<Promise<Buffer | null>>; keys: readonly string[]; s3: S3Target }
): void => {
  const { archive, cachePass, teeToCache, cacheUpload } = pipeline;
  const { inFlight: streamInFlight, keys: streamKeys, s3 } = prefetch;
  void (async () => {
    try {
      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries.at(i);
        if (entry === undefined) {
          continue;
        }
        const buffer = await streamInFlight.at(i);
        const nextIndex = i + S3_PREFETCH_DEPTH;
        const nextKey = streamKeys.at(nextIndex);
        if (nextIndex < fileEntries.length && nextKey !== undefined) {
          streamInFlight.push(issuePrefetch(s3.client, s3.bucket, nextKey));
        }
        if (buffer === null || buffer === undefined) continue;
        archive.append(buffer, { name: entry.archivePath });
      }
      archive.finalize();
    } catch (driveError) {
      loggers.downloads.error('Bundle stream drive error', driveError, {
        releaseId: ctx.releaseId,
      });
      archive.abort();
      if (!cachePass.destroyed) cachePass.destroy(driveError as Error);
      if (!teeToCache.destroyed) teeToCache.destroy(driveError as Error);
      cacheUpload.abort();
    }
  })();
};

/**
 * Adapt the Node Readable into a Web ReadableStream so the Next.js Response API
 * consumes it natively. Cancellation propagates back to the archiver via
 * `responsePass.destroy()`.
 */
const toWebStream = (pipeline: StreamPipeline): ReadableStream<Uint8Array> => {
  const { archive, cachePass, responsePass, cacheUpload } = pipeline;
  return new ReadableStream<Uint8Array>({
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
};

/**
 * Direct-stream fast path (`respond=stream`) — used by both paid and free
 * flows. Removes the S3 multipart upload + presigned-URL round-trip from the
 * critical path: archive bytes are produced and forwarded straight to the
 * client's browser, while a parallel `tee` forks the same bytes to an S3
 * multipart upload that populates the shared cache key for any subsequent
 * download (which then takes the cache-hit 302 fast path). All authentication,
 * purchase verification, format gating, download-limit checks, and free-tier
 * cap enforcement have already run — this branch only changes how the prepared
 * bytes are delivered, not who is allowed to receive them.
 */
const streamDirectResponse = async (
  ctx: BundleDeliveryContext,
  s3Client: ReturnType<typeof getS3Client>,
  bucketName: string
): Promise<Response> => {
  const { resolvedFormats, cachedZipFileName, isFreeMode } = ctx;
  const pipeline = buildStreamPipeline(ctx, s3Client, bucketName);

  const useSubfolders = resolvedFormats.length > 1;
  const fileEntries = buildFileEntries(resolvedFormats, useSubfolders);

  // Kick off the prefetch pipeline ONCE and peek at the first object body
  // up-front. This lets the free-tier cap accounting below distinguish a
  // real delivery from an all-missing bundle (every S3 object deleted →
  // empty ZIP) without giving up the "cap committed before the Response is
  // returned" guarantee that concurrent same-tuple requests rely on. (M3)
  // The same `inFlight` list is handed to the drive so the first batch of S3
  // GETs is issued exactly once.
  //
  // A rejection here (e.g. S3 NoSuchKey when a release has no objects) is
  // coalesced to `null`; it must NOT fault the whole request with a 500.
  // The drive below already handles a failed body by aborting the archive
  // mid-stream — the client observes a connection reset, not an error
  // status. Coalescing to `null` also leaves the cap uncharged for a
  // download that ultimately delivered nothing.
  const s3: S3Target = { client: s3Client, bucket: bucketName };
  const streamKeys = fileEntries.map((entry) => entry.s3Key);
  const streamInFlight = startBufferPrefetch(s3Client, bucketName, streamKeys, S3_PREFETCH_DEPTH);
  const streamFirstBuffer = await peekFirstBody(streamInFlight);

  driveStreamArchive(ctx, pipeline, fileEntries, {
    inFlight: streamInFlight,
    keys: streamKeys,
    s3,
  });

  // Free-mode cap accounting: record the successful free-tier download
  // BEFORE returning the streaming Response so the cap increment is
  // committed atomically with delivery — same semantics as the SSE
  // pre-`ready` placement. Skipped when the first object body is missing:
  // an all-files-deleted bundle yields an empty ZIP and must not consume
  // the user's cap (M3). Cancellation after the first byte still counts.
  if (isFreeMode && resolvedFormats.length > 0 && streamFirstBuffer !== null) {
    await ctx.recordFreeSuccess(resolvedFormats[0].formatType);
  }

  scheduleStreamPaidAnalytics(ctx, pipeline.cacheUploadPromise);

  return new Response(toWebStream(pipeline), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDisposition(cachedZipFileName),
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
};

/**
 * Peek at the first prefetched object body from the shared in-flight list,
 * coalescing a rejection (e.g. S3 NoSuchKey) to `null` so the cap is not charged
 * and the request still streams — the drive aborts the archive mid-flight on a
 * failed body. Returns the resolved first body, or `null` when the bundle is
 * empty (no entries) or the first body is missing/failed.
 */
const peekFirstBody = async (
  streamInFlight: ReadonlyArray<Promise<Buffer | null>>
): Promise<Buffer | null> => {
  try {
    return await streamInFlight[0];
  } catch {
    // First body failed (e.g. S3 NoSuchKey); leave it null so the cap is
    // not charged and the request still streams — the drive below aborts
    // the archive mid-flight.
    return null;
  }
};

/**
 * Paid-mode best-effort analytics for the stream path: only record once the
 * cache upload completes — that signals the full ZIP made it through the tee,
 * which means the client also received every byte (or that the response stream
 * is still draining; either way we credit a successful delivery). If the client
 * canceled mid-stream the cache upload also fails and we skip analytics. Free
 * mode skips this path entirely — the free quota service is the source of truth
 * and per-format `logDownloadEvent` is reserved for paid download analytics
 * (matches the SSE free-mode path which also skips per-format event logging).
 */
const scheduleStreamPaidAnalytics = (
  ctx: BundleDeliveryContext,
  cacheUploadPromise: Promise<boolean>
): void => {
  if (ctx.isFreeMode) {
    return;
  }
  void cacheUploadPromise.then(async (uploadOk) => {
    if (!uploadOk) return;
    await recordPaidBundleAnalytics(
      ctx,
      ctx.resolvedFormats.map(({ formatType }) => formatType),
      'Failed to record bundle download analytics (stream path)'
    );
  });
};

/**
 * Build one combined ZIP, upload it to the shared cache key, sign a short-lived
 * presigned URL, record cap/analytics, and 302-redirect (default
 * `respond=stream`-absent path). On a build failure writes a free-flow
 * STREAM_FAILED audit and rethrows; on a post-upload failure retains the cached
 * ZIP (the lifecycle rule bounds its lifetime) and rethrows.
 */
const buildAndRedirectResponse = async (
  ctx: BundleDeliveryContext,
  s3Client: ReturnType<typeof getS3Client>,
  bucketName: string
): Promise<Response> => {
  const { resolvedFormats, cachedZipKey, cachedZipFileName } = ctx;
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
      Key: cachedZipKey,
      Body: passThrough,
      ContentType: 'application/zip',
      ContentDisposition: buildContentDisposition(cachedZipFileName),
    },
    partSize: UPLOAD_PART_SIZE_BYTES,
    queueSize: UPLOAD_QUEUE_SIZE,
    leavePartsOnError: false,
  });

  const uploadPromise = upload.done();

  const useSubfolders = resolvedFormats.length > 1;
  const fileEntries = buildFileEntries(resolvedFormats, useSubfolders);

  await driveRedirectArchive(ctx, {
    archive,
    passThrough,
    upload,
    uploadPromise,
    fileEntries,
    s3: { client: s3Client, bucket: bucketName },
  });

  return finalizeRedirectResponse(ctx);
};

/**
 * Download bodies into memory in parallel so archiver only does memory→memory
 * copies and the multipart uploader drains at full throughput, then finalize
 * and await the upload. On failure: abort the archive + upload, write a free
 * STREAM_FAILED audit row (not counted by the cap), and rethrow.
 */
const driveRedirectArchive = async (
  ctx: BundleDeliveryContext,
  args: {
    archive: ReturnType<typeof archiver>;
    passThrough: PassThrough;
    upload: Upload;
    uploadPromise: Promise<unknown>;
    fileEntries: readonly FileEntry[];
    s3: { client: ReturnType<typeof getS3Client>; bucket: string };
  }
): Promise<void> => {
  const { archive, passThrough, upload, uploadPromise, fileEntries, s3 } = args;
  try {
    const keys = fileEntries.map((e) => e.s3Key);
    const inFlight = startBufferPrefetch(s3.client, s3.bucket, keys, S3_PREFETCH_DEPTH);

    for (let i = 0; i < fileEntries.length; i++) {
      const fileEntry = fileEntries.at(i);
      if (fileEntry === undefined) {
        continue;
      }
      const buffer = await inFlight.at(i);
      const nextIndex = i + S3_PREFETCH_DEPTH;
      const nextKey = keys.at(nextIndex);
      if (nextIndex < fileEntries.length && nextKey !== undefined) {
        inFlight.push(issuePrefetch(s3.client, s3.bucket, nextKey));
      }

      if (buffer === null || buffer === undefined) continue;
      await appendRedirectEntry(archive, buffer, fileEntry.archivePath);
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
    await ctx.recordFreeStreamFailure();
    throw archiveError;
  }
};

/**
 * Append a single buffer to the redirect-path archive, resolving when the
 * `entry` event fires and rejecting on an archiver error. `once` only
 * self-removes the listener that fires; on the happy path `entry` resolves and
 * the `error` listener would linger, leaking one listener per appended file (→
 * MaxListenersExceededWarning at 11 files). Pair them so whichever fires
 * removes the other.
 */
const appendRedirectEntry = (
  archive: ReturnType<typeof archiver>,
  buffer: Buffer,
  archivePath: string
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onEntry = (): void => {
      archive.removeListener('error', onError);
      resolve();
    };
    const onError = (err: Error): void => {
      archive.removeListener('entry', onEntry);
      reject(err);
    };
    archive.once('entry', onEntry);
    archive.once('error', onError);
    archive.append(buffer, { name: archivePath });
  });

/**
 * After a successful build + upload: sign a short-lived presigned download URL,
 * record cap/analytics, and 302-redirect. On a post-upload failure intentionally
 * does NOT delete the uploaded ZIP — it lives at the shared cache key and remains
 * valid for subsequent requests; the 24-hour S3 lifecycle rule bounds its lifetime
 * and a future request reuses it via the cache hit fast path.
 */
const finalizeRedirectResponse = async (ctx: BundleDeliveryContext): Promise<Response> => {
  const { resolvedFormats, cachedZipKey, cachedZipFileName, isFreeMode, userId, releaseId } = ctx;
  try {
    // Step 8: Generate a short-lived presigned download URL for the temporary ZIP
    const downloadUrl = await generatePresignedDownloadUrl(
      cachedZipKey,
      cachedZipFileName,
      TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
    );

    // Free mode: increment cap exactly once per bundle.
    if (isFreeMode && resolvedFormats.length > 0) {
      await ctx.recordFreeSuccess(resolvedFormats[0].formatType);
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
            visitorId: ctx.guestVisitorId,
            releaseId,
            formatType,
            success: true,
            ipAddress: ctx.auditIp,
            userAgent: ctx.auditUserAgent,
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
    loggers.downloads.error('Bundle post-upload error (cached ZIP retained)', postUploadError, {
      tempS3Key: cachedZipKey,
    });
    throw postUploadError;
  }
};

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
    const setup = await resolveBundleSetup(request, context);
    if (setup.kind === 'response') {
      return setup.response;
    }
    const { gate } = setup;
    outerLockKey = gate.lockKey;

    const capResult = await enforceFreeCapAndLock(gate);
    if (capResult.kind === 'response') {
      return capResult.response;
    }
    outerLockAcquired = capResult.lockAcquired;

    // Preflight: paid- and free-mode clients call this before triggering
    // anchor-based streaming downloads so 4xx errors (auth, purchase,
    // download cap, free-tier cap) surface as in-dialog messages instead
    // of the browser rendering raw JSON. All gating checks above have
    // already executed; reaching here means the download is permitted.
    if (gate.respondPreflight) {
      return Response.json({ success: true }, { status: 200, headers: NO_STORE_HEADERS });
    }

    const ctx = buildDeliveryContext(gate);

    // SSE streaming path — emits one combined ZIP as progress events.
    if (gate.respondJson) {
      return streamSseResponse(ctx);
    }

    // Cache hit fast path — reuse a previously-built ZIP for this exact
    // (release, formats) tuple. The cache TTL is bounded by the
    // `tmp-bundles-expire-after-1-day` S3 lifecycle rule.
    const s3Client = getS3Client();
    const bucketName = getS3BucketName();
    if (await verifyS3ObjectExists(ctx.cachedZipKey)) {
      // `await` (not bare `return`) so a rejection from these paths is caught
      // by this handler's `try/catch` and surfaced as a 500 — a bare returned
      // promise would reject after control left the `try`, escaping the catch.
      return await respondCacheHit302(ctx);
    }

    if (gate.respondStream) {
      return await streamDirectResponse(ctx, s3Client, bucketName);
    }

    return await buildAndRedirectResponse(ctx, s3Client, bucketName);
  } catch (error) {
    loggers.downloads.error('Bundle download error', error);

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

/**
 * Fully-resolved setup/auth/validation state for a permitted request. Carries
 * everything Phase B + the delivery paths need; the cap/lock step and delivery
 * dispatch consume it without re-deriving auth or format state.
 */
interface BundleGate {
  readonly request: NextRequest;
  readonly releaseId: string;
  readonly requestedFormats: DigitalFormatType[];
  readonly mode: string | undefined;
  readonly isFreeMode: boolean;
  readonly userId: string | null;
  readonly guestVisitorId: string | null;
  readonly guestAllVisitorIds: string[] | undefined;
  readonly respondJson: boolean;
  readonly respondStream: boolean;
  readonly respondPreflight: boolean;
  readonly resolvedFormats: ResolvedFormat[];
  readonly cachedZipKey: string;
  readonly cachedZipFileName: string;
  readonly freeSubject: DownloadSubject | null;
  readonly lockKey: string | null;
  readonly auditIp: string;
  readonly auditUserAgent: string;
}

/** Either a fully-resolved gate or an early Response to return verbatim. */
type SetupResult = { kind: 'gate'; gate: BundleGate } | { kind: 'response'; response: Response };

/**
 * Phase A — rate-limit, authenticate, validate formats/mode, resolve guest
 * identity, enforce the free-only format restriction, verify purchase + the
 * per-release download cap, fetch the release title, resolve requested format
 * records with their files, and compute the deterministic cache key. Returns an
 * early `Response` for any reject branch, else the resolved `BundleGate`.
 */
const resolveBundleSetup = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<SetupResult> => {
  const auth = await authenticateBundleRequest(request, context);
  if (auth.kind === 'response') {
    return auth;
  }
  const { releaseId, requestedFormats, mode, isFreeMode, userId, respondFlags } = auth;

  const identity = await resolveFreeVisitorIdentity(request, isFreeMode, userId);

  // For free-mode flows we still want to retain the format-restriction check
  // (defence-in-depth — schema also validates this).
  const isFreeOnlyRequest = requestedFormats.every(isFreeFormatType);
  if (isFreeMode && !isFreeOnlyRequest) {
    return {
      kind: 'response',
      response: Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: `Free downloads only support ${FREE_FORMAT_TYPES.join(', ')}`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const accessResponse = await verifyBundleAccess(isFreeMode, userId, releaseId, isFreeOnlyRequest);
  if (accessResponse) {
    return { kind: 'response', response: accessResponse };
  }

  // Step 5: Fetch release title for ZIP filename
  const release = await ReleaseService.findPublishedTitleById(releaseId);
  if (!release) {
    return {
      kind: 'response',
      response: Response.json(
        { success: false, error: 'NOT_FOUND', message: 'Release not found.' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const resolved = await resolveRequestedFormats(releaseId, requestedFormats);
  if (resolved.length === 0) {
    return {
      kind: 'response',
      response: Response.json(
        { success: false, error: 'NO_FILES', message: 'No downloadable files found.' },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return {
    kind: 'gate',
    gate: assembleGate({
      request,
      releaseId,
      requestedFormats,
      mode,
      isFreeMode,
      userId,
      identity,
      respondFlags,
      resolvedFormats: resolved,
      releaseTitle: release.title,
    }),
  };
};

/** Resolved respond-mode flags parsed from the query string. */
interface RespondFlags {
  readonly respondJson: boolean;
  readonly respondStream: boolean;
  readonly respondPreflight: boolean;
}

/** Successful authentication + validation result for a permitted request. */
interface AuthResult {
  readonly releaseId: string;
  readonly requestedFormats: DigitalFormatType[];
  readonly mode: string | undefined;
  readonly isFreeMode: boolean;
  readonly userId: string | null;
  readonly respondFlags: RespondFlags;
}

/** Either a successful auth result or an early Response to return verbatim. */
type AuthOutcome = ({ kind: 'auth' } & AuthResult) | { kind: 'response'; response: Response };

/**
 * Rate-limit (skipped in E2E test mode), authenticate the session token (paid
 * mode requires a session; free mode is open to guests), validate the release
 * ID, and parse + validate the `formats`/`mode`/`respond` query parameters.
 * Returns an early `Response` for any reject branch, else the auth result.
 */
const authenticateBundleRequest = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<AuthOutcome> => {
  // Rate limiting — skipped in E2E test mode to avoid 429s during test runs
  // (repeated/retried downloads from one IP), matching the `withRateLimit`
  // decorator used by the sibling free-status route.
  const ip = extractClientIp(request);
  if (process.env.E2E_MODE !== 'true') {
    try {
      await downloadLimiter.check(DOWNLOAD_LIMIT, ip);
    } catch {
      return {
        kind: 'response',
        response: Response.json(
          {
            success: false,
            error: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
          },
          { status: 429, headers: NO_STORE_HEADERS }
        ),
      };
    }
  }

  // Step 1: Authentication (deferred for mode='free' — guest flow). Read the
  // better-auth session from the request cookies; better-auth owns cookie
  // naming/secure-prefix selection internally, so we only forward the headers.
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;

  const { id: releaseId } = await context.params;

  // Validate release ID
  if (!isValidObjectId(releaseId)) {
    return {
      kind: 'response',
      response: Response.json(
        { success: false, error: 'INVALID_ID', message: 'Invalid release ID.' },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return parseBundleQuery(request, releaseId, userId);
};

/**
 * Parse + validate the `formats`/`mode`/`respond` query parameters and apply
 * the paid-mode auth gate. Returns an early `Response` on a validation/auth
 * reject, else the assembled auth result.
 */
const parseBundleQuery = (
  request: NextRequest,
  releaseId: string,
  tokenSub: string | null
): AuthOutcome => {
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
    return {
      kind: 'response',
      response: Response.json(
        {
          success: false,
          error: 'INVALID_FORMATS',
          message: parseResult.error.issues[0]?.message ?? 'Invalid formats parameter.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const requestedFormats = parseResult.data.formats as DigitalFormatType[];
  const mode = parseResult.data.mode;
  const isFreeMode = mode === 'free';

  // Auth gating: paid mode requires a session; free mode is open to guests.
  if (!isFreeMode && !tokenSub) {
    return {
      kind: 'response',
      response: Response.json(
        { success: false, error: 'UNAUTHORIZED', message: 'You must be logged in to download.' },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return {
    kind: 'auth',
    releaseId,
    requestedFormats,
    mode,
    isFreeMode,
    userId: tokenSub,
    respondFlags: { respondJson, respondStream, respondPreflight },
  };
};

/** Resolved guest visitor identity for the free flow. */
interface FreeVisitorIdentity {
  readonly guestVisitorId: string | null;
  readonly guestAllVisitorIds: string[] | undefined;
}

/**
 * Free-mode: resolve guest visitor identity BEFORE any streaming starts so the
 * Set-Cookie header is part of the initial Response. iOS Safari only honors a
 * cookie issued in the very first byte of the response — placing this work
 * after the ReadableStream body would silently strip it. Authenticated users on
 * the free path bypass the visitor cookie entirely (Session 2026-05-08 Q5,
 * T061) — their cap is keyed by `userId`, not by composite identity.
 */
const resolveFreeVisitorIdentity = async (
  request: NextRequest,
  isFreeMode: boolean,
  userId: string | null
): Promise<FreeVisitorIdentity> => {
  if (!isFreeMode || userId) {
    return { guestVisitorId: null, guestAllVisitorIds: undefined };
  }
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
  return {
    guestVisitorId: identity.primaryVisitorId,
    guestAllVisitorIds: identity.allVisitorIds,
  };
};

/**
 * Steps 3–4: Verify purchase and check download limit (with 6-hour auto-reset).
 * Free mode skips both — guest downloads are gated by the freemium quota
 * service (added in US2/US3). The per-release download cap is still enforced for
 * paid/free-only authenticated downloads. Returns a reject `Response` or `null`.
 */
const verifyBundleAccess = async (
  isFreeMode: boolean,
  userId: string | null,
  releaseId: string,
  isFreeOnlyRequest: boolean
): Promise<Response | null> => {
  if (isFreeMode) {
    return null;
  }
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
  return null;
};

/**
 * Step 6: Resolve all requested format records with their files (single query).
 * Prefers multi-track child files; falls back to legacy single-file. Skips
 * unavailable or fileless formats silently.
 */
const resolveRequestedFormats = async (
  releaseId: string,
  requestedFormats: readonly DigitalFormatType[]
): Promise<ResolvedFormat[]> => {
  const formatRepo = new ReleaseDigitalFormatRepository();
  const allFormats = await formatRepo.findAllByRelease(releaseId);
  const formatMap = new Map(allFormats.map((f) => [f.formatType, f]));

  const resolvedFormats: ResolvedFormat[] = [];
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
  return resolvedFormats;
};

/**
 * Assemble the immutable `BundleGate` from resolved auth/format state: compute
 * the deterministic cache key (keyed by release + sorted format list + mode),
 * the safe ZIP filename, and the free-mode subject + collision lock key.
 *
 * Cache rationale: bundle ZIPs are immutable for a given (release, formats)
 * tuple — the underlying digital format files are content-addressed by S3 key —
 * so a previously-built ZIP is safely reused across users. The S3 lifecycle
 * rule `tmp-bundles-expire-after-1-day` bounds the cache TTL to 24 hours, which
 * also bounds the staleness window if a format is re-uploaded. The download URL
 * is signed per-request with Content-Disposition set at signing time, so the
 * cached object's upload-time filename never leaks into the user's download.
 */
const assembleGate = (args: {
  request: NextRequest;
  releaseId: string;
  requestedFormats: DigitalFormatType[];
  mode: string | undefined;
  isFreeMode: boolean;
  userId: string | null;
  identity: FreeVisitorIdentity;
  respondFlags: RespondFlags;
  resolvedFormats: ResolvedFormat[];
  releaseTitle: string;
}): BundleGate => {
  const { releaseId, requestedFormats, mode, isFreeMode, userId, identity } = args;
  const sortedFormatKey = [...requestedFormats].sort().join('-');
  const cachedZipKey = `tmp/bundles/cache/${releaseId}/${mode}/${sortedFormatKey}.zip`;
  const safeTitleForKey = args.releaseTitle.replace(/[^\w\s.-]/g, '').trim() || 'release';
  const cachedZipFileName = `${safeTitleForKey}.zip`;

  // 007-free-digital-downloads US2/US3 — free-mode subjects (guest or
  // authenticated) are keyed by `userId` when authenticated, else by the
  // guest visitorId. The lock prevents two concurrent free requests for the
  // same `(subject, release, sortedFormatKey)` from racing on the cap query.
  const freeSubject: DownloadSubject | null = isFreeMode
    ? userId
      ? { kind: 'user', userId }
      : { kind: 'guest', visitorId: identity.guestVisitorId as string }
    : null;
  const freeSubjectKey =
    freeSubject?.kind === 'user'
      ? `user:${freeSubject.userId}`
      : freeSubject !== null
        ? `guest:${freeSubject.visitorId}`
        : null;
  const lockKey =
    freeSubjectKey !== null ? `${freeSubjectKey}|${releaseId}|${sortedFormatKey}` : null;

  return {
    request: args.request,
    releaseId,
    requestedFormats,
    mode,
    isFreeMode,
    userId,
    guestVisitorId: identity.guestVisitorId,
    guestAllVisitorIds: identity.guestAllVisitorIds,
    respondJson: args.respondFlags.respondJson,
    respondStream: args.respondFlags.respondStream,
    respondPreflight: args.respondFlags.respondPreflight,
    resolvedFormats: args.resolvedFormats,
    cachedZipKey,
    cachedZipFileName,
    freeSubject,
    lockKey,
    auditIp: args.request.headers.get('x-forwarded-for') ?? 'unknown',
    auditUserAgent: args.request.headers.get('user-agent') ?? 'unknown',
  };
};

/** Cap/lock outcome: either an early Response or whether this request holds the lock. */
type CapLockResult =
  | { kind: 'response'; response: Response }
  | { kind: 'ok'; lockAcquired: boolean };

/**
 * 007-free-digital-downloads US2/US3 — enforce the rolling 24h free-tier cap
 * BEFORE bundle prep (so we do not pay the S3 round-trip for a request that will
 * be rejected) and acquire the per-(subject, release, formats) collision lock.
 * On a cap breach writes a CAP_REACHED audit row and returns 403. On a lock
 * collision with no warm cache returns 409 LOCK_HELD; with a warm cache it
 * proceeds without the lock. No-op for paid mode (returns lockAcquired=false).
 */
const enforceFreeCapAndLock = async (gate: BundleGate): Promise<CapLockResult> => {
  const { isFreeMode, freeSubject } = gate;
  if (!isFreeMode || freeSubject === null) {
    return { kind: 'ok', lockAcquired: false };
  }

  const capResponse = await assertFreeCap(gate, freeSubject);
  if (capResponse) {
    return { kind: 'response', response: capResponse };
  }

  // Skip lock acquisition for preflight requests — preflight is a
  // gating-check only and the follow-up streaming request will
  // re-acquire the lock for the actual delivery.
  if (gate.respondPreflight) {
    return { kind: 'ok', lockAcquired: false };
  }

  // Acquire the per-(subject, release, formats) collision lock. If another
  // concurrent caller holds it AND there is no warm cache for the same tuple,
  // return 409 LOCK_HELD so the client can retry.
  const lockKey = gate.lockKey as string;
  const lockAcquired = freeDownloadLockService.acquire(lockKey);
  if (!lockAcquired) {
    const cacheWarm = await verifyS3ObjectExists(gate.cachedZipKey);
    if (!cacheWarm) {
      return {
        kind: 'response',
        response: Response.json(
          {
            errorCode: 'LOCK_HELD',
            message: 'Another download is in progress for this release. Please retry shortly.',
          },
          { status: 409, headers: NO_STORE_HEADERS }
        ),
      };
    }
    // Cache warm: proceed without holding the lock; the original holder
    // is still responsible for cap accounting on their request, and this
    // path will independently call `recordSuccessfulDownload` below.
  }
  return { kind: 'ok', lockAcquired };
};

/**
 * Assert the free-tier cap for the resolved subject. On a `CapReachedError`,
 * write an audit row (`success:false, errorCode:'CAP_REACHED'` — intentionally
 * NOT counted by future cap queries, which require `success:true`) and return a
 * 403 Response. Returns `null` when the cap allows the download; rethrows any
 * non-cap error so the GET handler surfaces it as a 500.
 */
const assertFreeCap = async (
  gate: BundleGate,
  freeSubject: DownloadSubject
): Promise<Response | null> => {
  try {
    await freeDownloadQuotaService.assertFreeDownloadAllowed({
      subject: freeSubject,
      visitorIds: gate.guestAllVisitorIds,
      releaseId: gate.releaseId,
    });
    return null;
  } catch (capError) {
    if (capError instanceof CapReachedError) {
      try {
        await new DownloadEventRepository().logDownloadEvent({
          userId: gate.userId,
          visitorId: gate.guestVisitorId,
          releaseId: gate.releaseId,
          formatType: gate.requestedFormats[0],
          success: false,
          errorCode: 'CAP_REACHED',
          ipAddress: gate.auditIp,
          userAgent: gate.auditUserAgent,
        });
      } catch (auditError) {
        loggers.downloads.error('Failed to write CAP_REACHED audit event', auditError, {
          releaseId: gate.releaseId,
        });
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
};

/**
 * Derive the immutable `BundleDeliveryContext` consumed by the delivery paths,
 * including the free-mode `recordFreeSuccess` / `recordFreeStreamFailure`
 * closures. `recordFreeSuccess` records a single successful free-tier download
 * for the resolved subject (called exactly once per successful bundle, T050 —
 * before the SSE `ready` / 302 so the cap is incremented atomically with
 * delivery). `recordFreeStreamFailure` writes a `success:false,
 * errorCode:'STREAM_FAILED'` audit event for observability — NOT counted by the
 * cap (T062). Both no-op for paid mode.
 */
const buildDeliveryContext = (gate: BundleGate): BundleDeliveryContext => {
  const { isFreeMode, freeSubject, releaseId, userId, guestVisitorId, auditIp, auditUserAgent } =
    gate;

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
      loggers.downloads.error('Failed to record successful free download', recordError, {
        releaseId,
      });
    }
  };

  const recordFreeStreamFailure = async (): Promise<void> => {
    if (!isFreeMode) return;
    try {
      await new DownloadEventRepository().logDownloadEvent({
        userId,
        visitorId: guestVisitorId,
        releaseId,
        formatType: gate.requestedFormats[0],
        success: false,
        errorCode: 'STREAM_FAILED',
        ipAddress: auditIp,
        userAgent: auditUserAgent,
      });
    } catch (auditError) {
      loggers.downloads.error('Failed to write STREAM_FAILED audit event', auditError, {
        releaseId,
      });
    }
  };

  return {
    resolvedFormats: gate.resolvedFormats,
    cachedZipKey: gate.cachedZipKey,
    cachedZipFileName: gate.cachedZipFileName,
    releaseId,
    isFreeMode,
    userId,
    guestVisitorId,
    auditIp,
    auditUserAgent,
    recordFreeSuccess,
    recordFreeStreamFailure,
  };
};
