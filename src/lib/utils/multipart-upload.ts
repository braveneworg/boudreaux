/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Browser-side multipart uploader for large video files.
 *
 * Streams a `File` straight to S3 through the multipart Server Actions:
 * `initiate` → just-in-time presigned parts pushed over an `XMLHttpRequest`
 * worker pool (progress, retry, abort) → `complete`. Part URLs are presigned
 * in shared batches on demand so a long-running upload never holds a stale set
 * of signatures. Concurrency, retry backoff, and abort all cooperate through a
 * single mutable session object.
 *
 * Plain client util — no `'use client'` directive and no `'server-only'`
 * marker; the Server Actions it imports are RPC references on the client.
 */

import {
  abortVideoUploadAction,
  completeVideoUploadAction,
  initiateVideoUploadAction,
  presignVideoPartsAction,
} from '@/lib/actions/multipart-upload-actions';
import { VIDEO_PART_URL_BATCH_MAX, VIDEO_UPLOAD_CONCURRENCY } from '@/lib/constants/video-uploads';

export interface MultipartUploadOptions {
  videoId: string;
  /** Monotonic upload fraction in the range 0..1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Parts uploaded in parallel. Defaults to {@link VIDEO_UPLOAD_CONCURRENCY}. */
  concurrency?: number;
  /** Attempts per part before the upload fails. Defaults to 3. */
  maxAttemptsPerPart?: number;
  /** Base retry backoff; exists so specs can pass 0. Defaults to 500ms. */
  baseRetryDelayMs?: number;
}

export interface MultipartUploadSuccess {
  success: true;
  s3Key: string;
  fileSize: number;
}

export interface MultipartUploadFailure {
  success: false;
  error: string;
  aborted?: boolean;
}

type MultipartUploadResult = MultipartUploadSuccess | MultipartUploadFailure;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 500;
/**
 * Ceiling for progress driven by `xhr.upload.onprogress`. A real XHR fires a
 * final onprogress with `loaded === total` per part, so the aggregate would hit
 * exactly 1 before the complete action runs. Clamping just below 1 keeps the
 * terminal `1` emitted exactly once by {@link reportComplete}, after completion.
 */
const PRE_COMPLETE_PROGRESS_CAP = 0.99;

/** Outcome of a single part-upload attempt. */
type PartOutcome = 'success' | 'retry' | 'forbidden' | 'stopped';

interface ResolvedOptions {
  videoId: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  concurrency: number;
  maxAttemptsPerPart: number;
  baseRetryDelayMs: number;
}

interface InitiatedUpload {
  s3Key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
}

/** All mutable state for one upload, shared across the worker pool. */
interface UploadSession {
  file: File;
  options: ResolvedOptions;
  s3Key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  /** Next 1-based part number a worker will claim. */
  nextPart: number;
  urlCache: Map<number, string>;
  /** Shared promise of the single in-flight presign batch, if any. */
  batchPromise: Promise<boolean> | null;
  completedParts: Array<{ partNumber: number; eTag: string }>;
  /** Bytes uploaded per part in the current attempt. */
  loadedByPart: Map<number, number>;
  reportedFraction: number;
  xhrs: Set<XMLHttpRequest>;
  cancelled: boolean;
  aborted: boolean;
  error: string | null;
  /** Aborted by {@link cancel} to wake pending backoff timers. */
  internalController: AbortController;
}

const resolveOptions = (options: MultipartUploadOptions): ResolvedOptions => ({
  videoId: options.videoId,
  onProgress: options.onProgress,
  signal: options.signal,
  concurrency: options.concurrency ?? VIDEO_UPLOAD_CONCURRENCY,
  maxAttemptsPerPart: options.maxAttemptsPerPart ?? DEFAULT_MAX_ATTEMPTS,
  baseRetryDelayMs: options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS,
});

const createSession = (
  file: File,
  options: ResolvedOptions,
  initiated: InitiatedUpload
): UploadSession => ({
  file,
  options,
  s3Key: initiated.s3Key,
  uploadId: initiated.uploadId,
  partSize: initiated.partSize,
  partCount: initiated.partCount,
  nextPart: 1,
  urlCache: new Map(),
  batchPromise: null,
  completedParts: [],
  loadedByPart: new Map(),
  reportedFraction: 0,
  xhrs: new Set(),
  cancelled: false,
  aborted: false,
  error: null,
  internalController: new AbortController(),
});

/** The lazy blob view for a 1-based part number. */
const sliceForPart = (session: UploadSession, partNumber: number): Blob => {
  const start = (partNumber - 1) * session.partSize;
  const end = Math.min(partNumber * session.partSize, session.file.size);
  return session.file.slice(start, end);
};

/**
 * Emit an updated progress fraction, clamped just below 1 (never the terminal
 * value — that is {@link reportComplete}'s job) and never decreasing.
 */
const reportProgress = (session: UploadSession): void => {
  const { onProgress } = session.options;
  if (!onProgress) return;
  let total = 0;
  for (const loaded of session.loadedByPart.values()) total += loaded;
  const fraction = Math.min(total / session.file.size, PRE_COMPLETE_PROGRESS_CAP);
  if (fraction > session.reportedFraction) {
    session.reportedFraction = fraction;
    onProgress(fraction);
  }
};

/** Report the terminal fraction of 1 exactly once, after completion. */
const reportComplete = (session: UploadSession): void => {
  const { onProgress } = session.options;
  if (onProgress && session.reportedFraction < 1) {
    session.reportedFraction = 1;
    onProgress(1);
  }
};

/** Claim the next unassigned part, or `undefined` when drained/cancelled. */
const takeNextPart = (session: UploadSession): number | undefined => {
  if (session.cancelled || session.nextPart > session.partCount) return undefined;
  const partNumber = session.nextPart;
  session.nextPart += 1;
  return partNumber;
};

/**
 * Stop the whole upload once: drain the queue, abort in-flight XHRs, and wake
 * any pending backoff. Idempotent — the first cause (abort or give-up) wins.
 */
const cancel = (session: UploadSession, aborted: boolean, error: string): void => {
  if (session.cancelled) return;
  session.cancelled = true;
  session.aborted = aborted;
  session.error = error;
  session.nextPart = session.partCount + 1;
  session.internalController.abort();
  for (const xhr of Array.from(session.xhrs)) xhr.abort();
  session.xhrs.clear();
};

/** Resolve after `ms`, or early when `signal` aborts. No timer when `ms <= 0`. */
const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

/** The first up-to-batch-max part numbers that have no cached URL yet. */
const nextUnfetchedParts = (session: UploadSession): number[] => {
  const parts: number[] = [];
  for (let part = 1; part <= session.partCount && parts.length < VIDEO_PART_URL_BATCH_MAX; part++) {
    if (!session.urlCache.has(part)) parts.push(part);
  }
  return parts;
};

/**
 * Presign a batch of part numbers and cache the URLs. An error result — or a
 * rejected action RPC (transport failure) — returns false, a retryable batch
 * fault, so the parts waiting on it fall through to the normal backoff/retry.
 */
const presignAndCache = async (session: UploadSession, partNumbers: number[]): Promise<boolean> => {
  let result: Awaited<ReturnType<typeof presignVideoPartsAction>>;
  try {
    result = await presignVideoPartsAction({
      s3Key: session.s3Key,
      uploadId: session.uploadId,
      partNumbers,
    });
  } catch {
    return false;
  }
  if (!result.success || result.data === undefined) return false;
  for (const { partNumber, url } of result.data) session.urlCache.set(partNumber, url);
  return true;
};

/** Run a single presign batch, exposing its promise so peers can share it. */
const runBatch = async (session: UploadSession): Promise<boolean> => {
  const partNumbers = nextUnfetchedParts(session);
  if (partNumbers.length === 0) return false;
  const promise = presignAndCache(session, partNumbers);
  session.batchPromise = promise;
  try {
    return await promise;
  } finally {
    session.batchPromise = null;
  }
};

/**
 * Return the presigned URL for a part, fetching a shared just-in-time batch if
 * needed. `null` signals a presign failure (treated as a retryable part fault)
 * or that the session was cancelled while waiting.
 */
const acquirePartUrl = async (
  session: UploadSession,
  partNumber: number
): Promise<string | null> => {
  while (!session.cancelled) {
    const cached = session.urlCache.get(partNumber);
    if (cached !== undefined) return cached;
    if (session.batchPromise) {
      await session.batchPromise;
      continue;
    }
    const fetched = await runBatch(session);
    if (!fetched) return null;
  }
  return null;
};

/** Refresh a single part's URL after a 403, so the retry uses a fresh signature. */
const represign = async (session: UploadSession, partNumber: number): Promise<void> => {
  let result: Awaited<ReturnType<typeof presignVideoPartsAction>>;
  try {
    result = await presignVideoPartsAction({
      s3Key: session.s3Key,
      uploadId: session.uploadId,
      partNumbers: [partNumber],
    });
  } catch {
    // RPC rejected — treat the same as an error result: drop the stale URL so
    // the next attempt re-acquires through the normal presign-batch path.
    session.urlCache.delete(partNumber);
    return;
  }
  const entry = result.success
    ? result.data?.find((url) => url.partNumber === partNumber)
    : undefined;
  if (entry) session.urlCache.set(partNumber, entry.url);
  else session.urlCache.delete(partNumber);
};

/** The ETag of a successful 2xx response, or `null` if not a valid success. */
const successEtag = (xhr: XMLHttpRequest): string | null => {
  if (xhr.status < 200 || xhr.status >= 300) return null;
  const eTag = xhr.getResponseHeader('ETag');
  return eTag && eTag.length > 0 ? eTag : null;
};

/** PUT one part slice over a single XHR, resolving to its attempt outcome. */
const putPart = (
  session: UploadSession,
  partNumber: number,
  url: string,
  slice: Blob
): Promise<PartOutcome> =>
  new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    session.xhrs.add(xhr);
    let settled = false;
    const finish = (outcome: PartOutcome): void => {
      if (settled) return;
      settled = true;
      session.xhrs.delete(xhr);
      resolve(outcome);
    };
    xhr.upload.onprogress = (event): void => {
      session.loadedByPart.set(partNumber, Math.min(event.loaded, slice.size));
      reportProgress(session);
    };
    xhr.onload = (): void => {
      const eTag = successEtag(xhr);
      if (eTag) {
        session.completedParts.push({ partNumber, eTag });
        finish('success');
      } else finish(xhr.status === 403 ? 'forbidden' : 'retry');
    };
    xhr.onerror = (): void => finish('retry');
    xhr.onabort = (): void => finish('stopped');
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', session.file.type);
    xhr.send(slice);
  });

/** One attempt: acquire a URL then PUT the slice. */
const uploadPartOnce = async (session: UploadSession, partNumber: number): Promise<PartOutcome> => {
  const url = await acquirePartUrl(session, partNumber);
  if (session.cancelled) return 'stopped';
  if (url === null) return 'retry';
  session.loadedByPart.set(partNumber, 0);
  return putPart(session, partNumber, url, sliceForPart(session, partNumber));
};

/** Wait out the exponential backoff before a retry. Returns false if cancelled. */
const backoff = async (session: UploadSession, attempt: number): Promise<boolean> => {
  const ms = session.options.baseRetryDelayMs * 2 ** (attempt - 2);
  await delay(ms, session.internalController.signal);
  return !session.cancelled;
};

/**
 * Upload one part with retries. Returns true on success; false when the session
 * was cancelled or the part exhausted its attempts (which triggers cancel).
 */
const uploadPartWithRetry = async (
  session: UploadSession,
  partNumber: number
): Promise<boolean> => {
  const { maxAttemptsPerPart } = session.options;
  for (let attempt = 1; attempt <= maxAttemptsPerPart; attempt++) {
    if (attempt > 1 && !(await backoff(session, attempt))) return false;
    const outcome = await uploadPartOnce(session, partNumber);
    if (outcome === 'success') return true;
    if (outcome === 'stopped' || session.cancelled) return false;
    if (outcome === 'forbidden') await represign(session, partNumber);
  }
  cancel(session, false, `Part ${partNumber} failed after ${maxAttemptsPerPart} attempts`);
  return false;
};

/** A pool worker: claim and upload parts until the queue drains or a fault stops it. */
const runWorker = async (session: UploadSession): Promise<void> => {
  while (!session.cancelled) {
    const partNumber = takeNextPart(session);
    if (partNumber === undefined) return;
    const ok = await uploadPartWithRetry(session, partNumber);
    if (!ok) return;
  }
};

/** Best-effort multipart abort — a failed cleanup call is swallowed. */
const bestEffortAbort = async (session: UploadSession): Promise<void> => {
  await abortVideoUploadAction({ s3Key: session.s3Key, uploadId: session.uploadId }).catch(
    () => undefined
  );
};

/** A user-facing message for a rejected action RPC, preferring its own text. */
const messageFromRejection = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/** Turn the settled worker pool into the final result: abort, or complete. */
const finalize = async (session: UploadSession): Promise<MultipartUploadResult> => {
  if (session.cancelled) {
    await bestEffortAbort(session);
    return session.aborted
      ? { success: false, error: session.error ?? 'Upload aborted', aborted: true }
      : { success: false, error: session.error ?? 'Upload failed' };
  }
  let completed: Awaited<ReturnType<typeof completeVideoUploadAction>>;
  try {
    completed = await completeVideoUploadAction({
      s3Key: session.s3Key,
      uploadId: session.uploadId,
      parts: session.completedParts,
    });
  } catch (error) {
    await bestEffortAbort(session);
    return { success: false, error: messageFromRejection(error, 'Failed to complete upload') };
  }
  if (!completed.success || completed.data === undefined) {
    await bestEffortAbort(session);
    return { success: false, error: completed.error ?? 'Failed to complete upload' };
  }
  reportComplete(session);
  return { success: true, s3Key: completed.data.s3Key, fileSize: completed.data.fileSize };
};

/**
 * Initiate the upload, mapping an error result *or* a rejected action RPC
 * (transport failure) to a failure outcome — nothing has been created yet, so
 * there is no multipart upload to abort.
 */
const runInitiate = async (
  file: File,
  options: ResolvedOptions
): Promise<{ ok: true; data: InitiatedUpload } | { ok: false; error: string }> => {
  try {
    const initiated = await initiateVideoUploadAction({
      videoId: options.videoId,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    });
    if (!initiated.success || initiated.data === undefined) {
      return { ok: false, error: initiated.error ?? 'Failed to initiate upload' };
    }
    return { ok: true, data: initiated.data };
  } catch (error) {
    return { ok: false, error: messageFromRejection(error, 'Failed to initiate upload') };
  }
};

/**
 * Upload a video `File` to S3 as a multipart upload driven entirely from the
 * browser. Progress is reported monotonically in 0..1; `signal` cancels the
 * upload and best-effort aborts it server-side. Resolves to a discriminated
 * success/failure result and never throws for an expected action error.
 */
export const uploadVideoMultipart = async (
  file: File,
  options: MultipartUploadOptions
): Promise<MultipartUploadSuccess | MultipartUploadFailure> => {
  const resolved = resolveOptions(options);
  if (resolved.signal?.aborted) {
    return { success: false, error: 'Upload aborted before it started', aborted: true };
  }

  const initiated = await runInitiate(file, resolved);
  if (!initiated.ok) {
    return { success: false, error: initiated.error };
  }

  const session = createSession(file, resolved, initiated.data);
  const onAbort = (): void => cancel(session, true, 'Upload aborted');
  resolved.signal?.addEventListener('abort', onAbort);
  if (resolved.signal?.aborted) cancel(session, true, 'Upload aborted');

  try {
    const workers = Array.from({ length: resolved.concurrency }, () => runWorker(session));
    await Promise.all(workers);
    return await finalize(session);
  } finally {
    resolved.signal?.removeEventListener('abort', onAbort);
  }
};
