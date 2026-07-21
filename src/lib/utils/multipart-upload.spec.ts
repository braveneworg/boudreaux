/* @vitest-environment jsdom */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  abortVideoUploadAction,
  completeVideoUploadAction,
  initiateVideoUploadAction,
  presignVideoPartsAction,
} from '@/lib/actions/multipart-upload-actions';

import { uploadVideoMultipart } from './multipart-upload';

vi.mock('@/lib/actions/multipart-upload-actions', () => ({
  initiateVideoUploadAction: vi.fn(),
  presignVideoPartsAction: vi.fn(),
  completeVideoUploadAction: vi.fn(),
  abortVideoUploadAction: vi.fn(),
}));

const initiateMock = vi.mocked(initiateVideoUploadAction);
const presignMock = vi.mocked(presignVideoPartsAction);
const completeMock = vi.mocked(completeVideoUploadAction);
const abortMock = vi.mocked(abortVideoUploadAction);

const S3_KEY = 'media/videos/507f1f77bcf86cd799439011/video-1-abc.mp4';
const UPLOAD_ID = 'upload-123';
const VIDEO_ID = '507f1f77bcf86cd799439011';

/**
 * Controllable fake `XMLHttpRequest`. Records every instance so a test can
 * drive `upload.onprogress` / `onload` / `onerror` / `abort()` by hand and
 * observe how the uploader reacts. `inFlight`/`maxInFlight` let a test assert
 * the concurrency bound without snapshotting at an arbitrary tick.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static inFlight = 0;
  static maxInFlight = 0;

  static reset(): void {
    FakeXhr.instances = [];
    FakeXhr.inFlight = 0;
    FakeXhr.maxInFlight = 0;
  }

  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  method: string | null = null;
  url: string | null = null;
  body: Blob | null = null;
  sent = false;
  done = false;
  aborted = false;
  private readonly requestHeaders = new Map<string, string>();
  private readonly responseHeaders = new Map<string, string>();

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders.set(name, value);
  }

  getRequestHeader(name: string): string | null {
    return this.requestHeaders.get(name) ?? null;
  }

  send(body: Blob): void {
    this.sent = true;
    this.body = body;
    FakeXhr.inFlight += 1;
    FakeXhr.maxInFlight = Math.max(FakeXhr.maxInFlight, FakeXhr.inFlight);
  }

  abort(): void {
    this.aborted = true;
    this.settle();
    this.onabort?.();
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders.get(name) ?? null;
  }

  private settle(): void {
    if (this.done) return;
    this.done = true;
    FakeXhr.inFlight -= 1;
  }

  // ── Test drivers ──
  emitProgress(loaded: number): void {
    this.upload.onprogress?.({ loaded });
  }

  succeed(eTag = '"etag-value"'): void {
    this.status = 200;
    this.responseHeaders.set('ETag', eTag);
    this.settle();
    this.onload?.();
  }

  succeedWithoutEtag(): void {
    this.status = 200;
    this.settle();
    this.onload?.();
  }

  respond403(): void {
    this.status = 403;
    this.settle();
    this.onload?.();
  }

  failNetwork(): void {
    this.settle();
    this.onerror?.();
  }
}

/** Bytes-only file of a precise size so slice sizes are deterministic. */
const makeFile = (size: number): File =>
  new File([new Uint8Array(size)], 'clip.mp4', { type: 'video/mp4' });

/** Configure the initiate action for a given part sizing. */
const stubInitiate = (partSize: number, partCount: number): void => {
  initiateMock.mockResolvedValue({
    success: true,
    data: { s3Key: S3_KEY, uploadId: UPLOAD_ID, partSize, partCount },
  });
};

/** Drain microtasks so awaited action/XHR chains advance deterministically. */
const flush = async (times = 12): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
};

type UploadResult = Awaited<ReturnType<typeof uploadVideoMultipart>>;

/**
 * Repeatedly flush microtasks and succeed every in-flight fake XHR until the
 * upload promise settles. Pure microtasks — no real timers (baseRetryDelayMs 0).
 */
const runToCompletion = async (promise: Promise<UploadResult>): Promise<UploadResult> => {
  let settled = false;
  const wrapped = promise.then((result) => {
    settled = true;
    return result;
  });
  let guard = 0;
  while (!settled && guard < 300) {
    guard += 1;
    await flush(4);
    for (const xhr of FakeXhr.instances) {
      if (xhr.sent && !xhr.done) xhr.succeed();
    }
  }
  return wrapped;
};

const pendingXhrs = (): FakeXhr[] => FakeXhr.instances.filter((xhr) => xhr.sent && !xhr.done);

beforeEach(() => {
  FakeXhr.reset();
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  initiateMock.mockReset();
  presignMock.mockReset();
  completeMock.mockReset();
  abortMock.mockReset();

  presignMock.mockImplementation(async ({ partNumbers }) => ({
    success: true,
    data: partNumbers.map((partNumber) => ({
      partNumber,
      url: `https://s3.test/part-${partNumber}`,
    })),
  }));
  completeMock.mockResolvedValue({
    success: true,
    data: { s3Key: S3_KEY, fileSize: 25 },
  });
  abortMock.mockResolvedValue({ success: true, data: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('uploadVideoMultipart — slicing', () => {
  it('slices a file that is an exact multiple of the part size into equal parts', async () => {
    stubInitiate(10, 2);
    const file = makeFile(20);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    const sizes = FakeXhr.instances.map((xhr) => xhr.body?.size ?? -1).sort((a, b) => a - b);
    expect(sizes).toEqual([10, 10]);
  });

  it('makes the final part smaller when the file size has a remainder', async () => {
    stubInitiate(10, 3);
    const file = makeFile(25);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    const sizes = FakeXhr.instances.map((xhr) => xhr.body?.size ?? -1).sort((a, b) => a - b);
    expect(sizes).toEqual([5, 10, 10]);
  });

  it('uploads a single part when the file is smaller than the part size', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(FakeXhr.instances.map((xhr) => xhr.body?.size)).toEqual([4]);
  });

  it('governs slicing by the initiate-supplied part size, not the constant', async () => {
    stubInitiate(6, 2);
    const file = makeFile(10);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    const sizes = FakeXhr.instances.map((xhr) => xhr.body?.size ?? -1).sort((a, b) => a - b);
    expect(sizes).toEqual([4, 6]);
  });

  it('sends each part as a PUT with the file content-type header', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(FakeXhr.instances[0].getRequestHeader('Content-Type')).toBe('video/mp4');
  });
});

describe('uploadVideoMultipart — concurrency', () => {
  it('never runs more XHRs in flight than the configured concurrency', async () => {
    stubInitiate(10, 5);
    const file = makeFile(50);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID, concurrency: 2 }));

    expect(FakeXhr.maxInFlight).toBe(2);
  });
});

describe('uploadVideoMultipart — just-in-time presign batching', () => {
  it('covers every part exactly once across batches capped at the batch max', async () => {
    stubInitiate(10, 7);
    const file = makeFile(70);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID, concurrency: 3 }));

    const requested = presignMock.mock.calls.flatMap(([input]) => input.partNumbers);
    expect([...requested].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps every presign batch within the batch-size ceiling', async () => {
    stubInitiate(10, 7);
    const file = makeFile(70);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID, concurrency: 3 }));

    const oversized = presignMock.mock.calls.filter(([input]) => input.partNumbers.length > 5);
    expect(oversized).toHaveLength(0);
  });

  it('never requests the same part number in two different batches', async () => {
    stubInitiate(10, 7);
    const file = makeFile(70);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID, concurrency: 3 }));

    const requested = presignMock.mock.calls.flatMap(([input]) => input.partNumbers);
    expect(new Set(requested).size).toBe(requested.length);
  });
});

describe('uploadVideoMultipart — success', () => {
  it('completes the upload and returns the server-reported size', async () => {
    stubInitiate(10, 3);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 25 } });
    const file = makeFile(25);

    const result = await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(result).toEqual({ success: true, s3Key: S3_KEY, fileSize: 25 });
  });

  it('sends every uploaded part with its ETag to the complete action', async () => {
    stubInitiate(10, 3);
    const file = makeFile(25);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    const parts = completeMock.mock.calls[0][0].parts
      .map((part) => part.partNumber)
      .sort((a, b) => a - b);
    expect(parts).toEqual([1, 2, 3]);
  });
});

describe('uploadVideoMultipart — retry', () => {
  it('retries a part after a transient network error and still succeeds', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 4 } });
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });
    await flush();
    FakeXhr.instances[0].failNetwork();
    const result = await runToCompletion(promise);

    expect(result.success).toBe(true);
  });

  it('creates a second XHR for the retried part', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });
    await flush();
    FakeXhr.instances[0].failNetwork();
    await runToCompletion(promise);

    expect(FakeXhr.instances).toHaveLength(2);
  });

  it('aborts the multipart upload once when a part exhausts its attempts', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].failNetwork();
    await flush();
    FakeXhr.instances[1].failNetwork();
    await promise;

    expect(abortMock).toHaveBeenCalledTimes(1);
  });

  it('returns a non-aborted failure when a part exhausts its attempts', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].failNetwork();
    await flush();
    FakeXhr.instances[1].failNetwork();
    const result = await promise;

    expect(result).toMatchObject({ success: false });
  });

  it('does not mark an exhaustion failure as aborted', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].failNetwork();
    await flush();
    FakeXhr.instances[1].failNetwork();
    const result = await promise;

    expect(result.success === false && result.aborted).toBeFalsy();
  });

  it('treats a presign error as a part failure and retries the batch', async () => {
    stubInitiate(10, 1);
    presignMock
      .mockImplementationOnce(async () => ({ success: false, error: 'presign boom' }))
      .mockImplementation(async ({ partNumbers }) => ({
        success: true,
        data: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://s3.test/part-${partNumber}`,
        })),
      }));
    const file = makeFile(4);

    const result = await runToCompletion(
      uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 })
    );

    expect(result.success).toBe(true);
  });
});

describe('uploadVideoMultipart — 403 re-presign', () => {
  it('re-presigns the forbidden part before retrying it', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });
    await flush();
    FakeXhr.instances[0].respond403();
    await runToCompletion(promise);

    const lastCall = presignMock.mock.calls.at(-1);
    expect(lastCall?.[0].partNumbers).toEqual([1]);
  });

  it('issues a fresh presign before the retry XHR is sent', async () => {
    stubInitiate(10, 1);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });
    await flush();
    const presignCallsBeforeRetry = presignMock.mock.calls.length;
    FakeXhr.instances[0].respond403();
    await flush();

    expect(presignMock.mock.calls.length).toBeGreaterThan(presignCallsBeforeRetry);
    await runToCompletion(promise);
  });
});

describe('uploadVideoMultipart — abort', () => {
  it('returns an aborted failure immediately when the signal is already aborted', async () => {
    stubInitiate(10, 1);
    const controller = new AbortController();
    controller.abort();
    const file = makeFile(4);

    const result = await uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      signal: controller.signal,
    });

    expect(result).toEqual({ success: false, error: expect.any(String), aborted: true });
  });

  it('calls no server action when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const file = makeFile(4);

    await uploadVideoMultipart(file, { videoId: VIDEO_ID, signal: controller.signal });

    expect(initiateMock).not.toHaveBeenCalled();
  });

  it('aborts every in-flight XHR when the signal fires mid-upload', async () => {
    stubInitiate(10, 5);
    const controller = new AbortController();
    const file = makeFile(50);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      signal: controller.signal,
      concurrency: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    const inFlight = pendingXhrs();
    controller.abort();
    await promise;

    expect(inFlight.every((xhr) => xhr.aborted)).toBe(true);
  });

  it('reports the result as aborted when the signal fires mid-upload', async () => {
    stubInitiate(10, 5);
    const controller = new AbortController();
    const file = makeFile(50);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      signal: controller.signal,
      concurrency: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    controller.abort();
    const result = await promise;

    expect(result).toMatchObject({ success: false, aborted: true });
  });

  it('best-effort aborts the multipart upload when the signal fires mid-upload', async () => {
    stubInitiate(10, 5);
    const controller = new AbortController();
    const file = makeFile(50);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      signal: controller.signal,
      concurrency: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    controller.abort();
    await promise;

    expect(abortMock).toHaveBeenCalledWith({ s3Key: S3_KEY, uploadId: UPLOAD_ID });
  });

  it('starts no further parts after the signal fires mid-upload', async () => {
    stubInitiate(10, 5);
    const controller = new AbortController();
    const file = makeFile(50);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      signal: controller.signal,
      concurrency: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    const startedBeforeAbort = FakeXhr.instances.length;
    controller.abort();
    await promise;
    await flush();

    expect(FakeXhr.instances).toHaveLength(startedBeforeAbort);
  });
});

describe('uploadVideoMultipart — progress', () => {
  it('reports a monotonic progress sequence ending at 1 on success', async () => {
    stubInitiate(10, 2);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 20 } });
    const fractions: number[] = [];
    const file = makeFile(20);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      concurrency: 1,
      onProgress: (fraction) => fractions.push(fraction),
    });
    await flush();
    FakeXhr.instances[0].emitProgress(10);
    FakeXhr.instances[0].succeed();
    await flush();
    FakeXhr.instances[1].emitProgress(5);
    FakeXhr.instances[1].succeed();
    await promise;

    expect(fractions).toEqual([0.5, 0.75, 1]);
  });

  it('never lowers the reported fraction when a part is retried', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 10 } });
    const fractions: number[] = [];
    const file = makeFile(10);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      baseRetryDelayMs: 0,
      onProgress: (fraction) => fractions.push(fraction),
    });
    await flush();
    FakeXhr.instances[0].emitProgress(8);
    FakeXhr.instances[0].failNetwork();
    await flush();
    FakeXhr.instances[1].emitProgress(3);
    FakeXhr.instances[1].succeed();
    await promise;

    expect(fractions).toEqual([0.8, 1]);
  });
});

describe('uploadVideoMultipart — ETag handling', () => {
  it('treats a 2xx response without an ETag as a failed attempt and retries', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 4 } });
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });
    await flush();
    FakeXhr.instances[0].succeedWithoutEtag();
    await flush();
    FakeXhr.instances[1].succeed();
    const result = await promise;

    expect(result.success).toBe(true);
  });
});

describe('uploadVideoMultipart — initiate failure', () => {
  it('returns a failure without uploading when initiate fails', async () => {
    initiateMock.mockResolvedValue({ success: false, error: 'initiate failed' });
    const file = makeFile(4);

    const result = await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(result).toEqual({ success: false, error: 'initiate failed' });
  });

  it('creates no XHRs when initiate fails', async () => {
    initiateMock.mockResolvedValue({ success: false, error: 'initiate failed' });
    const file = makeFile(4);

    await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('does not abort when initiate fails', async () => {
    initiateMock.mockResolvedValue({ success: false, error: 'initiate failed' });
    const file = makeFile(4);

    await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(abortMock).not.toHaveBeenCalled();
  });
});

describe('uploadVideoMultipart — complete failure', () => {
  it('returns a failure when the complete action errors', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: false, error: 'complete failed' });
    const file = makeFile(4);

    const result = await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(result).toMatchObject({ success: false, error: 'complete failed' });
  });

  it('best-effort aborts the upload when the complete action errors', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: false, error: 'complete failed' });
    const file = makeFile(4);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(abortMock).toHaveBeenCalledWith({ s3Key: S3_KEY, uploadId: UPLOAD_ID });
  });

  it('falls back to a default message when complete fails without an error string', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: false });
    const file = makeFile(4);

    const result = await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(result).toMatchObject({ success: false, error: 'Failed to complete upload' });
  });

  it('still returns the complete failure when the abort cleanup call rejects', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: false, error: 'complete failed' });
    abortMock.mockRejectedValue(new Error('abort boom'));
    const file = makeFile(4);

    const result = await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(result).toMatchObject({ success: false, error: 'complete failed' });
  });
});

describe('uploadVideoMultipart — terminal progress', () => {
  it('reports a single terminal fraction of 1 when no progress events fire', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 4 } });
    const fractions: number[] = [];
    const file = makeFile(4);

    await runToCompletion(
      uploadVideoMultipart(file, {
        videoId: VIDEO_ID,
        onProgress: (fraction) => fractions.push(fraction),
      })
    );

    expect(fractions).toEqual([1]);
  });
});

describe('uploadVideoMultipart — initiate default message', () => {
  it('falls back to a default message when initiate fails without an error string', async () => {
    initiateMock.mockResolvedValue({ success: false });
    const file = makeFile(4);

    const result = await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(result).toEqual({ success: false, error: 'Failed to initiate upload' });
  });
});

describe('uploadVideoMultipart — abort races', () => {
  it('aborts when the signal fires while the initiate action is in flight', async () => {
    let resolveInitiate = (): void => {};
    initiateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInitiate = (): void =>
            resolve({
              success: true,
              data: { s3Key: S3_KEY, uploadId: UPLOAD_ID, partSize: 10, partCount: 1 },
            });
        })
    );
    const controller = new AbortController();
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, signal: controller.signal });
    controller.abort();
    resolveInitiate();
    const result = await promise;

    expect(result).toMatchObject({ success: false, aborted: true });
  });

  it('starts no XHR when the signal aborts while a part is being presigned', async () => {
    stubInitiate(10, 2);
    let releasePresign = (): void => {};
    presignMock.mockImplementation(
      ({ partNumbers }) =>
        new Promise((resolve) => {
          releasePresign = (): void =>
            resolve({
              success: true,
              data: partNumbers.map((partNumber) => ({
                partNumber,
                url: `https://s3.test/part-${partNumber}`,
              })),
            });
        })
    );
    const controller = new AbortController();
    const file = makeFile(20);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      signal: controller.signal,
      concurrency: 1,
    });
    await flush();
    controller.abort();
    releasePresign();
    await promise;

    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('uploadVideoMultipart — 403 re-presign failure', () => {
  it('re-fetches a fresh URL when the 403 re-presign itself fails', async () => {
    stubInitiate(10, 1);
    const okBatch = async ({ partNumbers }: { partNumbers: number[] }) => ({
      success: true as const,
      data: partNumbers.map((partNumber) => ({
        partNumber,
        url: `https://s3.test/part-${partNumber}`,
      })),
    });
    presignMock
      .mockImplementationOnce(okBatch)
      .mockImplementationOnce(async () => ({ success: false, error: 'represign boom' }))
      .mockImplementation(okBatch);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 3,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].respond403();
    const result = await runToCompletion(promise);

    expect(result.success).toBe(true);
  });
});

describe('uploadVideoMultipart — backoff timer', () => {
  it('retries a part after the exponential backoff timer elapses', async () => {
    vi.useFakeTimers();
    try {
      stubInitiate(10, 1);
      completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 4 } });
      const file = makeFile(4);

      const promise = uploadVideoMultipart(file, {
        videoId: VIDEO_ID,
        maxAttemptsPerPart: 2,
        baseRetryDelayMs: 1000,
      });
      await flush();
      FakeXhr.instances[0].failNetwork();
      await flush();
      await vi.advanceTimersByTimeAsync(1000);
      FakeXhr.instances[1].succeed();
      const result = await promise;

      expect(result.success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets an abort win a pending retry backoff timer', async () => {
    vi.useFakeTimers();
    try {
      stubInitiate(10, 1);
      const controller = new AbortController();
      const file = makeFile(4);

      const promise = uploadVideoMultipart(file, {
        videoId: VIDEO_ID,
        signal: controller.signal,
        maxAttemptsPerPart: 3,
        baseRetryDelayMs: 1000,
      });
      await flush();
      FakeXhr.instances[0].failNetwork();
      await flush();
      controller.abort();
      const result = await promise;

      expect(result).toMatchObject({ success: false, aborted: true });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('uploadVideoMultipart — settled part guard', () => {
  it('ignores a stray terminal event after a part has already settled', async () => {
    stubInitiate(10, 1);
    completeMock.mockResolvedValue({ success: true, data: { s3Key: S3_KEY, fileSize: 4 } });
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID });
    await flush();
    const xhr = FakeXhr.instances[0];
    xhr.succeed();
    xhr.abort();
    const result = await promise;

    expect(result).toEqual({ success: true, s3Key: S3_KEY, fileSize: 4 });
  });
});

/**
 * Complete action that stays pending until the returned `release` is called,
 * so a test can observe every progress fraction reported *before* completion.
 */
const deferCompleteUntilReleased = (fileSize: number): (() => void) => {
  let release = (): void => {};
  completeMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = (): void => resolve({ success: true, data: { s3Key: S3_KEY, fileSize } });
      })
  );
  return () => release();
};

describe('uploadVideoMultipart — pre-complete progress cap', () => {
  it('never reports a fraction of 1 before the complete action resolves', async () => {
    stubInitiate(10, 2);
    const fractions: number[] = [];
    const file = makeFile(20);
    const releaseComplete = deferCompleteUntilReleased(20);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      concurrency: 1,
      onProgress: (fraction) => fractions.push(fraction),
    });
    await flush();
    FakeXhr.instances[0].emitProgress(10);
    FakeXhr.instances[0].succeed();
    await flush();
    FakeXhr.instances[1].emitProgress(10);
    FakeXhr.instances[1].succeed();
    await flush();
    const maxBeforeComplete = Math.max(...fractions);
    releaseComplete();
    await promise;

    expect(maxBeforeComplete).toBeLessThan(1);
  });

  it('emits the single terminal 1 only after the complete action succeeds', async () => {
    stubInitiate(10, 2);
    const fractions: number[] = [];
    const file = makeFile(20);
    const releaseComplete = deferCompleteUntilReleased(20);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      concurrency: 1,
      onProgress: (fraction) => fractions.push(fraction),
    });
    await flush();
    FakeXhr.instances[0].emitProgress(10);
    FakeXhr.instances[0].succeed();
    await flush();
    FakeXhr.instances[1].emitProgress(10);
    FakeXhr.instances[1].succeed();
    await flush();
    const reportedBeforeComplete = fractions.length;
    releaseComplete();
    await promise;
    const afterComplete = fractions.slice(reportedBeforeComplete);

    expect(afterComplete).toEqual([1]);
  });

  it('keeps the pre-complete progress sequence monotonic and below 1', async () => {
    stubInitiate(10, 2);
    const fractions: number[] = [];
    const file = makeFile(20);
    const releaseComplete = deferCompleteUntilReleased(20);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      concurrency: 1,
      onProgress: (fraction) => fractions.push(fraction),
    });
    await flush();
    FakeXhr.instances[0].emitProgress(10);
    FakeXhr.instances[0].succeed();
    await flush();
    FakeXhr.instances[1].emitProgress(10);
    FakeXhr.instances[1].succeed();
    await flush();
    const before = [...fractions];
    releaseComplete();
    await promise;
    const nonDecreasing = before.every((value, index) => index === 0 || value >= before[index - 1]);

    expect(nonDecreasing && before.every((value) => value < 1)).toBe(true);
  });
});

describe('uploadVideoMultipart — action RPC rejection resilience', () => {
  it('returns a failure result when the initiate action rejects', async () => {
    initiateMock.mockRejectedValue(new Error('initiate rpc down'));
    const file = makeFile(4);

    const result = await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(result).toMatchObject({ success: false });
  });

  it('creates no XHRs when the initiate action rejects', async () => {
    initiateMock.mockRejectedValue(new Error('initiate rpc down'));
    const file = makeFile(4);

    await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('does not abort when the initiate action rejects', async () => {
    initiateMock.mockRejectedValue(new Error('initiate rpc down'));
    const file = makeFile(4);

    await uploadVideoMultipart(file, { videoId: VIDEO_ID });

    expect(abortMock).not.toHaveBeenCalled();
  });

  it('recovers when a presign batch rejects once then succeeds on retry', async () => {
    stubInitiate(10, 1);
    presignMock
      .mockRejectedValueOnce(new Error('presign rpc down'))
      .mockImplementation(async ({ partNumbers }) => ({
        success: true,
        data: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://s3.test/part-${partNumber}`,
        })),
      }));
    const file = makeFile(4);

    const result = await runToCompletion(
      uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 })
    );

    expect(result.success).toBe(true);
  });

  it('resolves to a failure when a presign batch rejects on every attempt', async () => {
    stubInitiate(10, 1);
    presignMock.mockRejectedValue(new Error('presign rpc down'));
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });

    await expect(promise).resolves.toMatchObject({ success: false });
  });

  it('best-effort aborts once when a presign batch rejects on every attempt', async () => {
    stubInitiate(10, 1);
    presignMock.mockRejectedValue(new Error('presign rpc down'));
    const file = makeFile(4);

    await uploadVideoMultipart(file, { videoId: VIDEO_ID, baseRetryDelayMs: 0 });

    expect(abortMock).toHaveBeenCalledTimes(1);
  });

  it('resolves to a failure when the complete action rejects', async () => {
    stubInitiate(10, 1);
    completeMock.mockRejectedValue(new Error('complete rpc down'));
    const file = makeFile(4);

    const result = await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(result).toMatchObject({ success: false });
  });

  it('best-effort aborts when the complete action rejects', async () => {
    stubInitiate(10, 1);
    completeMock.mockRejectedValue(new Error('complete rpc down'));
    const file = makeFile(4);

    await runToCompletion(uploadVideoMultipart(file, { videoId: VIDEO_ID }));

    expect(abortMock).toHaveBeenCalledWith({ s3Key: S3_KEY, uploadId: UPLOAD_ID });
  });
});

describe('uploadVideoMultipart — 403 re-presign RPC rejection', () => {
  const okBatch = async ({ partNumbers }: { partNumbers: number[] }) => ({
    success: true as const,
    data: partNumbers.map((partNumber) => ({
      partNumber,
      url: `https://s3.test/part-${partNumber}`,
    })),
  });

  it('does not throw when the re-presign RPC rejects; routes it as a failed attempt', async () => {
    stubInitiate(10, 1);
    presignMock
      .mockImplementationOnce(okBatch)
      .mockRejectedValueOnce(new Error('represign rpc down'))
      .mockImplementation(okBatch);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 3,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].respond403();
    const result = await runToCompletion(promise);

    expect(result.success).toBe(true);
  });

  it('retries the part via the normal backoff path after a rejected re-presign RPC', async () => {
    stubInitiate(10, 1);
    presignMock
      .mockImplementationOnce(okBatch)
      .mockRejectedValueOnce(new Error('represign rpc down'))
      .mockImplementation(okBatch);
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 3,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].respond403();
    await runToCompletion(promise);

    expect(FakeXhr.instances.length).toBeGreaterThan(1);
  });

  it('resolves to a failure result when the re-presign RPC rejects persistently', async () => {
    stubInitiate(10, 1);
    presignMock.mockImplementationOnce(okBatch).mockRejectedValue(new Error('represign rpc down'));
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].respond403();
    const result = await runToCompletion(promise);

    expect(result).toMatchObject({ success: false });
  });

  it('calls the abort action when the re-presign RPC rejects persistently', async () => {
    stubInitiate(10, 1);
    presignMock.mockImplementationOnce(okBatch).mockRejectedValue(new Error('represign rpc down'));
    const file = makeFile(4);

    const promise = uploadVideoMultipart(file, {
      videoId: VIDEO_ID,
      maxAttemptsPerPart: 2,
      baseRetryDelayMs: 0,
    });
    await flush();
    FakeXhr.instances[0].respond403();
    await runToCompletion(promise);

    expect(abortMock).toHaveBeenCalledTimes(1);
  });
});
