/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';

import { NextRequest } from 'next/server';

import { PUT } from './route';

// Polyfill ReadableStream for jsdom env
globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream;

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockValidateFileInfo = vi.fn();
vi.mock('@/lib/services/upload-service', () => {
  return {
    UploadService: class MockUploadService {
      validateFileInfo = mockValidateFileInfo;
    },
  };
});

const mockGetS3Client = vi.fn();
const mockGetS3BucketName = vi.fn();
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: (...args: unknown[]) => mockGetS3Client(...args),
  getS3BucketName: (...args: unknown[]) => mockGetS3BucketName(...args),
}));

const mockUploadDone = vi.fn();
const mockUploadOn = vi.fn();
vi.mock('@aws-sdk/lib-storage', () => {
  return {
    Upload: class MockUpload {
      done = mockUploadDone;
      on = mockUploadOn;
    },
  };
});

// Mock audio-metadata
const mockWriteComment = vi.fn();
const mockSupportsComment = vi.fn();
vi.mock('@/lib/audio-metadata', () => ({
  writeComment: (...args: unknown[]) => mockWriteComment(...args),
  supportsComment: (...args: unknown[]) => mockSupportsComment(...args),
}));

// Mock node:stream/promises (pipeline)
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:fs (createWriteStream, createReadStream)
vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({ on: vi.fn(), end: vi.fn() }),
  createReadStream: vi.fn().mockReturnValue(
    new Readable({
      read() {
        this.push(null);
      },
    })
  ),
}));

// Mock node:fs/promises (stat, unlink)
vi.mock('node:fs/promises', () => ({
  stat: vi.fn().mockResolvedValue({ size: 50_000_000 }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:os (tmpdir)
vi.mock('node:os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp'),
}));

// Mock node:path (join)
vi.mock('node:path', () => ({
  join: vi.fn((...parts: string[]) => parts.join('/')),
  extname: vi.fn((filePath: string) => {
    const dotIndex = filePath.lastIndexOf('.');
    return dotIndex >= 0 ? filePath.slice(dotIndex) : '';
  }),
}));

// Mock node:crypto (randomUUID)
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-1234'),
}));

// Mock Readable.fromWeb to avoid actual stream conversion
vi.spyOn(Readable, 'fromWeb').mockReturnValue(
  new Readable({
    read() {
      this.push(null);
    },
  })
);

function makeBody(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from('mock file data'));
      controller.close();
    },
  });
}

function makeRequest(overrides?: {
  headers?: Record<string, string>;
  noBody?: boolean;
}): NextRequest {
  const defaultHeaders: Record<string, string> = {
    'x-file-name': encodeURIComponent('album.mp3'),
    'x-file-size': '50000000',
    'content-type': 'audio/mpeg',
  };

  const headers = { ...defaultHeaders, ...overrides?.headers };

  return new NextRequest('http://localhost:3000/api/releases/release-1/upload/MP3_320KBPS', {
    method: 'PUT',
    headers,
    body: overrides?.noBody ? undefined : (makeBody() as unknown as string),
    duplex: 'half',
  });
}

function makeParams(id = 'release-1', formatType = 'MP3_320KBPS') {
  return { params: Promise.resolve({ id, formatType }) };
}

describe('PUT /api/releases/[id]/upload/[formatType]', () => {
  const originalHostName = process.env.NEXT_PUBLIC_HOST_NAME;
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  beforeEach(() => {
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' },
    });
    mockValidateFileInfo.mockReturnValue({ valid: true });
    mockGetS3Client.mockReturnValue({ send: vi.fn() });
    mockGetS3BucketName.mockReturnValue('test-bucket');
    mockUploadDone.mockResolvedValue({});
    mockUploadOn.mockReturnValue(undefined);
    mockWriteComment.mockResolvedValue(undefined);
    mockSupportsComment.mockReturnValue(true);
    process.env.NEXT_PUBLIC_HOST_NAME = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://fallback.example.com';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_HOST_NAME = originalHostName;
    process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
  });

  it('should return 401 when user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 401 when user is not admin', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', role: 'user', email: 'user@test.com' },
    });

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('should return 400 for invalid format type', async () => {
    const response = await PUT(makeRequest(), makeParams('release-1', 'INVALID_FORMAT'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_FORMAT');
  });

  it('should return 400 when file name header is missing', async () => {
    const response = await PUT(
      new NextRequest('http://localhost:3000/api/releases/release-1/upload/MP3_320KBPS', {
        method: 'PUT',
        headers: { 'x-file-size': '50000000', 'content-type': 'audio/mpeg' },
        body: makeBody() as unknown as string,
        duplex: 'half',
      }),
      makeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('MISSING_METADATA');
  });

  it('should return 400 when file size is invalid (NaN)', async () => {
    const response = await PUT(
      makeRequest({ headers: { 'x-file-size': 'not-a-number' } }),
      makeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_SIZE');
  });

  it('should return 400 when file size is zero', async () => {
    const response = await PUT(makeRequest({ headers: { 'x-file-size': '0' } }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_SIZE');
  });

  it('should return 400 when file size is negative', async () => {
    const response = await PUT(makeRequest({ headers: { 'x-file-size': '-100' } }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('INVALID_SIZE');
  });

  it('should return 400 when validation fails', async () => {
    mockValidateFileInfo.mockReturnValue({ valid: false, error: 'File exceeds size limit' });

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('should return 200 on successful upload', async () => {
    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.s3Key).toContain('releases/release-1/digital-formats/MP3_320KBPS/');
    expect(body.contentType).toBe('audio/mpeg');
  });

  it('should include trackNumber when x-track-number header is provided', async () => {
    const response = await PUT(makeRequest({ headers: { 'x-track-number': '3' } }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.trackNumber).toBe(3);
    expect(body.s3Key).toContain('tracks/3-');
  });

  it('should decode URI-encoded file names', async () => {
    const response = await PUT(
      makeRequest({ headers: { 'x-file-name': encodeURIComponent('My Album (Deluxe).mp3') } }),
      makeParams()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.s3Key).toContain('My-Album--Deluxe-.mp3');
  });

  it('should return 500 on unexpected error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadDone.mockRejectedValue(new Error('S3 upload failed'));

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Upload failed. Please try again.');

    consoleSpy.mockRestore();
  });

  it('should handle non-Error throw in error handler', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUploadDone.mockRejectedValue('string error');

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe('Upload failed. Please try again.');

    consoleSpy.mockRestore();
  });

  it('should return 400 when request body is empty', async () => {
    const response = await PUT(makeRequest({ noBody: true }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('NO_BODY');
    expect(body.message).toBe('Request body is empty.');
  });

  it('should use default mime type when content-type header is empty', async () => {
    const response = await PUT(makeRequest({ headers: { 'content-type': '' } }), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('should return undefined trackNumber when x-track-number header is absent', async () => {
    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.trackNumber).toBeUndefined();
  });

  it('should register httpUploadProgress handler', async () => {
    await PUT(makeRequest(), makeParams());

    expect(mockUploadOn).toHaveBeenCalledWith('httpUploadProgress', expect.any(Function));
  });

  it('should handle progress callback with loaded bytes', async () => {
    mockUploadOn.mockImplementation(
      (event: string, callback: (progress: { loaded?: number }) => void) => {
        if (event === 'httpUploadProgress') {
          callback({ loaded: 25000000 });
        }
      }
    );
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await PUT(makeRequest(), makeParams());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('progress'));
    consoleSpy.mockRestore();
  });

  it('should handle progress callback without loaded property', async () => {
    mockUploadOn.mockImplementation(
      (event: string, callback: (progress: { loaded?: number }) => void) => {
        if (event === 'httpUploadProgress') {
          callback({});
        }
      }
    );
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await PUT(makeRequest(), makeParams());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('progress'));
    consoleSpy.mockRestore();
  });

  it('should call writeComment during upload', async () => {
    await PUT(makeRequest(), makeParams());

    expect(mockSupportsComment).toHaveBeenCalledWith('/tmp/upload-test-uuid-1234.mp3');
    expect(mockWriteComment).toHaveBeenCalledWith(
      '/tmp/upload-test-uuid-1234.mp3',
      'Visit https://example.com/'
    );
  });

  it('should skip writeComment for formats that do not support comments (e.g. WAV)', async () => {
    mockSupportsComment.mockReturnValue(false);

    const response = await PUT(
      makeRequest({
        headers: {
          'x-file-name': encodeURIComponent('album.wav'),
          'content-type': 'audio/wav',
        },
      }),
      makeParams('release-1', 'WAV')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockSupportsComment).toHaveBeenCalledWith('/tmp/upload-test-uuid-1234.wav');
    expect(mockWriteComment).not.toHaveBeenCalled();
  });

  it('should use NEXT_PUBLIC_BASE_URL when NEXT_PUBLIC_HOST_NAME is missing', async () => {
    delete process.env.NEXT_PUBLIC_HOST_NAME;

    await PUT(makeRequest(), makeParams());

    expect(mockWriteComment).toHaveBeenCalledWith(
      '/tmp/upload-test-uuid-1234.mp3',
      'Visit https://fallback.example.com/'
    );
  });

  it('should return 500 when NEXT_PUBLIC_HOST_NAME and NEXT_PUBLIC_BASE_URL are missing', async () => {
    delete process.env.NEXT_PUBLIC_HOST_NAME;
    delete process.env.NEXT_PUBLIC_BASE_URL;

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('SERVER_CONFIGURATION_ERROR');
    expect(body.message).toBe(
      'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL is not set.'
    );
  });

  it('should return 500 when NEXT_PUBLIC_HOST_NAME and NEXT_PUBLIC_BASE_URL are invalid', async () => {
    process.env.NEXT_PUBLIC_HOST_NAME = 'not-a-url';
    process.env.NEXT_PUBLIC_BASE_URL = 'also-not-a-url';

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('SERVER_CONFIGURATION_ERROR');
    expect(body.message).toBe(
      'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL must be a valid absolute URL.'
    );
  });

  it('should return 500 when writeComment throws', async () => {
    mockWriteComment.mockRejectedValue(new Error('Unsupported format'));

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it('should show "?" progress percentage when actualFileSize is zero', async () => {
    const { stat } = await import('node:fs/promises');
    vi.mocked(stat).mockResolvedValue({ size: 0 } as never);
    mockUploadOn.mockImplementation(
      (event: string, callback: (progress: { loaded?: number }) => void) => {
        if (event === 'httpUploadProgress') {
          callback({ loaded: 100 });
        }
      }
    );
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await PUT(makeRequest(), makeParams());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('?%'));
    consoleSpy.mockRestore();
  });

  it('should handle non-Error throw during temp file cleanup', async () => {
    const { unlink } = await import('node:fs/promises');
    vi.mocked(unlink).mockRejectedValue('string cleanup error');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[upload-proxy] Failed to clean up temp file',
      expect.objectContaining({ error: 'string cleanup error' })
    );

    warnSpy.mockRestore();
  });

  it('should log Error details during temp file cleanup failure', async () => {
    const { unlink } = await import('node:fs/promises');
    vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await PUT(makeRequest(), makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[upload-proxy] Failed to clean up temp file',
      expect.objectContaining({
        error: expect.objectContaining({ message: 'ENOENT' }),
      })
    );

    warnSpy.mockRestore();
  });
});
