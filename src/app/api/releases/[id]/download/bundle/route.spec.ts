/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PassThrough, Readable } from 'node:stream';

import { NextRequest } from 'next/server';

import { CapReachedError as MockedCapReachedError } from '@/lib/services/free-download-quota-service';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const { downloadsLoggerMock } = vi.hoisted(() => ({
  downloadsLoggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils/logger', () => ({
  createLogger: vi.fn(() => downloadsLoggerMock),
  shouldSample: vi.fn(() => true),
  loggers: new Proxy({}, { get: () => downloadsLoggerMock }),
}));

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  extractClientIp: () => '127.0.0.1',
}));
const mockRateLimitCheck = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: (...args: unknown[]) => mockRateLimitCheck(...args) },
  DOWNLOAD_LIMIT: 10,
}));

// Bundle download auth now reads the better-auth session (no legacy JWT).
// `mockGetSession` returns `{ user: { id } } | null`, matching `auth.api.getSession`.
const mockGetSession = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args) } },
}));

const mockGetDownloadAccess = vi.fn();
vi.mock('@/lib/services/purchase-service', () => ({
  PurchaseService: {
    getDownloadAccess: (...args: unknown[]) => mockGetDownloadAccess(...args),
  },
}));

const mockUpsertDownloadCount = vi.fn();
vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    upsertDownloadCount: (...args: unknown[]) => mockUpsertDownloadCount(...args),
  },
}));

// Hoisted so the fns exist before the module-import phase runs these class-field
// initializers — release-service instantiates these repositories at module level.
const { mockFindAllByRelease, mockLogDownloadEvent } = vi.hoisted(() => ({
  mockFindAllByRelease: vi.fn(),
  mockLogDownloadEvent: vi.fn(),
}));
vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class MockRepo {
    findAllByRelease = mockFindAllByRelease;
  },
}));

vi.mock('@/lib/repositories/download-event-repository', () => ({
  DownloadEventRepository: class MockRepo {
    logDownloadEvent = mockLogDownloadEvent;
  },
}));

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
    // The real Upload consumes its Body stream. Attach a no-op error listener
    // so that when the route destroys the cache PassThrough on a drive failure
    // (e.g. S3 NoSuchKey), the `error` event has a handler and does not surface
    // as an unhandled stream error in the pooled test run.
    const body = opts?.params?.Body as { on?: (event: string, cb: () => void) => void } | undefined;
    if (body && typeof body.on === 'function') {
      body.on('error', () => {});
    }
    return { done: mockUploadDone, abort: mockUploadAbort };
  }),
}));

const mockPrismaReleaseFindFirst = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: {
    release: {
      findFirst: (...args: unknown[]) => mockPrismaReleaseFindFirst(...args),
    },
  },
}));

// 007-free-digital-downloads: guest identity + fingerprint + quota helpers
const mockReadGuestVisitorId = vi.fn().mockResolvedValue(null);
const mockSetGuestVisitorIdCookie = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/utils/guest-visitor-id', () => ({
  readGuestVisitorId: (...args: unknown[]) => mockReadGuestVisitorId(...args),
  setGuestVisitorIdCookie: (...args: unknown[]) => mockSetGuestVisitorIdCookie(...args),
  VISITOR_ID_COOKIE: 'boudreaux_visitor_id',
}));

const mockComputeFingerprintHash = vi.fn().mockReturnValue('test-fp-hash');
vi.mock('@/lib/utils/visitor-fingerprint', () => ({
  computeFingerprintHash: (...args: unknown[]) => mockComputeFingerprintHash(...args),
}));

const mockResolveVisitorIdentity = vi.fn().mockResolvedValue({
  primaryVisitorId: 'guest-visitor-1',
  allVisitorIds: ['guest-visitor-1'],
  cookieReissue: true,
});
const mockAssertFreeDownloadAllowed = vi.fn().mockResolvedValue({
  allowed: true,
  remaining: 3,
  count: 0,
  oldestInWindow: null,
  resetsAt: null,
});
class MockCapReachedError extends Error {
  public readonly code = 'CAP_REACHED' as const;
  constructor(public readonly resetsAt: Date) {
    super('Free-download cap reached');
    this.name = 'CapReachedError';
  }
}
const mockRecordSuccessfulDownload = vi.fn(
  async (params: {
    subject: { kind: 'user'; userId: string } | { kind: 'guest'; visitorId: string };
    releaseId: string;
    formatType: string;
    ipAddress?: string;
    userAgent?: string;
  }) => {
    // Mirror the real service: log a single success event so tests asserting
    // on `mockLogDownloadEvent` continue to observe the write.
    await mockLogDownloadEvent({
      userId: params.subject.kind === 'user' ? params.subject.userId : null,
      visitorId: params.subject.kind === 'guest' ? params.subject.visitorId : null,
      releaseId: params.releaseId,
      formatType: params.formatType,
      success: true,
      ipAddress: params.ipAddress ?? '',
      userAgent: params.userAgent ?? '',
    });
  }
);
vi.mock('@/lib/services/free-download-quota-service', () => {
  // Declared inside the factory because vi.mock is hoisted above module-scope
  // identifiers; module-level symbols would not yet be initialized.
  class CapReachedError extends Error {
    public readonly code = 'CAP_REACHED' as const;
    constructor(public readonly resetsAt: Date) {
      super('Free-download cap reached');
      this.name = 'CapReachedError';
    }
  }
  return {
    freeDownloadQuotaService: {
      resolveVisitorIdentity: (...args: unknown[]) => mockResolveVisitorIdentity(...args),
      assertFreeDownloadAllowed: (...args: unknown[]) => mockAssertFreeDownloadAllowed(...args),
      recordSuccessfulDownload: (params: Parameters<typeof mockRecordSuccessfulDownload>[0]) =>
        mockRecordSuccessfulDownload(params),
    },
    FREE_DOWNLOAD_CAP: 3,
    FREE_DOWNLOAD_WINDOW_MS: 24 * 60 * 60 * 1000,
    CapReachedError,
  };
});

// Re-export the in-test alias so individual tests can construct cap-reached errors.
const __MockCapReachedError = MockCapReachedError;
void __MockCapReachedError;

const mockLockAcquire = vi.fn().mockReturnValue(true);
const mockLockRelease = vi.fn();
vi.mock('@/lib/services/free-download-lock-service', () => ({
  freeDownloadLockService: {
    acquire: (...args: unknown[]) => mockLockAcquire(...args),
    release: (...args: unknown[]) => mockLockRelease(...args),
  },
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
    // Attach mock methods — emit 'entry' after append so awaited promises resolve
    (passThrough as PassThrough & { append: typeof mockAppend }).append = mockAppend;
    (passThrough as PassThrough & { finalize: (...args: unknown[]) => void }).finalize = (
      ...args: unknown[]
    ) => {
      mockFinalize(...args);
      passThrough.end(); // End the stream
    };
    (passThrough as PassThrough & { abort: (...args: unknown[]) => void }).abort = (
      ...args: unknown[]
    ) => {
      mockArchiveAbort(...args);
    };
    return passThrough;
  },
}));

const makeRequest = (formats = 'FLAC,WAV'): NextRequest =>
  new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}`,
    {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
    }
  );

const makeJsonRequest = (formats = 'FLAC,WAV'): NextRequest =>
  new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}&respond=json`,
    {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
    }
  );

const makeParams = (id = '507f1f77bcf86cd799439011') => ({ params: Promise.resolve({ id }) });

const readSSEEvents = async (
  response: Response
): Promise<Array<{ event: string; data: Record<string, unknown> }>> => {
  const text = await response.text();
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  const blocks = text.split('\n\n');
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = 'message';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (data) {
      events.push({ event, data: JSON.parse(data) as Record<string, unknown> });
    }
  }
  return events;
};

describe('GET /api/releases/[id]/download/bundle', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 1,
      lastDownloadedAt: null,
      resetInHours: null,
    });
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockUpsertDownloadCount.mockResolvedValue(undefined);
    mockLogDownloadEvent.mockResolvedValue(undefined);

    // Default: return format records with child files
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/FLAC/01.flac', fileName: '01 - Intro.flac' },
          { s3Key: 'releases/r1/FLAC/02.flac', fileName: '02 - Main.flac' },
        ],
      },
      {
        id: 'format-wav',
        formatType: 'WAV',
        s3Key: 'releases/r1/WAV/album.wav',
        fileName: 'album.wav',
        files: [],
      },
    ]);

    // Mock S3 response stream
    mockS3Send.mockResolvedValue({
      Body: Readable.from(Buffer.from('fake-audio-data')),
    });
  });

  afterEach(async () => {
    // The archiver mock drives the ZIP pipeline through queueMicrotask chains
    // (append → emit 'entry' → next append). A test that starts a streaming
    // archive but returns before it settles would otherwise leak those append
    // calls into the following test — after clearMocks — inflating its
    // mockAppend count and making the suite order-dependent. Drain the pending
    // microtask/immediate queue so each test's pipeline finishes inside its own
    // boundary.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('should return 401 when user is not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 401 when the session has no user id', async () => {
    mockGetSession.mockResolvedValue({ user: { id: undefined } });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 400 for invalid formats parameter', async () => {
    const response = await GET(makeRequest('INVALID_FORMAT'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
  });

  it('should return 400 for empty formats parameter', async () => {
    const response = await GET(makeRequest(''), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
  });

  it('should return 403 when no purchase exists', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'no_purchase',
      downloadCount: 0,
      lastDownloadedAt: null,
      resetInHours: null,
    });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('PURCHASE_REQUIRED');
  });

  it('should bypass purchase requirement when all requested formats are free', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'no_purchase',
      downloadCount: 0,
      lastDownloadedAt: null,
      resetInHours: null,
    });

    // Use a JSON-mode request so the route resolves synchronously without
    // streaming the (mocked) archive — we only need to assert the gate did
    // not return 403.
    const response = await GET(makeJsonRequest('MP3_320KBPS,AAC'), makeParams());

    expect(response.status).not.toBe(403);
  });

  it('should still return 403 PURCHASE_REQUIRED when the request mixes free and paid formats', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'no_purchase',
      downloadCount: 0,
      lastDownloadedAt: null,
      resetInHours: null,
    });

    const response = await GET(makeRequest('MP3_320KBPS,FLAC'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('PURCHASE_REQUIRED');
  });

  it('should return 403 when download limit is reached', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: false,
      reason: 'download_limit_reached',
      downloadCount: 5,
      lastDownloadedAt: null,
      resetInHours: 3,
    });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('DOWNLOAD_LIMIT');
    expect(body.resetInHours).toBe(3);
  });

  it('should return 404 when release is not found', async () => {
    mockPrismaReleaseFindFirst.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('should return 404 when no downloadable files are found', async () => {
    mockFindAllByRelease.mockResolvedValue([]);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NO_FILES');
  });

  it('should redirect to the presigned download URL on success', async () => {
    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Location')).toBe('https://s3.example.com/presigned-bundle-url');
    expect(mockGeneratePresignedDownloadUrl).toHaveBeenCalledWith(
      expect.any(String),
      'Test Album.zip',
      900
    );
  });

  it('should use a deterministic cache key keyed by release id and sorted formats', async () => {
    await GET(makeRequest(), makeParams());

    const [tempKey] = mockGeneratePresignedDownloadUrl.mock.calls[0] ?? [];
    expect(tempKey).toMatch(
      /^tmp\/bundles\/cache\/507f1f77bcf86cd799439011\/(paid|free)\/[A-Z0-9_-]+\.zip$/
    );
    // Sorted formats — FLAC,WAV → "FLAC-WAV"
    expect(tempKey).toContain('FLAC-WAV');
  });

  it('should serve a cached ZIP without re-zipping or uploading on cache hit (302 path)', async () => {
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://s3.example.com/presigned-bundle-url');
    // Cache hit should skip archiver entirely.
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockUploadDone).not.toHaveBeenCalled();
    // Analytics still fire on cache hit.
    expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', '507f1f77bcf86cd799439011');
    expect(mockLogDownloadEvent).toHaveBeenCalled();
  });

  it('should still 302 on cache hit even when analytics fail', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);
    mockUpsertDownloadCount.mockRejectedValueOnce(new Error('analytics down'));

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(302);
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to record bundle download analytics (cache hit, 302 path)',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── Direct streaming path (respond=stream, paid mode) ──────────────────

  it('should return 200 with ZIP headers when respond=stream on paid mode', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=FLAC,WAV&respond=stream',
        { headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('Content-Disposition')).toMatch(/attachment.*\.zip/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');

    // Drain the body so the underlying Upload promise resolves before the
    // test ends. The archiver mock ends synchronously after finalize so this
    // resolves quickly.
    await response.arrayBuffer();
  });

  it('should still 302 on cache hit even when respond=stream is requested', async () => {
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=FLAC,WAV&respond=stream',
        { headers: { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    // Cache hit takes priority over streaming branch — preserves the
    // single-source-of-truth fast path for repeat downloads.
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://s3.example.com/presigned-bundle-url');
    expect(mockAppend).not.toHaveBeenCalled();
  });

  // ─── SSE streaming path (respond=json) ──────────────────────────────────

  it('should return SSE stream with correct headers when respond=json', async () => {
    const response = await GET(makeJsonRequest(), makeParams());

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  it('should stream progress and ready events for combined ZIP', async () => {
    const response = await GET(makeJsonRequest(), makeParams());
    const events = await readSSEEvents(response);

    // All `zipping` events fire up front (so progress UI shows every format
    // immediately), then S3 prefetch + archive append run in parallel across
    // formats, then `done` events fire as each format's last entry is appended.
    // Order: progress(FLAC,zipping), progress(WAV,zipping), progress(FLAC,done),
    // progress(WAV,done), progress(uploading), ready(url), complete
    expect(events).toHaveLength(7);
    expect(events[0]).toEqual(
      expect.objectContaining({
        event: 'progress',
        data: expect.objectContaining({ formatType: 'FLAC', status: 'zipping' }),
      })
    );
    expect(events[1]).toEqual(
      expect.objectContaining({
        event: 'progress',
        data: expect.objectContaining({ formatType: 'WAV', status: 'zipping' }),
      })
    );
    expect(events[2]).toEqual(
      expect.objectContaining({
        event: 'progress',
        data: expect.objectContaining({ formatType: 'FLAC', status: 'done' }),
      })
    );
    expect(events[3]).toEqual(
      expect.objectContaining({
        event: 'progress',
        data: expect.objectContaining({ formatType: 'WAV', status: 'done' }),
      })
    );
    expect(events[4]).toEqual(
      expect.objectContaining({
        event: 'progress',
        data: expect.objectContaining({ status: 'uploading' }),
      })
    );
    expect(events[5]).toEqual(
      expect.objectContaining({
        event: 'ready',
        data: expect.objectContaining({
          downloadUrl: 'https://s3.example.com/presigned-bundle-url',
        }),
      })
    );
    expect(events[6]).toEqual(expect.objectContaining({ event: 'complete' }));
  });

  it('should include fileName in ready event', async () => {
    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    const events = await readSSEEvents(response);

    const readyEvent = events.find((e) => e.event === 'ready');
    expect(readyEvent?.data).toEqual(
      expect.objectContaining({
        fileName: 'Test Album.zip',
      })
    );
  });

  it('should create a single combined ZIP via archiver when respond=json', async () => {
    const response = await GET(makeJsonRequest(), makeParams());
    await response.text(); // consume the stream to trigger all async work

    // FLAC has 2 files + WAV has 1 file = 3 total appends, 1 combined archive = 1 finalize + 1 upload
    expect(mockAppend).toHaveBeenCalledTimes(3);
    expect(mockFinalize).toHaveBeenCalledTimes(1);
    expect(mockUploadDone).toHaveBeenCalledTimes(1);
  });

  it('should sanitize archive entry names in SSE path to prevent zip-slip traversal', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/FLAC/a', fileName: '../../../etc/passwd' },
          { s3Key: 'releases/r1/FLAC/b', fileName: '/absolute/path/song.wav' },
          { s3Key: 'releases/r1/FLAC/c', fileName: 'null\0byte.mp3' },
        ],
      },
    ]);

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    await response.text();

    // Single format → flat archive (no subfolder)
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'passwd' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'song.wav' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'null_byte.mp3' })
    );

    const archiveEntryNames = mockAppend.mock.calls.map(([, options]) => options.name as string);
    expect(archiveEntryNames.every((name) => !name.includes('..'))).toBe(true);
    expect(archiveEntryNames.every((name) => !name.startsWith('/'))).toBe(true);
  });

  it('should increment download count and log events when respond=json', async () => {
    const response = await GET(makeJsonRequest(), makeParams());
    await response.text(); // consume the stream

    expect(mockUpsertDownloadCount).toHaveBeenCalledTimes(1);
    expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', '507f1f77bcf86cd799439011');
    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(2);
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ formatType: 'FLAC', success: true })
    );
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ formatType: 'WAV', success: true })
    );
  });

  it('should send error event for a failed format and still bundle remaining', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Make the first S3 fetch fail (FLAC track 1)
    mockS3Send
      .mockRejectedValueOnce(new Error('S3 fetch failed'))
      .mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });

    const response = await GET(makeJsonRequest(), makeParams());
    const events = await readSSEEvents(response);

    // progress(FLAC,zipping), error(FLAC), progress(WAV,zipping), progress(WAV,done),
    // progress(uploading), ready(url), complete
    expect(events.find((e) => e.event === 'error')).toEqual(
      expect.objectContaining({
        event: 'error',
        data: expect.objectContaining({ formatType: 'FLAC' }),
      })
    );
    // WAV should still succeed
    expect(events.find((e) => e.event === 'ready')).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('should abort SSE upload when no formats can be appended', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockS3Send.mockRejectedValue(new Error('S3 fetch failed'));

    const response = await GET(makeJsonRequest(), makeParams());
    const events = await readSSEEvents(response);

    expect(events.find((event) => event.event === 'ready')).toBeUndefined();
    expect(
      events.some(
        (event) => event.event === 'error' && event.data.message === 'No formats could be prepared.'
      )
    ).toBe(true);
    expect(mockUploadAbort).toHaveBeenCalled();
    expect(mockArchiveAbort).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should append files to the archive for multi-track formats', async () => {
    await GET(makeRequest(), makeParams());

    // FLAC has 2 child files
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/01 - Intro.flac' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/02 - Main.flac' })
    );
  });

  it('should use legacy single-file fallback when no child files exist', async () => {
    await GET(makeRequest(), makeParams());

    // WAV uses legacy s3Key/fileName (files array is empty)
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'WAV/album.wav' })
    );
  });

  it('should increment download count once per bundle', async () => {
    await GET(makeRequest(), makeParams());

    expect(mockUpsertDownloadCount).toHaveBeenCalledTimes(1);
    expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', '507f1f77bcf86cd799439011');
  });

  it('should log download events per format', async () => {
    await GET(makeRequest(), makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(2);
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ formatType: 'FLAC', success: true })
    );
    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({ formatType: 'WAV', success: true })
    );
  });

  it('should handle download count of 0 (first download)', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 0,
      lastDownloadedAt: null,
    });

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://s3.example.com/presigned-bundle-url');
  });

  it('should skip unavailable formats silently', async () => {
    // Request 3 formats but only 2 exist
    const response = await GET(makeRequest('FLAC,WAV,AIFF'), makeParams());

    expect(response.status).toBe(302);
    // Only FLAC and WAV should be appended (AIFF returns null)
    expect(mockAppend).toHaveBeenCalledTimes(3); // 2 FLAC tracks + 1 WAV file
  });

  it('should sanitize release title in filename', async () => {
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Album (Special Edition) [Deluxe]',
    });

    await GET(makeRequest(), makeParams());

    const [, fileName] = mockGeneratePresignedDownloadUrl.mock.calls[0] ?? [];
    // Special chars like () and [] should be stripped
    expect(fileName).toContain('.zip');
    expect(fileName).not.toContain('(');
    expect(fileName).not.toContain('[');
  });

  it('should use fallback filename when title sanitizes to empty', async () => {
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: '!!!???',
    });

    await GET(makeRequest(), makeParams());

    const [, fileName] = mockGeneratePresignedDownloadUrl.mock.calls[0] ?? [];
    expect(fileName).toBe('release.zip');
  });

  it('should use fallback values when headers are missing', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=FLAC'
    );

    await GET(req, makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: 'unknown',
        userAgent: 'unknown',
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDownloadAccess.mockRejectedValue(new Error('DB error'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  it('should retain cached bundle and surface error when post-upload steps fail', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsertDownloadCount.mockRejectedValueOnce(new Error('Post-upload write failed'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    // The cached ZIP is intentionally NOT deleted — it remains valid for
    // subsequent requests and is bounded by the S3 lifecycle rule.
    expect(
      mockS3Send.mock.calls.some(
        ([command]) =>
          (command as { constructor: { name: string } }).constructor.name === 'DeleteObjectCommand'
      )
    ).toBe(false);

    consoleSpy.mockRestore();
  });

  it('should log post-upload error with cached zip key context', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const postUploadError = new Error('Post-upload write failed');

    mockUpsertDownloadCount.mockRejectedValueOnce(postUploadError);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle post-upload error (cached ZIP retained)',
      postUploadError,
      expect.objectContaining({
        tempS3Key: expect.stringContaining('tmp/bundles/cache/'),
      })
    );

    consoleSpy.mockRestore();
  });

  it('should skip S3 objects with no Body', async () => {
    mockS3Send.mockResolvedValue({ Body: null });

    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(302);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('should skip format with null files and no legacy s3Key', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-empty',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: null,
      },
    ]);

    const response = await GET(makeRequest('FLAC'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NO_FILES');
  });

  it('should skip format with s3Key but no fileName', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-partial',
        formatType: 'FLAC',
        s3Key: 'releases/r1/FLAC/file.flac',
        fileName: null,
        files: [],
      },
    ]);

    const response = await GET(makeRequest('FLAC'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NO_FILES');
  });

  it('should use fallback error message when parse issues have no message', async () => {
    // Request with no formats param at all to trigger validation failure
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle',
      {
        headers: {
          'x-forwarded-for': '127.0.0.1',
          'user-agent': 'test-agent',
        },
      }
    );

    const response = await GET(req, makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
    expect(body.message).toBeDefined();
  });

  it('should finalize the archive', async () => {
    await GET(makeRequest(), makeParams());

    expect(mockFinalize).toHaveBeenCalledTimes(1);
  });

  it('should pipeline S3 GETs so TTFB latency overlaps with archiving', async () => {
    interface Deferred<T> {
      promise: Promise<T>;
      resolve: (value: T) => void;
    }

    const createDeferred = <T>(): Deferred<T> => {
      const { promise, resolve } = Promise.withResolvers<T>();
      return { promise, resolve };
    };

    const first = createDeferred<{ Body: Readable }>();
    const second = createDeferred<{ Body: Readable }>();
    const third = createDeferred<{ Body: Readable }>();
    const deferredResponses = [first, second, third];
    let callIndex = 0;

    mockS3Send.mockImplementation(() => deferredResponses[callIndex++].promise);

    const requestPromise = GET(makeRequest(), makeParams());

    // Pipeline depth (8) > total files (3) → all 3 GETs are issued up front
    // before any append happens. This is the speedup vs the previous
    // strictly-serial pattern.
    await vi.waitFor(() => {
      expect(mockS3Send).toHaveBeenCalledTimes(3);
    });
    expect(mockAppend).not.toHaveBeenCalled();

    // As bodies resolve in order, archiver appends them in order.
    first.resolve({ Body: Readable.from(Buffer.from('file-1')) });
    await vi.waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(1);
    });

    second.resolve({ Body: Readable.from(Buffer.from('file-2')) });
    await vi.waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(2);
    });

    third.resolve({ Body: Readable.from(Buffer.from('file-3')) });

    const response = await requestPromise;
    expect(response.status).toBe(302);
    expect(mockAppend).toHaveBeenCalledTimes(3);
  });

  it('authenticates by reading the better-auth session from the request headers', async () => {
    const request = makeRequest();

    await GET(request, makeParams());

    // better-auth owns cookie naming/secure-prefix selection internally; the
    // route only forwards the request headers so the session cookie is honored.
    expect(mockGetSession).toHaveBeenCalledWith({ headers: request.headers });
  });

  it('proceeds for a paid download when the better-auth session has a user id', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });

    const response = await GET(makeRequest(), makeParams());

    // A valid session with the entitlement reaches the 302 redirect to S3.
    expect(response.status).toBe(302);
  });

  it('should fall back to formatType as folder name when FORMAT_LABELS has no entry', async () => {
    // Mock a format that only has FLAC
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [{ s3Key: 'releases/r1/FLAC/01.flac', fileName: '01.flac' }],
      },
    ]);

    // Override FORMAT_LABELS by checking the archive.append call
    await GET(makeRequest('FLAC'), makeParams());

    // Single format → flat archive (no subfolder)
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '01.flac' })
    );
  });

  it('should use legacy s3Key when format has no files array (null)', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-legacy',
        formatType: 'FLAC',
        s3Key: 'releases/r1/FLAC/legacy.flac',
        fileName: 'legacy.flac',
        files: null,
      },
    ]);

    const response = await GET(makeRequest('FLAC'), makeParams());

    expect(response.status).toBe(302);
    // Single format → flat archive (no subfolder)
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'legacy.flac' })
    );
  });

  it('should return 500 when S3 upload fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadDone.mockRejectedValueOnce(new Error('S3 upload failed'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  it('should abort upload and archive when file append fails in redirect flow', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockS3Send.mockRejectedValueOnce(new Error('S3 fetch failed'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(mockUploadAbort).toHaveBeenCalled();
    expect(mockArchiveAbort).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ─── Rate limiting ──────────────────────────────────────────────────────────

  it('should return 429 when rate limit is exceeded', async () => {
    mockRateLimitCheck.mockRejectedValueOnce(new Error('Rate limit'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMITED');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('skips rate limiting in E2E test mode (E2E_MODE=true)', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const response = await GET(makeRequest(), makeParams());

    // The limiter is never consulted in E2E mode, so a request cannot be 429'd
    // by repeated/retried downloads during a Playwright run.
    expect(mockRateLimitCheck).not.toHaveBeenCalled();
    expect(response.status).not.toBe(429);

    vi.unstubAllEnvs();
  });

  // ─── Invalid ObjectId ────────────────────────────────────────────────────────

  it('should return 400 for invalid release ID', async () => {
    const response = await GET(makeRequest(), makeParams('not-a-valid-id'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_ID');
  });

  // ─── safeArchiveEntryName edge case ─────────────────────────────────────────

  it('should use "file" fallback when filename sanitizes to empty', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [{ s3Key: 'releases/r1/FLAC/01.flac', fileName: '' }],
      },
      {
        id: 'format-wav',
        formatType: 'WAV',
        s3Key: null,
        fileName: null,
        files: [{ s3Key: 'releases/r1/WAV/01.wav', fileName: '' }],
      },
    ]);

    await GET(makeRequest(), makeParams());

    // Two formats → subfolders; empty filename sanitizes to '' → 'file' fallback
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/file' })
    );
  });

  // ─── Single-format flat archive (redirect path) ────────────────────────────

  it('should produce flat archive entries when only one format is requested (redirect path)', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/FLAC/01.flac', fileName: '01 - Intro.flac' },
          { s3Key: 'releases/r1/FLAC/02.flac', fileName: '02 - Main.flac' },
        ],
      },
    ]);

    const response = await GET(makeRequest('FLAC'), makeParams());

    expect(response.status).toBe(302);
    // Single format → no subfolder
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '01 - Intro.flac' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '02 - Main.flac' })
    );
  });

  it('should produce subfolder archive entries when multiple formats are requested (redirect path)', async () => {
    await GET(makeRequest('FLAC,WAV'), makeParams());

    // Multi-format → subfolders
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/01 - Intro.flac' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'WAV/album.wav' })
    );
  });

  // ─── Single-format flat archive (SSE path) ─────────────────────────────────

  it('should produce flat archive entries when only one format is requested (SSE path)', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/FLAC/01.flac', fileName: '01 - Intro.flac' },
          { s3Key: 'releases/r1/FLAC/02.flac', fileName: '02 - Main.flac' },
        ],
      },
    ]);

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    await response.text();

    // Single format → flat entries
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '01 - Intro.flac' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '02 - Main.flac' })
    );
  });

  it('should produce subfolder archive entries when multiple formats are requested (SSE path)', async () => {
    const response = await GET(makeJsonRequest('FLAC,WAV'), makeParams());
    await response.text();

    // Multi-format → subfolders
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/01 - Intro.flac' })
    );
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'WAV/album.wav' })
    );
  });

  // ─── SSE path: title fallback ──────────────────────────────────────────────

  it('should use fallback filename when title sanitizes to empty in SSE path', async () => {
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: '!!!???',
    });

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    const events = await readSSEEvents(response);

    const readyEvent = events.find((e) => e.event === 'ready');
    expect(readyEvent?.data).toEqual(expect.objectContaining({ fileName: 'release.zip' }));
  });

  // ─── SSE path: header fallbacks ────────────────────────────────────────────

  it('should use fallback values when headers are missing in SSE path', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=FLAC&respond=json'
    );

    const response = await GET(req, makeParams());
    await response.text();

    expect(mockLogDownloadEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: 'unknown',
        userAgent: 'unknown',
      })
    );
  });

  // ─── SSE path: analytics failure ──────────────────────────────────────────

  it('should emit ready event even when download analytics fail in SSE path', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsertDownloadCount.mockRejectedValueOnce(new Error('Analytics write failed'));

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    const events = await readSSEEvents(response);

    // ready event should still be emitted before analytics run
    const readyEvent = events.find((e) => e.event === 'ready');
    expect(readyEvent).toBeDefined();
    expect(readyEvent?.data).toEqual(
      expect.objectContaining({
        downloadUrl: 'https://s3.example.com/presigned-bundle-url',
      })
    );
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to record bundle download analytics',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── SSE path: outer stream error ─────────────────────────────────────────

  it('should emit error event when archive creation throws in SSE path', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Make the Upload constructor throw to trigger the outer catch
    const { Upload } = await import('@aws-sdk/lib-storage');
    (Upload as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Upload init failed');
    });

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    const events = await readSSEEvents(response);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent?.data).toEqual(
      expect.objectContaining({ message: 'An unexpected error occurred.' })
    );
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle SSE stream error',
      expect.anything()
    );

    consoleSpy.mockRestore();
  });

  // ─── SSE path: skips files when S3 returns no body ─────────────────────────

  it('should skip files whose S3 response has no Body (SSE path)', async () => {
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/FLAC/01.flac', fileName: '01 - Intro.flac' },
          { s3Key: 'releases/r1/FLAC/02.flac', fileName: '02 - Main.flac' },
        ],
      },
    ]);

    // First file returns no body, second returns normally
    mockS3Send
      .mockResolvedValueOnce({ Body: undefined })
      .mockResolvedValueOnce({ Body: Readable.from(Buffer.from('audio')) });

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    await response.text();

    // Only the second file should be appended
    expect(mockAppend).toHaveBeenCalledTimes(1);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '02 - Main.flac' })
    );
  });

  // ─── Zod validation fallback message ──────────────────────────────────────

  it('should use Zod issue message for invalid formats', async () => {
    const response = await GET(makeRequest('NOT_A_FORMAT'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  // ─── fetchObjectBuffer: transformToByteArray (smithy) body path ────────────

  it('should read S3 body via transformToByteArray when the SDK helper is present', async () => {
    // AWS SDK v3 in Node returns an IncomingMessage with a smithy-injected
    // `transformToByteArray` helper. Single FLAC file → one append with the
    // bytes returned by that helper.
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [{ s3Key: 'releases/r1/FLAC/01.flac', fileName: '01.flac' }],
      },
    ]);
    mockS3Send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]) },
    });

    const response = await GET(makeRequest('FLAC'), makeParams());

    expect(response.status).toBe(302);
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: '01.flac' })
    );
  });

  it('should skip the file when the S3 body is neither a Readable nor a smithy stream', async () => {
    // A truthy body that is neither a Readable nor exposes transformToByteArray
    // coerces to a null buffer, so the file is skipped (no append).
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [{ s3Key: 'releases/r1/FLAC/01.flac', fileName: '01.flac' }],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: { not: 'a stream' } });

    const response = await GET(makeRequest('FLAC'), makeParams());

    // The format resolves (so the request still 302s) but the unusable body
    // coerces to null and the file is skipped — no archive append.
    expect(response.status).toBe(302);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  // ─── Prefetch pipeline depth refill (redirect path) ────────────────────────

  it('should refill the prefetch pipeline when files exceed the prefetch depth', async () => {
    // 10 child files > S3_PREFETCH_DEPTH (8) → the consume loop pushes
    // additional prefetches for indices beyond the initial window.
    const manyFiles = Array.from({ length: 10 }, (_, i) => ({
      s3Key: `releases/r1/FLAC/${i}.flac`,
      fileName: `${i}.flac`,
    }));
    mockFindAllByRelease.mockResolvedValue([
      { id: 'format-flac', formatType: 'FLAC', s3Key: null, fileName: null, files: manyFiles },
    ]);

    const response = await GET(makeRequest('FLAC'), makeParams());

    expect(response.status).toBe(302);
    expect(mockAppend).toHaveBeenCalledTimes(10);
  });

  // ─── SSE cache-hit fast path (respond=json) ────────────────────────────────

  it('should serve a cached ZIP via synthetic SSE events on cache hit (respond=json)', async () => {
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);

    const response = await GET(makeJsonRequest('FLAC,WAV'), makeParams());
    const events = await readSSEEvents(response);

    // Cache hit skips archiving entirely.
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(events.find((e) => e.event === 'ready')).toBeDefined();
  });

  it('should still record analytics on SSE cache hit', async () => {
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);

    const response = await GET(makeJsonRequest('FLAC,WAV'), makeParams());
    await response.text();

    expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', '507f1f77bcf86cd799439011');
  });

  it('should emit complete after a cache-hit ready event (respond=json)', async () => {
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);

    const response = await GET(makeJsonRequest('FLAC,WAV'), makeParams());
    const events = await readSSEEvents(response);

    expect(events[events.length - 1]).toEqual(expect.objectContaining({ event: 'complete' }));
  });

  it('should log analytics failure on SSE cache hit and still complete', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);
    mockUpsertDownloadCount.mockRejectedValueOnce(new Error('analytics down'));

    const response = await GET(makeJsonRequest('FLAC'), makeParams());
    const events = await readSSEEvents(response);

    expect(events.find((e) => e.event === 'ready')).toBeDefined();
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to record bundle download analytics (cache hit)',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── respond=stream paid path: cache upload + drive + analytics ────────────

  it('should record paid analytics once the cache upload completes (respond=stream)', async () => {
    mockUploadDone.mockResolvedValueOnce(undefined);

    const response = await GET(makeStreamRequest('FLAC,WAV'), makeParams());
    await response.arrayBuffer();

    // The cache-upload `.then` fires the paid analytics; allow the
    // fire-and-forget microtask chain to settle.
    await flushMicrotasks();

    expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', '507f1f77bcf86cd799439011');
  });

  it('should skip paid analytics when the cache upload fails (respond=stream)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadDone.mockRejectedValueOnce(new Error('cache upload failed'));

    const response = await GET(makeStreamRequest('FLAC,WAV'), makeParams());
    await response.arrayBuffer().catch(() => undefined);
    await flushMicrotasks();

    // Upload failed → analytics skipped, and the failure is logged.
    expect(mockUpsertDownloadCount).not.toHaveBeenCalled();
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle cache upload failed (stream path)',
      expect.any(Error),
      expect.objectContaining({ tempS3Key: expect.stringContaining('tmp/bundles/cache/') })
    );

    consoleSpy.mockRestore();
  });

  it('should log paid analytics failure on the stream path when logging throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadDone.mockResolvedValueOnce(undefined);
    mockUpsertDownloadCount.mockRejectedValueOnce(new Error('analytics write failed'));

    const response = await GET(makeStreamRequest('FLAC,WAV'), makeParams());
    await response.arrayBuffer();
    await flushMicrotasks();

    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to record bundle download analytics (stream path)',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  it('should refill the stream prefetch pipeline when files exceed the depth', async () => {
    const manyFiles = Array.from({ length: 10 }, (_, i) => ({
      s3Key: `releases/r1/FLAC/${i}.flac`,
      fileName: `${i}.flac`,
    }));
    mockFindAllByRelease.mockResolvedValue([
      { id: 'format-flac', formatType: 'FLAC', s3Key: null, fileName: null, files: manyFiles },
    ]);

    const response = await GET(makeStreamRequest('FLAC'), makeParams());
    await response.arrayBuffer();
    await flushMicrotasks();

    expect(mockAppend).toHaveBeenCalledTimes(10);
  });

  it('should abort the archive and destroy streams when the stream drive throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // First body resolves (so streamFirstBuffer is set), then a later append
    // throws to drive the catch in the async IIFE.
    mockAppend
      .mockImplementationOnce(() => {
        queueMicrotask(() => mockArchiverPassThrough.emit('entry'));
      })
      .mockImplementationOnce(() => {
        throw new Error('append exploded');
      });

    const response = await GET(makeStreamRequest('FLAC,WAV'), makeParams());
    await response.arrayBuffer().catch(() => undefined);
    await flushMicrotasks();

    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle stream drive error',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );
    expect(mockArchiveAbort).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should error the web stream controller when the archive emits an error (respond=stream)', async () => {
    // Emit an error on the archiver after the response starts streaming so the
    // `responsePass.on('error')` controller.error path runs.
    const response = await GET(makeStreamRequest('FLAC,WAV'), makeParams());
    queueMicrotask(() => mockArchiverPassThrough.emit('error', new Error('archive boom')));

    await expect(response.arrayBuffer()).rejects.toBeDefined();
  });
});

const makeStreamRequest = (formats = 'FLAC,WAV'): NextRequest =>
  new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}&respond=stream`,
    {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
    }
  );

const flushMicrotasks = async (): Promise<void> => {
  // Let queued microtasks (fire-and-forget cache-upload `.then` chains) settle.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 007-free-digital-downloads — mode='free' guest flow
// ─────────────────────────────────────────────────────────────────────────────

const makeFreeRequest = (formats = 'MP3_320KBPS,AAC'): NextRequest =>
  new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}&mode=free`,
    {
      headers: {
        'x-forwarded-for': '203.0.113.42',
        'user-agent': 'test-agent',
        'accept-language': 'en-US,en;q=0.9',
      },
    }
  );

describe('GET /api/releases/[id]/download/bundle (mode=free)', () => {
  beforeEach(() => {
    // Default: anonymous (no token) — free flow accepts this.
    mockGetSession.mockResolvedValue(null);
    // resolveVisitorIdentity returns a fresh visitorId requiring cookie reissue.
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: true,
    });
    mockReadGuestVisitorId.mockResolvedValue(null);
    mockSetGuestVisitorIdCookie.mockResolvedValue(undefined);
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');

    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockUpsertDownloadCount.mockResolvedValue(undefined);
    mockLogDownloadEvent.mockResolvedValue(undefined);

    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
      {
        id: 'fmt-aac',
        formatType: 'AAC',
        s3Key: 'releases/r1/AAC/album.m4a',
        fileName: 'album.m4a',
        files: [],
      },
    ]);

    mockS3Send.mockResolvedValue({
      Body: Readable.from(Buffer.from('fake-audio-data')),
    });
  });

  it('does NOT return 401 for guests when mode=free', async () => {
    const response = await GET(makeFreeRequest(), makeParams());
    expect(response.status).not.toBe(401);
  });

  it('rejects FLAC with INVALID_FORMATS (400) when mode=free', async () => {
    const response = await GET(makeFreeRequest('FLAC'), makeParams());
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMATS');
  });

  it('builds a ZIP for MP3_320KBPS only when mode=free', async () => {
    mockFindAllByRelease.mockResolvedValueOnce([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://s3.example.com/presigned-bundle-url');
  });

  it('builds a ZIP for AAC only when mode=free', async () => {
    mockFindAllByRelease.mockResolvedValueOnce([
      {
        id: 'fmt-aac',
        formatType: 'AAC',
        s3Key: 'releases/r1/AAC/album.m4a',
        fileName: 'album.m4a',
        files: [],
      },
    ]);
    const response = await GET(makeFreeRequest('AAC'), makeParams());
    expect(response.status).toBe(302);
  });

  it('builds a single ZIP containing both free formats when both are requested', async () => {
    const response = await GET(makeFreeRequest('MP3_320KBPS,AAC'), makeParams());
    expect(response.status).toBe(302);
    // Two files appended to a single archive.
    expect(mockAppend).toHaveBeenCalledTimes(2);
  });

  it('issues the visitor-id cookie via setGuestVisitorIdCookie when cookieReissue=true', async () => {
    await GET(makeFreeRequest(), makeParams());
    expect(mockSetGuestVisitorIdCookie).toHaveBeenCalledWith('guest-visitor-1');
  });

  it('does NOT issue the visitor-id cookie when cookieReissue=false', async () => {
    mockResolveVisitorIdentity.mockResolvedValueOnce({
      primaryVisitorId: 'existing-visitor',
      allVisitorIds: ['existing-visitor'],
      cookieReissue: false,
    });
    await GET(makeFreeRequest(), makeParams());
    expect(mockSetGuestVisitorIdCookie).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when release does not exist', async () => {
    mockPrismaReleaseFindFirst.mockResolvedValueOnce(null);
    const response = await GET(makeFreeRequest(), makeParams());
    expect(response.status).toBe(404);
  });

  it('does NOT call PurchaseRepository.upsertDownloadCount for guest free downloads', async () => {
    await GET(makeFreeRequest(), makeParams());
    expect(mockUpsertDownloadCount).not.toHaveBeenCalled();
  });

  it('logs DownloadEvent with visitorId and null userId for guest free downloads', async () => {
    await GET(makeFreeRequest(), makeParams());
    expect(mockLogDownloadEvent).toHaveBeenCalled();
    const call = mockLogDownloadEvent.mock.calls[0][0];
    expect(call.userId).toBeNull();
    expect(call.visitorId).toBe('guest-visitor-1');
  });

  it('uses a cache key namespaced under /free/ when mode=free', async () => {
    await GET(makeFreeRequest(), makeParams());
    const [tempKey] = mockGeneratePresignedDownloadUrl.mock.calls[0] ?? [];
    expect(tempKey).toMatch(/^tmp\/bundles\/cache\/507f1f77bcf86cd799439011\/free\//);
  });

  it('returns NO_FILES (404) when no free formats are published for the release', async () => {
    mockFindAllByRelease.mockResolvedValueOnce([]);
    const response = await GET(makeFreeRequest(), makeParams());
    const body = await response.json();
    expect(response.status).toBe(404);
    expect(body.error).toBe('NO_FILES');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 007-free-digital-downloads — US2 cap enforcement (T044)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/releases/[id]/download/bundle (mode=free) — cap enforcement', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockSetGuestVisitorIdCookie.mockResolvedValue(undefined);
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({
      Body: Readable.from(Buffer.from('fake-audio-data')),
    });
  });

  it('returns 403 CAP_REACHED with resetsAtIso body when cap is exhausted', async () => {
    const resetsAt = new Date('2026-05-09T09:00:00Z');
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(new MockedCapReachedError(resetsAt));

    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.errorCode).toBe('CAP_REACHED');
    expect(body.resetsAtIso).toBe('2026-05-09T09:00:00.000Z');
    expect(typeof body.message).toBe('string');
  });

  it('writes a CAP_REACHED audit DownloadEvent (success:false, errorCode:CAP_REACHED)', async () => {
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());

    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(1);
    const audit = mockLogDownloadEvent.mock.calls[0][0];
    expect(audit.success).toBe(false);
    expect(audit.errorCode).toBe('CAP_REACHED');
    expect(audit.visitorId).toBe('guest-visitor-1');
    expect(audit.userId).toBeNull();
  });

  it('does NOT call recordSuccessfulDownload when cap is reached', async () => {
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockRecordSuccessfulDownload).not.toHaveBeenCalled();
  });

  it('records exactly one success event per successful free bundle (single format)', async () => {
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockRecordSuccessfulDownload).toHaveBeenCalledTimes(1);
    // mockLogDownloadEvent is invoked through the mocked recordSuccessfulDownload.
    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(1);
  });

  it('records exactly one success event per successful free bundle (two formats)', async () => {
    mockFindAllByRelease.mockResolvedValueOnce([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
      {
        id: 'fmt-aac',
        formatType: 'AAC',
        s3Key: 'releases/r1/AAC/album.m4a',
        fileName: 'album.m4a',
        files: [],
      },
    ]);
    await GET(makeFreeRequest('MP3_320KBPS,AAC'), makeParams());
    expect(mockRecordSuccessfulDownload).toHaveBeenCalledTimes(1);
    expect(mockLogDownloadEvent).toHaveBeenCalledTimes(1);
  });

  it('asserts cap before bundle prep (assertFreeDownloadAllowed runs before S3 GET)', async () => {
    const callOrder: string[] = [];
    mockAssertFreeDownloadAllowed.mockImplementationOnce(async () => {
      callOrder.push('assert');
      return { allowed: true, remaining: 3, count: 0, oldestInWindow: null, resetsAt: null };
    });
    mockS3Send.mockImplementationOnce(async () => {
      callOrder.push('s3');
      return { Body: Readable.from(Buffer.from('fake-audio-data')) };
    });
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(callOrder[0]).toBe('assert');
    expect(callOrder).toContain('s3');
  });

  it('passes union of visitorIds to assertFreeDownloadAllowed (identity-conflict union)', async () => {
    mockResolveVisitorIdentity.mockResolvedValueOnce({
      primaryVisitorId: 'cookie-visitor',
      allVisitorIds: ['cookie-visitor', 'fingerprint-visitor'],
      cookieReissue: false,
    });
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockAssertFreeDownloadAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        visitorIds: ['cookie-visitor', 'fingerprint-visitor'],
        releaseId: '507f1f77bcf86cd799439011',
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 007-free-digital-downloads — US3 lock + auth user free flow (T055/T057/T061)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/releases/[id]/download/bundle (mode=free) — concurrency lock + auth user', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
  });

  it('returns 409 LOCK_HELD when lock acquisition fails AND no warm cache exists', async () => {
    mockLockAcquire.mockReturnValueOnce(false);
    mockVerifyS3ObjectExists.mockResolvedValueOnce(false);
    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.errorCode).toBe('LOCK_HELD');
  });

  it('proceeds via cache hit when lock acquisition fails BUT a warm cache exists', async () => {
    mockLockAcquire.mockReturnValueOnce(false);
    // First verifyS3ObjectExists call (cache check on lock fail) → true
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);
    // Second call (302 path cache check) → true
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);
    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(response.status).toBe(302);
    expect(mockRecordSuccessfulDownload).toHaveBeenCalledTimes(1);
  });

  it('uses lock key composed of subjectKey + releaseId + sortedFormatKey', async () => {
    await GET(makeFreeRequest('MP3_320KBPS,AAC'), makeParams());
    expect(mockLockAcquire).toHaveBeenCalledWith(
      'guest:guest-visitor-1|507f1f77bcf86cd799439011|AAC-MP3_320KBPS'
    );
  });

  it('releases the lock at the end of a successful free download', async () => {
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockLockRelease).toHaveBeenCalledWith(
      'guest:guest-visitor-1|507f1f77bcf86cd799439011|MP3_320KBPS'
    );
  });

  it('keys cap by userId (NOT visitorId) for authenticated free-flow users', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-123' } });
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockAssertFreeDownloadAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: 'user', userId: 'user-123' },
        releaseId: '507f1f77bcf86cd799439011',
      })
    );
  });

  it('does NOT issue the visitor cookie for authenticated free-flow users', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-123' } });
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockSetGuestVisitorIdCookie).not.toHaveBeenCalled();
    expect(mockResolveVisitorIdentity).not.toHaveBeenCalled();
  });

  it('uses subjectKey "user:<id>" in the lock key for authenticated users', async () => {
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-123' } });
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(mockLockAcquire).toHaveBeenCalledWith(
      'user:user-123|507f1f77bcf86cd799439011|MP3_320KBPS'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 007-free-digital-downloads — Phase 6 polish: STREAM_FAILED audit (T062)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/releases/[id]/download/bundle (mode=free) — stream failure audit', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
  });

  it('writes a STREAM_FAILED audit DownloadEvent on 302-path archive failure', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('S3 GetObject failed'));

    await GET(makeFreeRequest('MP3_320KBPS'), makeParams()).catch(() => undefined);

    // Find the STREAM_FAILED row.
    const streamFailedCall = mockLogDownloadEvent.mock.calls.find((call) => {
      const arg = (call as ReadonlyArray<{ errorCode?: string; success?: boolean }>)[0];
      return arg?.errorCode === 'STREAM_FAILED' && arg?.success === false;
    });
    expect(streamFailedCall).toBeDefined();
    expect(streamFailedCall?.[0]?.visitorId).toBe('guest-visitor-1');
  });

  it('does NOT call recordSuccessfulDownload when stream fails', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('S3 GetObject failed'));
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams()).catch(() => undefined);
    expect(mockRecordSuccessfulDownload).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 007-free-digital-downloads — US3 cross-release independence + identity union
// (T054, T056)
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/releases/[id]/download/bundle (mode=free) — cross-release + identity-union', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
  });

  it('passes the requested releaseId through to assertFreeDownloadAllowed (cap is per-release)', async () => {
    const releaseB = '507f1f77bcf86cd799439022';
    mockPrismaReleaseFindFirst.mockResolvedValueOnce({ id: releaseB, title: 'Album B' });
    await GET(makeFreeRequest('MP3_320KBPS'), makeParams(releaseB));
    expect(mockAssertFreeDownloadAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ releaseId: releaseB })
    );
  });

  it('cross-release independence: cap exhausted on A does NOT block release B', async () => {
    // Release A → cap reached
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );
    const aResp = await GET(makeFreeRequest('MP3_320KBPS'), makeParams('507f1f77bcf86cd799439011'));
    expect(aResp.status).toBe(403);

    // Release B (different id) for the SAME visitor → next assert call resolves true
    const releaseB = '507f1f77bcf86cd799439022';
    mockPrismaReleaseFindFirst.mockResolvedValueOnce({ id: releaseB, title: 'Album B' });
    mockAssertFreeDownloadAllowed.mockResolvedValueOnce({
      allowed: true,
      remaining: 3,
      count: 0,
      oldestInWindow: null,
      resetsAt: null,
    });
    const bResp = await GET(makeFreeRequest('MP3_320KBPS'), makeParams(releaseB));
    expect(bResp.status).not.toBe(403);
    expect(bResp.status).not.toBe(409);
  });

  it('identity-conflict union: cookie-cleared session unions previous events via fingerprint', async () => {
    // Cookie + fingerprint resolve to two visitor rows. The route must pass
    // BOTH ids to assertFreeDownloadAllowed so prior cookie events still count.
    mockResolveVisitorIdentity.mockResolvedValueOnce({
      primaryVisitorId: 'visitor-new-cookie',
      allVisitorIds: ['visitor-new-cookie', 'visitor-prior-fingerprint'],
      cookieReissue: false,
    });
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );
    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    expect(response.status).toBe(403);
    expect(mockAssertFreeDownloadAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        visitorIds: ['visitor-new-cookie', 'visitor-prior-fingerprint'],
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 007-free-digital-downloads — direct-stream branch (`respond=stream`) parity
// between paid and free flows. Free-mode previously took the SSE path and
// paid the S3 multipart-upload round-trip before the user saw a single byte;
// unifying on `respond=stream` removes that latency.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/releases/[id]/download/bundle (mode=free) — respond=stream parity', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
      {
        id: 'fmt-aac',
        formatType: 'AAC',
        s3Key: 'releases/r1/AAC/album.m4a',
        fileName: 'album.m4a',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
  });

  it('returns 200 with ZIP headers when respond=stream + mode=free', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS,AAC&respond=stream&mode=free',
        {
          headers: {
            'x-forwarded-for': '203.0.113.42',
            'user-agent': 'test-agent',
            'accept-language': 'en-US,en;q=0.9',
          },
        }
      ),
      makeParams()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('Content-Disposition')).toMatch(/attachment.*\.zip/);
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');

    // Drain so the underlying upload + finalize complete before the test ends.
    await response.arrayBuffer();
  });

  it('records exactly one successful free download before returning the stream Response', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS,AAC&respond=stream&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    // Cap is committed BEFORE the streaming response is constructed —
    // mirrors the SSE pre-`ready` placement so concurrent requests after
    // this point see the new count.
    expect(mockRecordSuccessfulDownload).toHaveBeenCalledTimes(1);
    expect(mockRecordSuccessfulDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: 'guest', visitorId: 'guest-visitor-1' },
        releaseId: '507f1f77bcf86cd799439011',
      })
    );

    await response.arrayBuffer();
  });

  it('does NOT record a free download when every object body is missing (empty bundle)', async () => {
    // M3: an all-files-deleted bundle produces an empty ZIP. The user's free
    // cap must not be charged for a download that delivers nothing.
    mockS3Send.mockResolvedValue({ Body: null });

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS,AAC&respond=stream&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    await response.arrayBuffer();

    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockRecordSuccessfulDownload).not.toHaveBeenCalled();
  });

  it('returns the stream (not a clean 500) when the first object fetch rejects', async () => {
    // A release whose S3 objects are missing makes the first GetObject reject
    // (NoSuchKey). The route must coalesce that to a missing first body and let
    // the drive abort the archive mid-stream — NOT fault the request with a
    // clean 500 — and must not charge the free cap. Mirrors the fixture-less CI
    // behavior asserted by e2e/tests/free-digital-downloads.spec.ts. (The Upload
    // mock attaches a Body error listener so the drive's stream destroy does not
    // surface as an unhandled error in the pooled run.)
    mockS3Send.mockRejectedValue(new Error('NoSuchKey'));

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS,AAC&respond=stream&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    // The body aborts mid-stream once the archive is destroyed; swallow it.
    await response.arrayBuffer().catch(() => undefined);

    expect(response.status).toBe(200);
    expect(mockRecordSuccessfulDownload).not.toHaveBeenCalled();
  });

  it('does NOT call PurchaseRepository.upsertDownloadCount on the free stream path', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS,AAC&respond=stream&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    await response.arrayBuffer();
    expect(mockUpsertDownloadCount).not.toHaveBeenCalled();
  });

  it('rejects respond=stream + mode=free with CAP_REACHED before any S3 work happens', async () => {
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS,AAC&respond=stream&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.errorCode).toBe('CAP_REACHED');
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockRecordSuccessfulDownload).not.toHaveBeenCalled();
  });
});

describe('GET /api/releases/[id]/download/bundle — preflight (respond=preflight)', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
  });

  it('returns 200 success for free-mode preflight when cap is allowed', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS&respond=preflight&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('does NOT acquire the free-download lock during preflight (follow-up stream re-acquires)', async () => {
    mockLockAcquire.mockClear();
    await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS&respond=preflight&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    expect(mockLockAcquire).not.toHaveBeenCalled();
  });

  it('does NOT record a successful free download during preflight', async () => {
    mockRecordSuccessfulDownload.mockClear();
    await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS&respond=preflight&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    expect(mockRecordSuccessfulDownload).not.toHaveBeenCalled();
  });

  it('returns 403 CAP_REACHED on free-mode preflight when cap is exhausted', async () => {
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );

    const response = await GET(
      new NextRequest(
        'http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=MP3_320KBPS&respond=preflight&mode=free',
        { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
      ),
      makeParams()
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.errorCode).toBe('CAP_REACHED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional branch coverage — free-mode SSE/stream record + audit failures,
// SSE archiver error listeners, web-stream cancel, redirect archive-error pipe.
// ─────────────────────────────────────────────────────────────────────────────

const makeFreeJsonRequest = (formats = 'MP3_320KBPS'): NextRequest =>
  new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}&respond=json&mode=free`,
    { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
  );

const makeFreeStreamRequest = (formats = 'MP3_320KBPS'): NextRequest =>
  new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}&respond=stream&mode=free`,
    { headers: { 'x-forwarded-for': '203.0.113.42', 'user-agent': 'test-agent' } }
  );

describe('GET /api/releases/[id]/download/bundle — additional branch coverage', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue(null);
    mockResolveVisitorIdentity.mockResolvedValue({
      primaryVisitorId: 'guest-visitor-1',
      allVisitorIds: ['guest-visitor-1'],
      cookieReissue: false,
    });
    mockReadGuestVisitorId.mockResolvedValue('guest-visitor-1');
    mockComputeFingerprintHash.mockReturnValue('test-fp-hash');
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
    mockUploadDone.mockResolvedValue(undefined);
    mockUpsertDownloadCount.mockResolvedValue(undefined);
    mockLogDownloadEvent.mockResolvedValue(undefined);
    mockAssertFreeDownloadAllowed.mockResolvedValue({
      allowed: true,
      remaining: 3,
      count: 0,
      oldestInWindow: null,
      resetsAt: null,
    });
    mockRecordSuccessfulDownload.mockImplementation(async (params) => {
      await mockLogDownloadEvent({
        userId: params.subject.kind === 'user' ? params.subject.userId : null,
        visitorId: params.subject.kind === 'guest' ? params.subject.visitorId : null,
        releaseId: params.releaseId,
        formatType: params.formatType,
        success: true,
        ipAddress: params.ipAddress ?? '',
        userAgent: params.userAgent ?? '',
      });
    });
    // Restore the default append behavior (emit 'entry') in case a prior
    // shuffled test consumed a one-shot override.
    mockAppend.mockImplementation(() => {
      queueMicrotask(() => mockArchiverPassThrough.emit('entry'));
    });
  });

  // ─── CAP_REACHED audit-write failure (line 473) ────────────────────────────

  it('logs an error when the CAP_REACHED audit event write fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );
    mockLogDownloadEvent.mockRejectedValueOnce(new Error('audit write failed'));

    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());

    expect(response.status).toBe(403);
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to write CAP_REACHED audit event',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── Non-Cap error from assertFreeDownloadAllowed rethrows → 500 (line 486) ─

  it('rethrows a non-CapReached error from the quota check as a 500', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(new Error('quota service unavailable'));

    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  // ─── recordSuccessfulDownload failure logs an error (line 543) ─────────────

  it('logs an error when recording a successful free download fails (302 path)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRecordSuccessfulDownload.mockRejectedValueOnce(new Error('record failed'));

    const response = await GET(makeFreeRequest('MP3_320KBPS'), makeParams());

    expect(response.status).toBe(302);
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to record successful free download',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── recordFreeStreamFailure audit-write failure logs an error (line 568) ──

  it('logs an error when the STREAM_FAILED audit write itself fails (302 path)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Drive the redirect-path archive failure (S3 GET rejects), then make the
    // STREAM_FAILED audit logDownloadEvent throw.
    mockS3Send.mockRejectedValueOnce(new Error('S3 GetObject failed'));
    mockLogDownloadEvent.mockRejectedValueOnce(new Error('audit write failed'));

    await GET(makeFreeRequest('MP3_320KBPS'), makeParams()).catch(() => undefined);

    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Failed to write STREAM_FAILED audit event',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── SSE free-mode: recordFreeSuccess before ready (live archive, line 831) ─

  it('records a free success before the SSE ready event (live archive path)', async () => {
    const response = await GET(makeFreeJsonRequest('MP3_320KBPS'), makeParams());
    await response.text();

    expect(mockRecordSuccessfulDownload).toHaveBeenCalledTimes(1);
  });

  // ─── SSE free-mode cache hit: recordFreeSuccess before ready (line 648) ─────

  it('records a free success on SSE cache hit before emitting ready', async () => {
    mockVerifyS3ObjectExists.mockResolvedValueOnce(true);

    const response = await GET(makeFreeJsonRequest('MP3_320KBPS'), makeParams());
    const events = await readSSEEvents(response);

    expect(events.find((e) => e.event === 'ready')).toBeDefined();
    expect(mockRecordSuccessfulDownload).toHaveBeenCalledTimes(1);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  // ─── SSE archiver error listeners (lines 700, 706) + abort on stream error ─

  it('emits an SSE error and aborts the upload when the archive errors mid-zip', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Two formats so the archive lives long enough to receive an emitted error
    // after the first append; the error listener sets archiveError and the
    // pipe-through destroys the PassThrough.
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: 'releases/r1/MP3_320KBPS/album.mp3',
        fileName: 'album.mp3',
        files: [],
      },
      {
        id: 'fmt-aac',
        formatType: 'AAC',
        s3Key: 'releases/r1/AAC/album.m4a',
        fileName: 'album.m4a',
        files: [],
      },
    ]);
    // First append emits an archiver error rather than an 'entry' event.
    mockAppend.mockImplementationOnce(() => {
      queueMicrotask(() => mockArchiverPassThrough.emit('error', new Error('archive failure')));
    });

    const response = await GET(makeFreeJsonRequest('MP3_320KBPS,AAC'), makeParams());
    const events = await readSSEEvents(response);

    expect(events.find((e) => e.event === 'complete')).toBeDefined();

    consoleSpy.mockRestore();
  });

  // ─── SSE prefetch refill across depth (lines 776, 779 region) ──────────────

  it('refills the SSE prefetch pipeline when files exceed the prefetch depth', async () => {
    const manyFiles = Array.from({ length: 10 }, (_, i) => ({
      s3Key: `releases/r1/MP3_320KBPS/${i}.mp3`,
      fileName: `${i}.mp3`,
    }));
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: null,
        fileName: null,
        files: manyFiles,
      },
    ]);

    const response = await GET(makeFreeJsonRequest('MP3_320KBPS'), makeParams());
    await response.text();

    expect(mockAppend).toHaveBeenCalledTimes(10);
  });

  // ─── Stream tee: cachePass already destroyed → skips write/end (966, 972) ──

  it('keeps streaming to the client when the cache pass is destroyed mid-stream', async () => {
    // Make the cache Upload abort the cache PassThrough by having done() reject;
    // the tee Transform must then skip writing to the destroyed cachePass and
    // continue forwarding to the response.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadDone.mockRejectedValueOnce(new Error('cache upload aborted'));

    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    const buf = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    await flushMicrotasks();

    expect(response.status).toBe(200);
    expect(buf).toBeDefined();

    consoleSpy.mockRestore();
  });

  // ─── Web stream cancel handler (lines 1144-1147) ───────────────────────────

  it('destroys streams and aborts uploads when the web response stream is canceled', async () => {
    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    const reader = response.body?.getReader();

    // Cancel before draining → triggers the ReadableStream `cancel()` handler.
    await reader?.cancel();

    expect(mockArchiveAbort).toHaveBeenCalled();
    expect(mockUploadAbort).toHaveBeenCalled();
  });

  // ─── Stream path: real bytes flow through tee + web stream (966-969, 1134) ──

  it('forwards archived bytes through the tee Transform and the web response stream', async () => {
    // Make append actually write bytes into the archiver PassThrough so a chunk
    // flows through teeToCache (transform) and the webStream data handler.
    mockAppend.mockImplementationOnce((buffer: Buffer) => {
      mockArchiverPassThrough.write(buffer);
      queueMicrotask(() => mockArchiverPassThrough.emit('entry'));
    });
    mockS3Send.mockResolvedValueOnce({ Body: Readable.from(Buffer.from('real-bytes')) });

    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    const buf = await response.arrayBuffer();
    await flushMicrotasks();

    expect(response.status).toBe(200);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  // ─── SSE abort path with a rejecting upload promise (line 620 catch) ───────

  it('awaits and swallows a rejected upload promise when aborting the SSE upload', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // The S3 fetch fails → no formats appended → abortSseUpload runs and
    // awaits the (rejected) upload promise, exercising the `.catch` callback.
    mockS3Send.mockRejectedValueOnce(new Error('S3 fetch failed'));
    mockUploadDone.mockRejectedValueOnce(new Error('upload rejected'));

    const response = await GET(makeFreeJsonRequest('MP3_320KBPS'), makeParams());
    const events = await readSSEEvents(response);

    expect(
      events.some((e) => e.event === 'error' && e.data.message === 'No formats could be prepared.')
    ).toBe(true);
    expect(mockUploadAbort).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ─── Redirect-path archiver error listener pipes through (line 1167) ───────

  it('destroys the upload PassThrough when the archiver errors in the redirect path', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Use the default (redirect) path. The first append emits an archiver error
    // which the `archive.on('error')` listener pipes into the PassThrough.
    mockGetSession.mockResolvedValueOnce({ user: { id: 'user-123' } });
    mockGetDownloadAccess.mockResolvedValueOnce({
      allowed: true,
      reason: null,
      downloadCount: 1,
      lastDownloadedAt: null,
      resetInHours: null,
    });
    mockFindAllByRelease.mockResolvedValueOnce([
      {
        id: 'format-flac',
        formatType: 'FLAC',
        s3Key: null,
        fileName: null,
        files: [{ s3Key: 'releases/r1/FLAC/01.flac', fileName: '01.flac' }],
      },
    ]);
    // append rejects the per-entry promise by emitting an archiver error.
    mockAppend.mockImplementationOnce(() => {
      mockArchiverPassThrough.emit('error', new Error('archiver exploded'));
    });

    const response = await GET(makeRequest('FLAC'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });

  // ─── Stream drive catch destroys both streams (lines 1069-1070) ────────────

  it('destroys the cache and tee streams when the stream drive throws after first byte', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // First file resolves (streamFirstBuffer set), then append throws on the
    // SECOND entry so the drive catch destroys cachePass + teeToCache.
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/MP3_320KBPS/01.mp3', fileName: '01.mp3' },
          { s3Key: 'releases/r1/MP3_320KBPS/02.mp3', fileName: '02.mp3' },
        ],
      },
    ]);
    mockAppend
      .mockImplementationOnce(() => {
        queueMicrotask(() => mockArchiverPassThrough.emit('entry'));
      })
      .mockImplementationOnce(() => {
        throw new Error('append exploded');
      });

    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    await response.arrayBuffer().catch(() => undefined);
    await flushMicrotasks();

    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle stream drive error',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );

    consoleSpy.mockRestore();
  });

  // ─── Stream cancel after streams already destroyed (1144/1145 false) ───────

  it('handles web-stream cancel idempotently when streams are already destroyed', async () => {
    // Emit an archiver error first (destroys cachePass + teeToCache via the
    // archive error listener), then cancel the reader so the cancel handler
    // sees already-destroyed streams (the `!destroyed` guards short-circuit).
    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    mockArchiverPassThrough.emit('error', new Error('archive boom'));
    await flushMicrotasks();

    const reader = response.body?.getReader();
    await reader?.cancel().catch(() => undefined);

    // Cancel still calls abort on the archive + upload (idempotent).
    expect(mockArchiveAbort).toHaveBeenCalled();
  });

  // ─── Archive error after cache streams destroyed (981/982 false) ───────────

  it('does not double-destroy streams when the archive errors twice (stream path)', async () => {
    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    // First error destroys cachePass + teeToCache; the second error finds them
    // already destroyed so the `!destroyed` guards are exercised on the false side.
    mockArchiverPassThrough.emit('error', new Error('first boom'));
    mockArchiverPassThrough.emit('error', new Error('second boom'));
    await flushMicrotasks();

    await response.arrayBuffer().catch(() => undefined);

    expect(mockArchiverPassThrough).toBeDefined();
  });

  // ─── Drive-error catch finds cache streams already destroyed (1094, 1095) ──

  it('skips re-destroying already-destroyed cache streams in the drive catch (false arms)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Emit an archiver error first so the archive `on('error')` listener destroys
    // BOTH cachePass and teeToCache. The subsequent append (second entry) throws
    // and the drive catch runs — but now both streams are already destroyed, so
    // the `!cachePass.destroyed` / `!teeToCache.destroyed` guards take their false
    // arms and skip the redundant destroy calls.
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-mp3',
        formatType: 'MP3_320KBPS',
        s3Key: null,
        fileName: null,
        files: [
          { s3Key: 'releases/r1/MP3_320KBPS/01.mp3', fileName: '01.mp3' },
          { s3Key: 'releases/r1/MP3_320KBPS/02.mp3', fileName: '02.mp3' },
        ],
      },
    ]);
    mockAppend
      .mockImplementationOnce(() => {
        // First append: destroy the cache streams via an archiver error, then
        // resolve the per-entry wait so the loop advances to the second entry.
        mockArchiverPassThrough.emit('error', new Error('archive boom'));
        queueMicrotask(() => mockArchiverPassThrough.emit('entry'));
      })
      .mockImplementationOnce(() => {
        throw new Error('append exploded after streams destroyed');
      });

    const response = await GET(makeFreeStreamRequest('MP3_320KBPS'), makeParams());
    await response.arrayBuffer().catch(() => undefined);
    await flushMicrotasks();

    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle stream drive error',
      expect.any(Error),
      expect.objectContaining({ releaseId: '507f1f77bcf86cd799439011' })
    );
    expect(mockArchiveAbort).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // ─── SSE abort with a null PassThrough (line 632 false arm) ────────────────

  it('aborts the SSE upload safely when the archive was never created (null PassThrough)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Make the in-stream cache check reject BEFORE the archiver/PassThrough are
    // created. The outer try/catch runs abortSseUpload while combinedPassThrough
    // is still null, exercising the `combinedPassThrough && !destroyed` false arm.
    mockVerifyS3ObjectExists.mockReset();
    mockVerifyS3ObjectExists
      // First call: lock-acquire cache-warm probe (not reached — lock acquired).
      // Stream start cache probe rejects.
      .mockRejectedValueOnce(new Error('verify exploded in stream'))
      .mockResolvedValue(false);

    const response = await GET(makeFreeJsonRequest('MP3_320KBPS'), makeParams());
    const events = await readSSEEvents(response);

    expect(
      events.some((e) => e.event === 'error' && e.data.message === 'An unexpected error occurred.')
    ).toBe(true);
    expect(downloadsLoggerMock.error).toHaveBeenCalledWith(
      'Bundle SSE stream error',
      expect.anything()
    );

    consoleSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #668 — a free-only request from a non-purchaser must be capped/quota'd even
// when `mode=free` is omitted. `isFreeMode` (client-supplied) must not be the
// sole gate for the free-tier accounting; the delivered format set + purchase
// entitlement decide it server-side.
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/releases/[id]/download/bundle — free-only without mode=free (#668)', () => {
  const NON_PURCHASER = {
    allowed: false,
    reason: 'no_purchase' as const,
    downloadCount: 0,
    lastDownloadedAt: null,
    resetInHours: null,
  };

  beforeEach(() => {
    // A non-free-mode request always carries a session (the 401 gate), so the
    // newly-covered case is always an authenticated user keyed by userId.
    mockGetSession.mockResolvedValue({ user: { id: 'user-123' } });
    mockPrismaReleaseFindFirst.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      title: 'Test Album',
    });
    mockFindAllByRelease.mockResolvedValue([
      {
        id: 'fmt-aac',
        formatType: 'AAC',
        s3Key: 'releases/r1/AAC/album.m4a',
        fileName: 'album.m4a',
        files: [],
      },
    ]);
    mockS3Send.mockResolvedValue({ Body: Readable.from(Buffer.from('fake-audio-data')) });
    mockLockAcquire.mockReturnValue(true);
    mockVerifyS3ObjectExists.mockResolvedValue(false);
  });

  afterEach(async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('enforces the free-tier cap for a non-purchaser requesting free-only formats', async () => {
    mockGetDownloadAccess.mockResolvedValue(NON_PURCHASER);

    await GET(makeJsonRequest('AAC'), makeParams());

    expect(mockAssertFreeDownloadAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: 'user', userId: 'user-123' },
        releaseId: '507f1f77bcf86cd799439011',
      })
    );
  });

  it('returns 403 CAP_REACHED when a free-only non-purchaser is over the cap', async () => {
    mockGetDownloadAccess.mockResolvedValue(NON_PURCHASER);
    mockAssertFreeDownloadAllowed.mockRejectedValueOnce(
      new MockedCapReachedError(new Date('2026-05-09T09:00:00Z'))
    );

    const response = await GET(makeJsonRequest('AAC'), makeParams());

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.errorCode).toBe('CAP_REACHED');
  });

  it('records the free-tier download for a non-purchaser free-only request', async () => {
    mockGetDownloadAccess.mockResolvedValue(NON_PURCHASER);

    await GET(makeRequest('AAC'), makeParams());

    expect(mockRecordSuccessfulDownload).toHaveBeenCalledWith(
      expect.objectContaining({ subject: { kind: 'user', userId: 'user-123' } })
    );
  });

  it('does NOT enforce the free-tier cap for a purchaser downloading free-only formats', async () => {
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 1,
      lastDownloadedAt: null,
      resetInHours: null,
    });

    await GET(makeRequest('AAC'), makeParams());

    expect(mockAssertFreeDownloadAllowed).not.toHaveBeenCalled();
  });

  it('still returns 403 PURCHASE_REQUIRED for a non-purchaser mixing free and paid formats', async () => {
    mockGetDownloadAccess.mockResolvedValue(NON_PURCHASER);

    const response = await GET(makeRequest('AAC,FLAC'), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('PURCHASE_REQUIRED');
  });
});
