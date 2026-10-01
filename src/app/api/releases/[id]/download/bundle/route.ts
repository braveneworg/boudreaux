/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PassThrough, Transform } from 'node:stream';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { Upload } from '@aws-sdk/lib-storage';

import { auth } from '@/lib/auth';
import { DOWNLOAD_LIMIT, downloadLimiter } from '@/lib/config/rate-limit-tiers';
import { FORMAT_LABELS, type DigitalFormatType } from '@/lib/constants/digital-formats';
import { extractClientIp } from '@/lib/decorators/with-rate-limit';
import type { AuditContext } from '@/lib/services/download-gate/counters';
import { downloadGate, type GateFormatRecord } from '@/lib/services/download-gate/download-gate';
import type { Deliverable, DownloadRequest, Grant } from '@/lib/services/download-gate/types';
import { ReleaseService } from '@/lib/services/release-service';
import { buildContentDisposition } from '@/lib/utils/content-disposition';
import { downloadRefusal } from '@/lib/utils/download-outcome-response';
import { loggers } from '@/lib/utils/logger';
import { resolveDownloadSubject } from '@/lib/utils/resolve-download-subject';
import {
  generatePresignedDownloadUrl,
  getS3BucketName,
  getS3Client,
  verifyS3ObjectExists,
} from '@/lib/utils/s3-client';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import {
  createStoreArchive,
  issuePrefetch,
  safeArchiveEntryName,
  startBufferPrefetch,
  type ZipArchive,
} from '@/lib/utils/zip-stream';
import { bundleDownloadQuerySchema } from '@/lib/validation/bundle-download-schema';

import type { Readable } from 'node:stream';

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

/** A requested digital format resolved to its archivable child files. */
interface ResolvedFormat {
  formatType: DigitalFormatType;
  files: Array<{ s3Key: string; fileName: string }>;
}

/**
 * Everything the three producers need once the gate has granted: the files to
 * archive and where the built ZIP lives in the cache. The gate owns the
 * decision and the charge; the producers only build, upload, and presign.
 */
interface BundleDeliveryContext {
  readonly resolvedFormats: ResolvedFormat[];
  readonly cachedZipKey: string;
  readonly cachedZipFileName: string;
  readonly releaseId: string;
}

/** What a producer resolves with: the presigned URL of the built ZIP. */
interface BuiltZip {
  downloadUrl: string;
  fileName: string;
}

/** Thrown by a producer when nothing could be delivered, so the gate charges nothing. */
class NothingToDeliverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NothingToDeliverError';
  }
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

/** Mutable handle threaded through the SSE archive build for teardown. */
interface SseArchiveHandles {
  combinedArchive: ZipArchive | null;
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
 * immediately, and sign a fresh download URL. The caller emits `ready` once
 * the gate has charged, then `complete`, and closes the controller.
 */
const runSseCacheHit = async (session: SseSession): Promise<BuiltZip> => {
  const { ctx, send } = session;
  const { resolvedFormats, cachedZipKey, cachedZipFileName } = ctx;
  for (const { formatType } of resolvedFormats) {
    const label = resolveFormatLabel(formatType);
    send('progress', { formatType, label, status: 'zipping' });
    send('progress', { formatType, label, status: 'done' });
  }
  send('progress', { status: 'uploading' });

  const downloadUrl = await generatePresignedDownloadUrl(
    cachedZipKey,
    cachedZipFileName,
    TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
  );
  return { downloadUrl, fileName: cachedZipFileName };
};

/**
 * Construct the archiver + S3 multipart upload for the live SSE build and wire
 * the error listeners. Mutates `session.handles` so the surrounding
 * `abortSseUpload` can tear everything down. Returns the archive plus an
 * `archiveError` getter capturing the first archiver-level error.
 */
const initSseArchive = (
  session: SseSession
): { archive: ZipArchive; getArchiveError: () => Error | null } => {
  const { ctx, s3Client, bucket, handles } = session;
  const archiveForSse = createStoreArchive();
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
  readonly archive: ZipArchive;
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
  archive: ZipArchive,
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
): Promise<BuiltZip> => {
  const { ctx, send } = session;
  const { resolvedFormats, cachedZipKey, cachedZipFileName } = ctx;
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
    throw new NothingToDeliverError('No formats could be prepared.');
  }

  // Finalize archive and wait for upload to complete
  send('progress', { status: 'uploading' });
  archive.finalize();
  await session.handles.uploadPromise;

  const downloadUrl = await generatePresignedDownloadUrl(
    cachedZipKey,
    cachedZipFileName,
    TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
  );
  return { downloadUrl, fileName: cachedZipFileName };
};

/**
 * SSE streaming path (`respond=json`): create a single combined ZIP containing
 * all requested formats as subfolders, streaming progress events to the client
 * as each format is appended. A single presigned download URL is emitted once
 * the archive upload completes — this ensures iOS Safari (which cannot handle
 * multiple concurrent downloads) receives exactly one file.
 */
const streamSseResponse = (gateArgs: GateArgs): NextResponse => {
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
        // The gate decides, then runs this producer, then charges; `ready`
        // goes out only after the charge, so delivery and accounting stay
        // atomic as before.
        const outcome = await downloadGate.download(
          gateArgs.request,
          async (grant, records) => {
            const ctx = gateArgs.contextFor(grant, records);
            const session: SseSession = { ctx, send, s3Client, bucket, handles };
            const built = (await verifyS3ObjectExists(ctx.cachedZipKey))
              ? await runSseCacheHit(session)
              : await runSseLiveBuild(session, abortSseUpload);
            return { kind: 'url', ...built };
          },
          gateArgs.audit
        );
        if (outcome.ok && outcome.deliverable.kind === 'url') {
          send('ready', {
            downloadUrl: outcome.deliverable.downloadUrl,
            fileName: outcome.deliverable.fileName,
          });
        } else if (!outcome.ok) {
          const { body } = downloadRefusal(outcome);
          send('error', { message: body.message, errorCode: body.error });
        }
      } catch (streamError) {
        await abortSseUpload();
        loggers.downloads.error('Bundle SSE stream error', streamError);
        send('error', {
          message:
            streamError instanceof NothingToDeliverError
              ? streamError.message
              : 'An unexpected error occurred.',
        });
      }

      send('complete', {});
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
};

/**
 * Cache hit fast path — reuse a previously-built ZIP for this exact
 * (release, formats) tuple. The cache TTL is bounded by the
 * `tmp-bundles-expire-after-1-day` S3 lifecycle rule. Presigns a fresh URL;
 * the caller 302-redirects once the gate has charged.
 */
const produceCachedZip = async (ctx: BundleDeliveryContext): Promise<Deliverable> => ({
  kind: 'url',
  downloadUrl: await generatePresignedDownloadUrl(
    ctx.cachedZipKey,
    ctx.cachedZipFileName,
    TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
  ),
  fileName: ctx.cachedZipFileName,
});

/** Wiring for the direct-stream tee path: archiver → response + cache upload. */
interface StreamPipeline {
  archive: ZipArchive;
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
  const archive = createStoreArchive();
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
const produceDirectStream = async (
  ctx: BundleDeliveryContext,
  s3Client: ReturnType<typeof getS3Client>,
  bucketName: string
): Promise<Deliverable> => {
  const { resolvedFormats, cachedZipFileName } = ctx;
  const pipeline = buildStreamPipeline(ctx, s3Client, bucketName);

  const useSubfolders = resolvedFormats.length > 1;
  const fileEntries = buildFileEntries(resolvedFormats, useSubfolders);

  // Kick off the prefetch pipeline ONCE and peek at the first object body
  // up-front: the gate charges once this producer resolves, so an
  // all-missing bundle (every S3 object deleted → empty ZIP) must throw
  // instead, and the same `inFlight` list is handed to the drive so the
  // first batch of S3 GETs is issued exactly once.
  const s3: S3Target = { client: s3Client, bucket: bucketName };
  const streamKeys = fileEntries.map((entry) => entry.s3Key);
  const streamInFlight = startBufferPrefetch(s3Client, bucketName, streamKeys, S3_PREFETCH_DEPTH);
  const streamFirstBuffer = await peekFirstBody(streamInFlight);
  if (streamFirstBuffer === null) {
    pipeline.archive.abort();
    throw new NothingToDeliverError('No files could be fetched for this bundle.');
  }

  driveStreamArchive(ctx, pipeline, fileEntries, {
    inFlight: streamInFlight,
    keys: streamKeys,
    s3,
  });

  const response = new NextResponse(toWebStream(pipeline), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': buildContentDisposition(cachedZipFileName),
      'Cache-Control': 'private, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
  return { kind: 'stream', response };
};

/**
 * Peek at the first prefetched object body from the shared in-flight list,
 * coalescing a rejection (e.g. S3 NoSuchKey) to `null`. Returns the resolved
 * first body, or `null` when the bundle is empty (no entries) or the first
 * body is missing/failed — the producer then refuses to deliver.
 */
const peekFirstBody = async (
  streamInFlight: ReadonlyArray<Promise<Buffer | null>>
): Promise<Buffer | null> => {
  try {
    return await streamInFlight[0];
  } catch {
    // First body failed (e.g. S3 NoSuchKey); the producer refuses to deliver.
    return null;
  }
};

/**
 * Build one combined ZIP, upload it to the shared cache key, and sign a
 * short-lived presigned URL (default `respond`-absent path; the caller
 * 302-redirects once the gate has charged). On a build failure the archive and
 * upload are aborted and the error rethrown — the gate records STREAM_FAILED;
 * on a post-upload failure the cached ZIP is retained (the lifecycle rule
 * bounds its lifetime) and the error rethrown.
 */
const produceBuiltZip = async (
  ctx: BundleDeliveryContext,
  s3Client: ReturnType<typeof getS3Client>,
  bucketName: string
): Promise<Deliverable> => {
  const { resolvedFormats, cachedZipKey, cachedZipFileName } = ctx;
  const archive = createStoreArchive(); // store mode (no compression)
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

  return presignBuiltZip(ctx);
};

/**
 * Download bodies into memory in parallel so archiver only does memory→memory
 * copies and the multipart uploader drains at full throughput, then finalize
 * and await the upload. On failure: abort the archive + upload and rethrow.
 */
const driveRedirectArchive = async (
  ctx: BundleDeliveryContext,
  args: {
    archive: ZipArchive;
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
    // The gate records STREAM_FAILED and charges nothing.
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
  archive: ZipArchive,
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
const presignBuiltZip = async (ctx: BundleDeliveryContext): Promise<Deliverable> => {
  const { cachedZipKey, cachedZipFileName } = ctx;
  try {
    const downloadUrl = await generatePresignedDownloadUrl(
      cachedZipKey,
      cachedZipFileName,
      TEMP_BUNDLE_DOWNLOAD_URL_EXPIRATION_SECONDS
    );
    return { kind: 'url', downloadUrl, fileName: cachedZipFileName };
  } catch (postUploadError) {
    loggers.downloads.error('Bundle post-upload error (cached ZIP retained)', postUploadError, {
      tempS3Key: cachedZipKey,
    });
    throw postUploadError;
  }
};

/** What every delivery path hands the gate. */
interface GateArgs {
  readonly request: DownloadRequest;
  readonly audit: AuditContext;
  /** Build the producers' context from the granted formats' records. */
  readonly contextFor: (grant: Grant, records: GateFormatRecord[]) => BundleDeliveryContext;
}

/** Either the fully-resolved inputs or an early response to return verbatim. */
type BundleSetup =
  | { kind: 'response'; response: NextResponse }
  | {
      kind: 'ok';
      gateArgs: GateArgs;
      respond: 'json' | 'stream' | 'preflight' | null;
    };

const refusalResponse = (refusal: Parameters<typeof downloadRefusal>[0]): NextResponse => {
  const { status, body } = downloadRefusal(refusal);
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
};

// Rate limiting — skipped in E2E test mode to avoid 429s during test runs.
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
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }
};

/** A granted format's repository record, flattened to the files to archive. */
const toResolvedFormat = (record: GateFormatRecord): ResolvedFormat | null => {
  const formatType = record.formatType as DigitalFormatType;
  // Prefer multi-track child files; fall back to legacy single-file
  if (record.files.length > 0) {
    return {
      formatType,
      files: record.files.map((f) => ({ s3Key: f.s3Key, fileName: f.fileName })),
    };
  }
  if (record.s3Key && record.fileName) {
    return { formatType, files: [{ s3Key: record.s3Key, fileName: record.fileName }] };
  }
  return null;
};

/**
 * Rate-limit, validate the release id and `formats`, resolve the download
 * subject (signed-in user or guest), and confirm the release is listed — the
 * HTTP half of the request. A legacy `mode` parameter is ignored: the gate
 * decides the mode from entitlement (ADR-0018).
 *
 * Cache rationale: bundle ZIPs are immutable for a given (release, formats)
 * tuple — the digital format files are content-addressed by S3 key — so a
 * previously-built ZIP is safely reused across subjects and modes. The S3
 * lifecycle rule `tmp-bundles-expire-after-1-day` bounds the cache TTL, which
 * also bounds the staleness window if a format is re-uploaded. The download
 * URL is signed per request with Content-Disposition set at signing time.
 */
interface ParsedBundleQuery {
  releaseId: string;
  formats: DigitalFormatType[];
  respond: 'json' | 'stream' | 'preflight' | null;
}

const invalidRequest = (error: string, message: string): NextResponse =>
  NextResponse.json({ success: false, error, message }, { status: 400, headers: NO_STORE_HEADERS });

/** Rate-limit, then validate the release id and the `formats` / `respond` query. */
const parseBundleRequest = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<
  { kind: 'query'; query: ParsedBundleQuery } | { kind: 'response'; response: NextResponse }
> => {
  const rateLimited = await enforceDownloadRateLimit(extractClientIp(request));
  if (rateLimited) return { kind: 'response', response: rateLimited };

  const { id: releaseId } = await context.params;
  if (!isValidObjectId(releaseId)) {
    return { kind: 'response', response: invalidRequest('INVALID_REQUEST', 'Invalid release id.') };
  }

  const parsed = bundleDownloadQuerySchema.safeParse({
    formats: request.nextUrl.searchParams.get('formats'),
  });
  if (!parsed.success) {
    return {
      kind: 'response',
      response: invalidRequest(
        'INVALID_FORMATS',
        parsed.error.issues[0]?.message ?? 'Invalid formats parameter.'
      ),
    };
  }
  const respondParam = request.nextUrl.searchParams.get('respond');
  return {
    kind: 'query',
    query: {
      releaseId,
      formats: parsed.data.formats as DigitalFormatType[],
      respond:
        respondParam === 'json' || respondParam === 'stream' || respondParam === 'preflight'
          ? respondParam
          : null,
    },
  };
};

const resolveBundleSetup = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<BundleSetup> => {
  const parsed = await parseBundleRequest(request, context);
  if (parsed.kind === 'response') {
    return parsed;
  }
  const { releaseId, formats, respond } = parsed.query;

  const session = await auth.api.getSession({ headers: request.headers });
  const subject = await resolveDownloadSubject(request, session?.user?.id ?? null);

  const release = await ReleaseService.findPublishedTitleById(releaseId);
  if (!release) {
    return {
      kind: 'response',
      response: refusalResponse({ ok: false, denial: null, reason: 'NOT_FOUND' }),
    };
  }
  const safeTitle = release.title.replace(/[^\w\s.-]/g, '').trim() || 'release';
  const sortedFormatKey = [...formats].sort().join('-');

  return {
    kind: 'ok',
    respond,
    gateArgs: {
      request: { subject, releaseId, formats },
      audit: {
        ipAddress: request.headers.get('x-forwarded-for') ?? 'unknown',
        userAgent: request.headers.get('user-agent') ?? 'unknown',
      },
      contextFor: (_grant, records) => ({
        releaseId,
        resolvedFormats: records
          .map(toResolvedFormat)
          .filter((f): f is ResolvedFormat => f !== null),
        cachedZipKey: `tmp/bundles/cache/${releaseId}/${sortedFormatKey}.zip`,
        cachedZipFileName: `${safeTitle}.zip`,
      }),
    },
  };
};

/**
 * Preflight: paid- and free-mode clients call this before triggering
 * anchor-based streaming downloads so 4xx errors (auth, purchase, download
 * cap, free-tier cap) surface as in-dialog messages instead of the browser
 * rendering raw JSON. Decided by the gate, nothing locked or charged.
 */
const preflightResponse = async (request: DownloadRequest): Promise<NextResponse> => {
  const result = await downloadGate.check(request);
  if (result.kind === 'not-found') {
    return refusalResponse({ ok: false, denial: null, reason: 'NOT_FOUND' });
  }
  if (result.kind === 'denial') {
    return refusalResponse({ ok: false, denial: result });
  }
  return NextResponse.json({ success: true }, { status: 200, headers: NO_STORE_HEADERS });
};

/**
 * GET /api/releases/[id]/download/bundle?formats=A,B[&respond=json|stream|preflight]
 *
 * One ZIP of the requested formats. An adapter over the download gate
 * (ADR-0018): the gate decides the mode and charges once the deliverable
 * exists; this route resolves the subject and produces the ZIP — as SSE
 * progress + a presigned URL (`respond=json`), as the bytes themselves
 * (`respond=stream`), or as a 302 to a presigned URL (default), reusing a
 * cached build when one exists.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const setup = await resolveBundleSetup(request, context);
    if (setup.kind === 'response') {
      return setup.response;
    }
    const { gateArgs, respond } = setup;

    if (respond === 'preflight') {
      return await preflightResponse(gateArgs.request);
    }
    if (respond === 'json') {
      return streamSseResponse(gateArgs);
    }

    const s3Client = getS3Client();
    const bucketName = getS3BucketName();
    const outcome = await downloadGate.download(
      gateArgs.request,
      async (grant, records) => {
        const ctx = gateArgs.contextFor(grant, records);
        if (await verifyS3ObjectExists(ctx.cachedZipKey)) {
          return produceCachedZip(ctx);
        }
        return respond === 'stream'
          ? produceDirectStream(ctx, s3Client, bucketName)
          : produceBuiltZip(ctx, s3Client, bucketName);
      },
      gateArgs.audit
    );
    if (!outcome.ok) {
      return refusalResponse(outcome);
    }
    if (outcome.deliverable.kind === 'stream') {
      return outcome.deliverable.response;
    }
    return new NextResponse(null, {
      status: 302,
      headers: { Location: outcome.deliverable.downloadUrl, ...NO_STORE_HEADERS },
    });
  } catch (error) {
    loggers.downloads.error('Bundle download error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof NothingToDeliverError ? 'STREAM_FAILED' : 'INTERNAL_ERROR',
        message:
          error instanceof NothingToDeliverError ? error.message : 'An unexpected error occurred.',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
