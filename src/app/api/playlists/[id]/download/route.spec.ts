/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { freeDownloadLockService } from '@/lib/services/free-download-lock-service';
import { PlaylistService } from '@/lib/services/playlist-service';
import type { PlaylistDownloadManifest } from '@/lib/services/playlist-service';
import type * as ZipStreamModule from '@/lib/utils/zip-stream';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));

vi.mock('@/lib/services/playlist-service', () => ({
  PlaylistService: { getDownloadManifest: vi.fn() },
}));

const { checkFreeDownloadQuotaMock, incrementQuotaMock } = vi.hoisted(() => ({
  checkFreeDownloadQuotaMock: vi.fn(),
  incrementQuotaMock: vi.fn(),
}));
vi.mock('@/lib/services/quota-enforcement-service', () => ({
  QuotaEnforcementService: class {
    checkFreeDownloadQuota = checkFreeDownloadQuotaMock;
    incrementQuota = incrementQuotaMock;
  },
}));

const { limiterCheckMock } = vi.hoisted(() => ({ limiterCheckMock: vi.fn() }));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: limiterCheckMock },
  DOWNLOAD_LIMIT: 10,
}));

vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: vi.fn(() => ({ send: vi.fn() })),
  getS3BucketName: vi.fn(() => 'test-bucket'),
}));

const { startBufferPrefetchMock, issuePrefetchMock } = vi.hoisted(() => ({
  startBufferPrefetchMock: vi.fn(),
  issuePrefetchMock: vi.fn(),
}));
vi.mock('@/lib/utils/zip-stream', async () => {
  const actual = await vi.importActual<typeof ZipStreamModule>('@/lib/utils/zip-stream');
  return {
    ...actual,
    startBufferPrefetch: startBufferPrefetchMock,
    issuePrefetch: issuePrefetchMock,
  };
});

const PLAYLIST_ID = '507f1f77bcf86cd799439011';
const LOCK_KEY = `user:user-1|playlist:${PLAYLIST_ID}|AAC`;

const manifest: PlaylistDownloadManifest = {
  playlistTitle: 'Morning Mix!',
  tracks: [
    {
      entryName: '01 - Ceschi - Cold Wind.aac',
      s3Key: 'releases/r1/digital-formats/AAC/t1.aac',
      releaseId: 'r1',
    },
    {
      entryName: '02 - Sole - Battlefields.aac',
      s3Key: 'releases/r2/digital-formats/AAC/t2.aac',
      releaseId: 'r2',
    },
  ],
  skippedCount: 1,
  distinctReleaseIds: ['r1', 'r2'],
};

const withinQuota = {
  allowed: true,
  reason: 'WITHIN_QUOTA',
  remainingQuota: 3,
  uniqueDownloads: 1,
} as const;
const alreadyDownloaded = {
  allowed: true,
  reason: 'ALREADY_DOWNLOADED',
  remainingQuota: 4,
  uniqueDownloads: 1,
} as const;
const exceeded = {
  allowed: false,
  reason: 'QUOTA_EXCEEDED',
  remainingQuota: 0,
  uniqueDownloads: 5,
} as const;

const makeRequest = (query: string): NextRequest =>
  new NextRequest(`http://localhost:3000/api/playlists/${PLAYLIST_ID}/download?${query}`);
const makeContext = (id: string = PLAYLIST_ID): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  mockAuth.mockResolvedValue({ user: { id: 'user-1', role: 'user' } });
  limiterCheckMock.mockResolvedValue(undefined);
  vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue(manifest);
  checkFreeDownloadQuotaMock.mockResolvedValue(withinQuota);
  incrementQuotaMock.mockResolvedValue(undefined);
  startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
    keys.slice(0, 4).map(() => Promise.resolve(Buffer.from('audio-bytes')))
  );
  issuePrefetchMock.mockResolvedValue(Buffer.from('audio-bytes'));
  freeDownloadLockService.release(LOCK_KEY);
});

describe('GET /api/playlists/[id]/download', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(401);
  });

  it('returns 429 when the download limiter rejects', async () => {
    limiterCheckMock.mockRejectedValueOnce(new Error('rate limited'));
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(429);
  });

  it('returns 400 for a non-free format', async () => {
    const response = await GET(makeRequest('format=FLAC'), makeContext());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'INVALID_FORMAT' });
  });

  it('returns 404 for a malformed id without calling the service', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext('nope'));
    expect(response.status).toBe(404);
    expect(PlaylistService.getDownloadManifest).not.toHaveBeenCalled();
  });

  it('returns 404 when the manifest is null (missing or private-unowned)', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue(null);
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'NOT_FOUND' });
  });

  it('preflight MP3 reports counts without consulting the quota', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS&respond=preflight'), makeContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, trackCount: 2, skippedCount: 1 });
    expect(checkFreeDownloadQuotaMock).not.toHaveBeenCalled();
  });

  it('preflight AAC checks every distinct release and never charges', async () => {
    const response = await GET(makeRequest('format=AAC&respond=preflight'), makeContext());
    expect(response.status).toBe(200);
    expect(checkFreeDownloadQuotaMock).toHaveBeenCalledTimes(2);
    expect(checkFreeDownloadQuotaMock).toHaveBeenCalledWith(
      { kind: 'user', userId: 'user-1' },
      'r1'
    );
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('preflight AAC returns 403 QUOTA_EXCEEDED when any release is denied', async () => {
    checkFreeDownloadQuotaMock.mockResolvedValueOnce(withinQuota).mockResolvedValueOnce(exceeded);
    const response = await GET(makeRequest('format=AAC&respond=preflight'), makeContext());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, reason: 'QUOTA_EXCEEDED' });
  });

  it('rejects all-or-nothing when remaining quota cannot cover every new release', async () => {
    // remaining slot = 1, but 2 not-yet-downloaded releases → deny outright.
    const lastSlot = {
      allowed: true,
      reason: 'WITHIN_QUOTA',
      remainingQuota: 0,
      uniqueDownloads: 4,
    } as const;
    checkFreeDownloadQuotaMock.mockResolvedValue(lastSlot);
    const response = await GET(makeRequest('format=AAC&respond=preflight'), makeContext());
    expect(response.status).toBe(403);
  });

  it('streams an AAC zip, charging only WITHIN_QUOTA releases after the first buffer', async () => {
    checkFreeDownloadQuotaMock
      .mockResolvedValueOnce(alreadyDownloaded) // r1 — allowed, not charged
      .mockResolvedValueOnce(withinQuota); // r2 — charged
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes('01 - Ceschi - Cold Wind.aac')).toBe(true);
    expect(incrementQuotaMock).toHaveBeenCalledTimes(1);
    expect(incrementQuotaMock).toHaveBeenCalledWith({ kind: 'user', userId: 'user-1' }, 'r2');
    // Lock released after the handler returned.
    expect(freeDownloadLockService.acquire(LOCK_KEY)).toBe(true);
    freeDownloadLockService.release(LOCK_KEY);
  });

  it('returns 409 LOCK_HELD when a concurrent AAC download holds the lock', async () => {
    expect(freeDownloadLockService.acquire(LOCK_KEY)).toBe(true);
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ errorCode: 'LOCK_HELD' });
    freeDownloadLockService.release(LOCK_KEY);
  });

  it('streams MP3 with a sanitized attachment filename and no quota calls', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('Morning Mix.zip');
    await response.arrayBuffer();
    expect(checkFreeDownloadQuotaMock).not.toHaveBeenCalled();
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('collapses an interior newline in the title to a valid Content-Disposition', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue({
      ...manifest,
      playlistTitle: 'My\nMix',
    });
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    // A raw newline would make undici throw "invalid header value" → 500.
    expect(response.status).toBe(200);
    const disposition = response.headers.get('content-disposition');
    expect(disposition).not.toBeNull();
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).toContain('My Mix.zip');
    await response.arrayBuffer();
  });

  it('does not charge when the first prefetched buffer is missing', async () => {
    startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
      keys.slice(0, 4).map(() => Promise.resolve(null))
    );
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('aborts the archive when a later buffer fails mid-stream (no hang)', async () => {
    // First buffer resolves, second rejects (e.g. S3 NoSuchKey mid-playlist).
    // Charge-after-first-buffer rule: the first body was in hand when the
    // charge committed, so the charge STANDS — no refund on mid-stream failure.
    startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
      keys.slice(0, 4).map((_key, index) => {
        if (index === 0) return Promise.resolve(Buffer.from('audio-bytes'));
        const failing = Promise.reject(new Error('NoSuchKey'));
        failing.catch(() => {}); // passive handler, matching issuePrefetch's contract
        return failing;
      })
    );
    const response = await GET(makeRequest('format=AAC'), makeContext());
    // Headers were already committed before the failure surfaced.
    expect(response.status).toBe(200);
    // The drive catches the rejection, archive.abort()s, and ends the response
    // PassThrough — the body TERMINATES (no hang) but the zip is left
    // unfinalized: no end-of-central-directory record (PK\x05\x06), so a
    // client sees a corrupt/incomplete archive, never a silent success.
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
    // Both distinct releases were charged before streaming began.
    expect(incrementQuotaMock).toHaveBeenCalledTimes(2);
  });

  it('returns 404 NO_TRACKS on the stream path for an empty manifest but 200 on preflight', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue({
      playlistTitle: 'Empty',
      tracks: [],
      skippedCount: 3,
      distinctReleaseIds: [],
    });
    const stream = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(stream.status).toBe(404);
    expect(await stream.json()).toEqual({ error: 'NO_TRACKS' });
    const preflight = await GET(makeRequest('format=MP3_320KBPS&respond=preflight'), makeContext());
    expect(preflight.status).toBe(200);
    expect(await preflight.json()).toEqual({ ok: true, trackCount: 0, skippedCount: 3 });
  });

  it('returns 500 when the service throws', async () => {
    vi.mocked(PlaylistService.getDownloadManifest).mockRejectedValue(new Error('db down'));
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'INTERNAL_ERROR' });
  });

  it('skips the rate limiter in E2E mode', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    limiterCheckMock.mockRejectedValue(new Error('rate limited'));
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(200);
    expect(limiterCheckMock).not.toHaveBeenCalled();
    await response.arrayBuffer();
    vi.unstubAllEnvs();
  });

  it('does not charge when the FIRST prefetched buffer rejects (S3 failure)', async () => {
    // The charge-after-first-buffer rule: a rejected first body is coalesced
    // to null so an all-failing download never consumes quota.
    startBufferPrefetchMock.mockImplementation((_c, _b, keys: readonly string[]) =>
      keys.slice(0, 4).map(() => {
        const failing = Promise.reject(new Error('NoSuchKey'));
        failing.catch(() => {});
        return failing;
      })
    );
    const response = await GET(makeRequest('format=AAC'), makeContext());
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(incrementQuotaMock).not.toHaveBeenCalled();
  });

  it('refills the prefetch window for a playlist longer than the depth', async () => {
    const longTracks = Array.from({ length: 6 }, (_v, index) => ({
      entryName: `${index}.mp3`,
      s3Key: `releases/r1/digital-formats/MP3/t${index}.mp3`,
      releaseId: 'r1',
    }));
    vi.mocked(PlaylistService.getDownloadManifest).mockResolvedValue({
      ...manifest,
      tracks: longTracks,
      distinctReleaseIds: ['r1'],
    });
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    // 6 tracks with a depth of 4 → 2 later keys are refilled via issuePrefetch.
    expect(issuePrefetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the archive when the response stream is cancelled', async () => {
    const response = await GET(makeRequest('format=MP3_320KBPS'), makeContext());
    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();
    await response.body?.cancel();
    // Cancelling the web stream tears down the pipeline without throwing.
    expect(response.bodyUsed).toBe(true);
  });
});
