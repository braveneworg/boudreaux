/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';

import { NextRequest } from 'next/server';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PUT } from './route';

// Polyfill ReadableStream for jsdom env
globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream;

const mockAuth = vi.fn();
vi.mock('../../../../../../../auth', () => ({
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' },
    });
    mockValidateFileInfo.mockReturnValue({ valid: true });
    mockGetS3Client.mockReturnValue({ send: vi.fn() });
    mockGetS3BucketName.mockReturnValue('test-bucket');
    mockUploadDone.mockResolvedValue({});
    mockUploadOn.mockReturnValue(undefined);
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
    expect(body.message).toBe('S3 upload failed');

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
});
