/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PassThrough, Readable } from 'node:stream';

import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/decorators/with-rate-limit', () => ({
  extractClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/config/rate-limit-tiers', () => ({
  downloadLimiter: { check: vi.fn().mockResolvedValue(undefined) },
  DOWNLOAD_LIMIT: 10,
}));

const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
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

const mockFindAllByRelease = vi.fn();
vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class MockRepo {
    findAllByRelease = mockFindAllByRelease;
  },
}));

const mockLogDownloadEvent = vi.fn();
vi.mock('@/lib/repositories/download-event-repository', () => ({
  DownloadEventRepository: class MockRepo {
    logDownloadEvent = mockLogDownloadEvent;
  },
}));

const mockS3Send = vi.fn();
const mockGeneratePresignedDownloadUrl = vi
  .fn()
  .mockResolvedValue('https://s3.example.com/presigned-bundle-url');
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => ({ send: mockS3Send }),
  getS3BucketName: () => 'test-bucket',
  generatePresignedDownloadUrl: (...args: unknown[]) => mockGeneratePresignedDownloadUrl(...args),
}));

const mockUploadDone = vi.fn().mockResolvedValue(undefined);
vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn().mockImplementation(function () {
    return { done: mockUploadDone };
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

// Mock archiver to avoid actual ZIP creation in tests
const mockAppend = vi.fn();
const mockFinalize = vi.fn();
vi.mock('archiver', () => ({
  default: () => {
    const passThrough = new PassThrough();
    // Attach mock methods
    (passThrough as PassThrough & { append: typeof mockAppend }).append = mockAppend;
    (passThrough as PassThrough & { finalize: (...args: unknown[]) => void }).finalize = (
      ...args: unknown[]
    ) => {
      mockFinalize(...args);
      passThrough.end(); // End the stream
    };
    return passThrough;
  },
}));

function makeRequest(formats = 'FLAC,WAV'): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/releases/507f1f77bcf86cd799439011/download/bundle?formats=${formats}`,
    {
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'test-agent',
      },
    }
  );
}

function makeParams(id = '507f1f77bcf86cd799439011') {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/releases/[id]/download/bundle', () => {
  beforeEach(() => {
    mockGetToken.mockResolvedValue({ sub: 'user-123' });
    mockGetDownloadAccess.mockResolvedValue({
      allowed: true,
      reason: null,
      downloadCount: 1,
      lastDownloadedAt: null,
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

  it('should return 401 when user is not authenticated', async () => {
    mockGetToken.mockResolvedValue(null);

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 401 when token has no sub', async () => {
    mockGetToken.mockResolvedValue({ sub: undefined });

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
    });

    const response = await GET(makeRequest(), makeParams());
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
    });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('DOWNLOAD_LIMIT');
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

  it('should delete temporary bundle when post-upload steps fail', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpsertDownloadCount.mockRejectedValueOnce(new Error('Post-upload write failed'));

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(
      mockS3Send.mock.calls.some(
        ([command]) =>
          (command as { constructor: { name: string } }).constructor.name === 'DeleteObjectCommand'
      )
    ).toBe(true);

    consoleSpy.mockRestore();
  });

  it('should log cleanup failure with original error context', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const postUploadError = new Error('Post-upload write failed');
    const cleanupError = new Error('Cleanup failed');

    mockUpsertDownloadCount.mockRejectedValueOnce(postUploadError);
    mockS3Send.mockImplementation((command: { constructor: { name: string } }) => {
      if (command.constructor.name === 'DeleteObjectCommand') {
        return Promise.reject(cleanupError);
      }

      return Promise.resolve({
        Body: Readable.from(Buffer.from('fake-audio-data')),
      });
    });

    const response = await GET(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to clean up temporary bundle after post-upload error',
      expect.objectContaining({
        originalError: postUploadError,
        cleanupError,
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

  it('should fetch and append S3 objects just-in-time', async () => {
    interface Deferred<T> {
      promise: Promise<T>;
      resolve: (value: T) => void;
    }

    const createDeferred = <T>(): Deferred<T> => {
      let resolve: ((value: T) => void) | undefined;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      if (!resolve) {
        throw new Error('Failed to create deferred resolver.');
      }
      return { promise, resolve };
    };

    const first = createDeferred<{ Body: Readable }>();
    const second = createDeferred<{ Body: Readable }>();
    const third = createDeferred<{ Body: Readable }>();
    const deferredResponses = [first, second, third];
    let callIndex = 0;

    mockS3Send.mockImplementation(() => deferredResponses[callIndex++].promise);

    const requestPromise = GET(makeRequest(), makeParams());
    await vi.waitFor(() => {
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });
    expect(mockAppend).not.toHaveBeenCalled();

    first.resolve({ Body: Readable.from(Buffer.from('file-1')) });
    await vi.waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    second.resolve({ Body: Readable.from(Buffer.from('file-2')) });
    await vi.waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(2);
      expect(mockS3Send).toHaveBeenCalledTimes(3);
    });

    third.resolve({ Body: Readable.from(Buffer.from('file-3')) });

    const response = await requestPromise;
    expect(response.status).toBe(302);
    expect(mockAppend).toHaveBeenCalledTimes(3);
  });

  it('should use secure cookie name when NODE_ENV is production and E2E_MODE is not true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_MODE', '');

    await GET(makeRequest(), makeParams());

    expect(mockGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieName: '__Secure-next-auth.session-token',
        secureCookie: true,
      })
    );

    vi.unstubAllEnvs();
  });

  it('should use non-secure cookie name when NODE_ENV is production but E2E_MODE is true', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_MODE', 'true');

    await GET(makeRequest(), makeParams());

    expect(mockGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieName: 'next-auth.session-token',
        secureCookie: false,
      })
    );

    vi.unstubAllEnvs();
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

    // FLAC is in FORMAT_LABELS so folder is 'FLAC'
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/01.flac' })
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
    expect(mockAppend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'FLAC/legacy.flac' })
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
});
