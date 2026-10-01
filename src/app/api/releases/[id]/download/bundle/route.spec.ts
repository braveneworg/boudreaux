/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PassThrough, Readable } from 'node:stream';

import { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { downloadGate } from '@/lib/services/download-gate/download-gate';
import type { GateFormatRecord } from '@/lib/services/download-gate/download-gate';
import type { Deliverable, Grant, Outcome } from '@/lib/services/download-gate/types';
import { ReleaseService } from '@/lib/services/release-service';
import { resolveDownloadSubject } from '@/lib/utils/resolve-download-subject';

import { GET } from './route';

// The route is an HTTP adapter over the download gate (ADR-0018): the gate is
// mocked, the ZIP production (archiver, S3, multipart upload) is driven with
// the same stubs as before so every delivery path still runs end to end.

vi.mock('server-only', () => ({}));

const { downloadsLoggerMock } = vi.hoisted(() => ({
  downloadsLoggerMock: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/utils/logger', () => ({
  loggers: { downloads: downloadsLoggerMock, media: downloadsLoggerMock },
}));
vi.mock('@/lib/decorators/with-rate-limit', () => ({ extractClientIp: () => '127.0.0.1' }));
const mockRateLimitCheck = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...args) },
  DOWNLOAD_LIMIT: 10,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/services/download-gate/download-gate', () => ({
  downloadGate: { check: vi.fn(), download: vi.fn() },
}));
vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: { findPublishedTitleById: vi.fn() },
}));
vi.mock('@/lib/utils/resolve-download-subject', () => ({ resolveDownloadSubject: vi.fn() }));

const mockS3Send = vi.fn();
const mockGeneratePresignedDownloadUrl = vi
  .fn()
  .mockResolvedValue('https://s3.example.com/presigned-bundle-url');
const mockVerifyS3ObjectExists = vi.fn().mockResolvedValue(false);
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => ({ send: mockS3Send }),
  getS3BucketName: () => 'test-bucket',
  generatePresignedDownloadUrl: (...args: unknown[]) => mockGeneratePresignedDownloadUrl(...args),
  verifyS3ObjectExists: (...args: unknown[]) => mockVerifyS3ObjectExists(...args),
}));
vi.mock('@/lib/utils/content-disposition', () => ({
  buildContentDisposition: (fileName: string) => `attachment; filename="${fileName}"`,
}));

const mockUploadDone = vi.fn().mockResolvedValue(undefined);
const mockUploadAbort = vi.fn();
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(function (opts?: { params?: { Body?: unknown } }) {
    const body = opts?.params?.Body as { on?: (event: string, cb: () => void) => void } | undefined;
    if (body && typeof body.on === 'function') {
      body.on('error', () => {});
    }
    return { done: mockUploadDone, abort: mockUploadAbort };
  }),
}));

// Mock archiver to avoid actual ZIP creation in tests
let mockArchiverPassThrough: PassThrough;
const mockAppend = vi.fn().mockImplementation(() => {
  queueMicrotask(() => mockArchiverPassThrough.emit('entry'));
});
const mockFinalize = vi.fn();
const mockArchiveAbort = vi.fn();
vi.mock('archiver', () => ({
  default: () => {
    const passThrough = new PassThrough();
    mockArchiverPassThrough = passThrough;
    (passThrough as PassThrough & { append: typeof mockAppend }).append = mockAppend;
    (passThrough as PassThrough & { finalize: (...args: unknown[]) => void }).finalize = (
      ...args: unknown[]
    ) => {
      mockFinalize(...args);
      passThrough.end();
    };
    (passThrough as PassThrough & { abort: (...args: unknown[]) => void }).abort = (
      ...args: unknown[]
    ) => {
      mockArchiveAbort(...args);
    };
    return passThrough;
  },
}));

const RELEASE_ID = '507f1f77bcf86cd799439011';
const USER = { kind: 'user', userId: 'user-123' } as const;

const makeRequest = (query = 'formats=FLAC,WAV', id = RELEASE_ID): NextRequest =>
  new NextRequest(`http://localhost:3000/api/releases/${id}/download/bundle?${query}`, {
    headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test-agent' },
  });
const makeParams = (id = RELEASE_ID) => ({ params: Promise.resolve({ id }) });

const readSSEEvents = async (
  response: Response
): Promise<Array<{ event: string; data: Record<string, unknown> }>> => {
  const text = await response.text();
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (data) events.push({ event, data: JSON.parse(data) as Record<string, unknown> });
  }
  return events;
};

const flacRecord = {
  id: 'format-flac',
  formatType: 'FLAC',
  s3Key: null,
  fileName: null,
  deletedAt: null,
  files: [
    { s3Key: 'releases/r1/FLAC/01.flac', fileName: '01 - Intro.flac' },
    { s3Key: 'releases/r1/FLAC/02.flac', fileName: '02 - Main.flac' },
  ],
} as unknown as GateFormatRecord;
const wavRecord = {
  id: 'format-wav',
  formatType: 'WAV',
  s3Key: 'releases/r1/WAV/album.wav',
  fileName: 'album.wav',
  deletedAt: null,
  files: [],
} as unknown as GateFormatRecord;

const purchasedGrant: Grant = {
  kind: 'grant',
  mode: 'purchased',
  formats: [
    { formatType: 'FLAC', withdrawn: false },
    { formatType: 'WAV', withdrawn: false },
  ],
  charge: { lifetime: false, freeThrottle: false, purchaseThrottle: true },
};

/** The gate grants: it runs the route's producer against the records and returns its outcome. */
const gateGrants = (records: GateFormatRecord[] = [flacRecord, wavRecord]) =>
  vi.mocked(downloadGate.download).mockImplementation(async (request, produce) => {
    const granted = records.filter(({ formatType }) =>
      (request.formats as string[]).includes(formatType)
    );
    return { ok: true, grant: purchasedGrant, deliverable: await produce(purchasedGrant, granted) };
  });

const gateRefuses = (outcome: Extract<Outcome, { ok: false }>) =>
  vi.mocked(downloadGate.download).mockResolvedValue(outcome);

describe('GET /api/releases/[id]/download/bundle', () => {
  beforeEach(() => {
    vi.stubEnv('E2E_MODE', '');
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-123' } } as never);
    vi.mocked(resolveDownloadSubject).mockResolvedValue(USER);
    vi.mocked(ReleaseService.findPublishedTitleById).mockResolvedValue({
      id: RELEASE_ID,
      title: 'Test Album',
    });
    vi.mocked(downloadGate.check).mockResolvedValue(purchasedGrant);
    gateGrants();
    mockVerifyS3ObjectExists.mockResolvedValue(false);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockUploadDone.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Drain the archiver mock's microtask chains so a streaming test never
    // leaks appends into the next test after clearMocks.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });

  describe('request validation', () => {
    it('returns 429 when the rate limiter rejects (outside E2E mode)', async () => {
      mockRateLimitCheck.mockRejectedValueOnce(new Error('limited'));

      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(429);
      expect(downloadGate.download).not.toHaveBeenCalled();
    });

    it('skips the rate limiter in E2E mode', async () => {
      vi.stubEnv('E2E_MODE', 'true');

      await GET(makeRequest('formats=FLAC'), makeParams());

      expect(mockRateLimitCheck).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid release id', async () => {
      const response = await GET(makeRequest('formats=FLAC', 'nope'), makeParams('nope'));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: 'INVALID_REQUEST' });
    });

    it('returns 400 INVALID_FORMATS for a missing or unknown format', async () => {
      expect((await GET(makeRequest(''), makeParams())).status).toBe(400);
      const response = await GET(makeRequest('formats=MP3'), makeParams());
      expect(await response.json()).toMatchObject({ error: 'INVALID_FORMATS' });
    });

    it('ignores a legacy mode parameter — the gate decides the mode', async () => {
      const response = await GET(makeRequest('formats=FLAC&mode=free'), makeParams());

      expect(response.status).toBe(302);
      const [request] = vi.mocked(downloadGate.download).mock.calls[0];
      expect(request).toEqual({ subject: USER, releaseId: RELEASE_ID, formats: ['FLAC'] });
    });

    it('returns 404 when the release is not listed, before asking the gate', async () => {
      vi.mocked(ReleaseService.findPublishedTitleById).mockResolvedValue(null);

      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(404);
      expect(downloadGate.download).not.toHaveBeenCalled();
    });
  });

  describe('subject', () => {
    it('resolves the subject from the session and hands it to the gate with the audit context', async () => {
      await GET(makeRequest(), makeParams());

      expect(vi.mocked(resolveDownloadSubject).mock.calls).toEqual([
        [expect.any(NextRequest), 'user-123'],
      ]);
      const [request, , audit] = vi.mocked(downloadGate.download).mock.calls[0];
      expect(request).toEqual({ subject: USER, releaseId: RELEASE_ID, formats: ['FLAC', 'WAV'] });
      expect(audit).toEqual({ ipAddress: '127.0.0.1', userAgent: 'test-agent' });
    });

    it('lets a guest through to the gate — there is no auth wall, the gate decides', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
      const guest = { kind: 'guest', visitorId: 'v-1' } as const;
      vi.mocked(resolveDownloadSubject).mockResolvedValue(guest);

      await GET(makeRequest('formats=MP3_320KBPS,AAC'), makeParams());

      expect(vi.mocked(resolveDownloadSubject).mock.calls).toEqual([
        [expect.any(NextRequest), null],
      ]);
      expect(vi.mocked(downloadGate.download).mock.calls[0]?.[0]).toMatchObject({ subject: guest });
    });
  });

  describe('preflight', () => {
    it('answers 200 on a grant without locking, charging, or touching S3', async () => {
      const response = await GET(makeRequest('formats=FLAC&respond=preflight'), makeParams());

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(vi.mocked(downloadGate.check).mock.calls).toEqual([
        [{ subject: USER, releaseId: RELEASE_ID, formats: ['FLAC'] }],
      ]);
      expect(downloadGate.download).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it.each([
      [
        { kind: 'denial', reason: 'PURCHASE_REQUIRED', formats: ['FLAC'] },
        403,
        'PURCHASE_REQUIRED',
      ],
      [
        { kind: 'denial', reason: 'THROTTLED', resetsAt: new Date('2026-10-02T00:00:00Z') },
        403,
        'CAP_REACHED',
      ],
      [{ kind: 'denial', reason: 'DOWNLOAD_LIMIT', resetInHours: 3 }, 403, 'DOWNLOAD_LIMIT'],
      [{ kind: 'not-found' }, 404, 'NOT_FOUND'],
    ] as const)('maps a refused preflight (%o) to %i', async (result, status, error) => {
      vi.mocked(downloadGate.check).mockResolvedValue(result as never);

      const response = await GET(makeRequest('formats=FLAC&respond=preflight'), makeParams());

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ success: false, error });
    });
  });

  describe('refusals on the download paths', () => {
    it.each([
      [{ ok: false, denial: null, reason: 'LOCK_HELD' }, 409, 'LOCK_HELD'],
      [{ ok: false, denial: null, reason: 'NOT_FOUND' }, 404, 'NOT_FOUND'],
      [{ ok: false, denial: { kind: 'denial', reason: 'LIFETIME_CAP' } }, 403, 'QUOTA_EXCEEDED'],
      [
        { ok: false, denial: { kind: 'denial', reason: 'DELETED', formats: ['WAV'] } },
        410,
        'DELETED',
      ],
    ] as const)('maps %o to %i on the 302 path', async (outcome, status, error) => {
      gateRefuses(outcome as never);

      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ success: false, error });
    });

    it('emits the refusal as an SSE error event, then complete', async () => {
      gateRefuses({
        ok: false,
        denial: { kind: 'denial', reason: 'THROTTLED', resetsAt: new Date() },
      });

      const events = await readSSEEvents(
        await GET(makeRequest('formats=AAC&respond=json'), makeParams())
      );

      expect(events.map(({ event }) => event)).toEqual(['error', 'complete']);
      expect(events[0].data).toMatchObject({ errorCode: 'CAP_REACHED' });
    });
  });

  describe('302 path (default)', () => {
    it('builds the ZIP from the granted records, uploads it, and redirects to the presigned URL', async () => {
      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://s3.example.com/presigned-bundle-url');
      // Two FLAC tracks + one legacy WAV file, under format subfolders.
      expect(mockAppend).toHaveBeenCalledTimes(3);
      expect(mockFinalize).toHaveBeenCalledTimes(1);
      expect(mockGeneratePresignedDownloadUrl.mock.calls[0]?.slice(0, 2)).toEqual([
        `tmp/bundles/cache/${RELEASE_ID}/FLAC-WAV.zip`,
        'Test Album.zip',
      ]);
    });

    it('serves a cache hit without building: presign, redirect', async () => {
      mockVerifyS3ObjectExists.mockResolvedValue(true);

      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(302);
      expect(mockAppend).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('archives only the formats the gate granted, flat when there is one', async () => {
      gateGrants([wavRecord]);

      await GET(makeRequest('formats=WAV,FLAC'), makeParams());

      expect(mockAppend).toHaveBeenCalledTimes(1);
      expect(mockAppend.mock.calls[0]?.[1]).toEqual({ name: 'album.wav' });
    });

    it('answers 500 STREAM_FAILED when the build fails — the gate saw the throw and charged nothing', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 fetch failed'));

      const response = await GET(makeRequest(), makeParams());

      expect(response.status).toBe(500);
      expect(mockArchiveAbort).toHaveBeenCalled();
      expect(mockUploadAbort).toHaveBeenCalled();
    });
  });

  describe('SSE path (respond=json)', () => {
    it('streams progress per format, then ready with the presigned URL once the gate has charged, then complete', async () => {
      const events = await readSSEEvents(
        await GET(makeRequest('formats=FLAC,WAV&respond=json'), makeParams())
      );

      expect(events.map(({ event }) => event)).toEqual([
        'progress',
        'progress',
        'progress',
        'progress',
        'progress',
        'ready',
        'complete',
      ]);
      expect(
        events.filter(({ event }) => event === 'progress').map(({ data }) => data.status)
      ).toEqual(['zipping', 'zipping', 'done', 'done', 'uploading']);
      expect(events[5].data).toEqual({
        downloadUrl: 'https://s3.example.com/presigned-bundle-url',
        fileName: 'Test Album.zip',
      });
    });

    it('replays synthetic progress on a cache hit and never builds', async () => {
      mockVerifyS3ObjectExists.mockResolvedValue(true);

      const events = await readSSEEvents(
        await GET(makeRequest('formats=FLAC&respond=json'), makeParams())
      );

      expect(events.map(({ event }) => event)).toEqual([
        'progress',
        'progress',
        'progress',
        'ready',
        'complete',
      ]);
      expect(mockAppend).not.toHaveBeenCalled();
    });

    it('sends the content-type and no-store headers of an event stream', async () => {
      const response = await GET(makeRequest('formats=FLAC&respond=json'), makeParams());

      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('reports a failed build as an error event and aborts the upload', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 fetch failed'));

      const events = await readSSEEvents(
        await GET(makeRequest('formats=FLAC&respond=json'), makeParams())
      );

      expect(events.map(({ event }) => event)).toContain('error');
      expect(events.at(-1)?.event).toBe('complete');
      expect(mockUploadAbort).toHaveBeenCalled();
    });
  });

  describe('stream path (respond=stream)', () => {
    it('streams the ZIP bytes with an attachment disposition', async () => {
      const response = await GET(makeRequest('formats=WAV&respond=stream'), makeParams());

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="Test Album.zip"'
      );
      await response.arrayBuffer();
      expect(mockAppend).toHaveBeenCalledTimes(1);
    });

    it('serves a cache hit as a 302 even when stream was asked for', async () => {
      mockVerifyS3ObjectExists.mockResolvedValue(true);

      const response = await GET(makeRequest('formats=WAV&respond=stream'), makeParams());

      expect(response.status).toBe(302);
    });

    it('answers 500 STREAM_FAILED when the first object body is missing, so nothing is charged', async () => {
      mockS3Send.mockResolvedValue({ Body: null });

      const response = await GET(makeRequest('formats=WAV&respond=stream'), makeParams());

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: 'STREAM_FAILED' });
    });
  });

  it('returns 500 INTERNAL_ERROR when the gate itself throws', async () => {
    vi.mocked(downloadGate.download).mockRejectedValue(new Error('boom'));

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'INTERNAL_ERROR' });
  });
});

/** Type-level check that the gate's url deliverable is what the SSE path reads. */
const _deliverableShape: Deliverable = { kind: 'url', downloadUrl: '', fileName: '' };
void _deliverableShape;
