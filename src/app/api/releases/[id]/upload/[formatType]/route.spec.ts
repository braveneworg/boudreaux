/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NextRequest } from 'next/server';

import NodeID3 from 'node-id3';

import { readLocalFormatObject } from '@/lib/services/format-upload/format-object-store';
import { loggers } from '@/lib/utils/logger';

import { PUT } from './route';

// The real format upload module runs behind this route, sending files to the
// local object store (`E2E_MODE`); only the session is mocked.
const mockAuth = vi.fn();
vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const RELEASE_ID = '507f1f77bcf86cd799439011';
const MP3_FIXTURE = join(process.cwd(), 'public/e2e/audio/e2e-track-320.mp3');
const WAV_BYTES = new Uint8Array([82, 73, 70, 70]);

const streamOf = (bytes: Uint8Array): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

interface RequestOptions {
  formatType?: string;
  headers?: Record<string, string>;
  body?: ReadableStream<Uint8Array> | null;
  signal?: AbortSignal;
}

/** A PUT of a small WAV unless the options say otherwise. */
const makeRequest = ({ formatType = 'WAV', headers, body, signal }: RequestOptions = {}) =>
  new NextRequest(`http://localhost:3000/api/releases/${RELEASE_ID}/upload/${formatType}`, {
    method: 'PUT',
    headers: {
      'x-file-name': encodeURIComponent('take.wav'),
      'x-file-size': String(WAV_BYTES.byteLength),
      'content-type': 'audio/wav',
      ...headers,
    },
    body: body === undefined ? streamOf(WAV_BYTES) : body,
    duplex: 'half',
    ...(signal && { signal }),
  } as ConstructorParameters<typeof NextRequest>[1]);

const put = (options: RequestOptions = {}) =>
  PUT(makeRequest(options), {
    params: Promise.resolve({ id: RELEASE_ID, formatType: options.formatType ?? 'WAV' }),
  });

beforeEach(() => {
  mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' } });
  vi.stubEnv('E2E_MODE', 'true');
  vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://example.com');
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://fallback.example.com');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /api/releases/[id]/upload/[formatType]', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await put();

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Authentication required');
  });

  it('returns 403 for a non-admin', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1', role: 'user', email: 'u@test.com' } });

    const response = await put();

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('Insufficient permissions');
  });

  it('stores an MP3 under the key shape, tagged with the Visit comment', async () => {
    const bytes = await readFile(MP3_FIXTURE);

    const response = await put({
      formatType: 'MP3_320KBPS',
      headers: {
        'x-file-name': encodeURIComponent('album.mp3'),
        'x-file-size': String(bytes.byteLength),
        'content-type': 'audio/mpeg',
      },
      body: streamOf(bytes),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      s3Key: expect.stringMatching(
        /^releases\/507f1f77bcf86cd799439011\/digital-formats\/MP3_320KBPS\/\d+-album\.mp3$/
      ),
      contentType: 'audio/mpeg',
    });
    const stored = readLocalFormatObject(body.s3Key);
    expect(NodeID3.read(stored?.body ?? Buffer.alloc(0)).comment?.text).toBe(
      'Visit https://example.com/'
    );
  });

  it('decodes a URI-encoded file name into the key', async () => {
    const response = await put({
      headers: { 'x-file-name': encodeURIComponent('My Album (Deluxe).wav') },
    });

    expect((await response.json()).s3Key).toMatch(/\/WAV\/\d+-My-Album--Deluxe-\.wav$/);
  });

  it('ignores an x-track-number header: the key has no track segment', async () => {
    const response = await put({ headers: { 'x-track-number': '3' } });
    const body = await response.json();

    expect(body.s3Key).not.toContain('tracks/');
    expect(body).not.toHaveProperty('trackNumber');
  });

  it('refuses an unknown format type', async () => {
    const response = await put({ formatType: 'INVALID_FORMAT' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'INVALID_FORMAT',
      message: 'Invalid digital format type.',
    });
  });

  it.each(['x-file-name', 'x-file-size'])('refuses a request without %s', async (header) => {
    const request = makeRequest();
    request.headers.delete(header);

    const response = await PUT(request, {
      params: Promise.resolve({ id: RELEASE_ID, formatType: 'WAV' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'MISSING_METADATA',
      message: 'x-file-name and x-file-size headers are required.',
    });
  });

  it.each(['not-a-number', '0', '-100'])('refuses an x-file-size of %s', async (size) => {
    const response = await put({ headers: { 'x-file-size': size } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'INVALID_SIZE',
      message: 'x-file-size must be a positive integer.',
    });
  });

  it('answers a file the format does not take as VALIDATION_FAILED', async () => {
    const response = await put({ headers: { 'content-type': 'audio/mpeg' } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Invalid MIME type. Expected: audio/wav, audio/x-wav, audio/wave',
    });
  });

  it('answers a request without a content type as VALIDATION_FAILED', async () => {
    const request = makeRequest();
    request.headers.delete('content-type');

    const response = await PUT(request, {
      params: Promise.resolve({ id: RELEASE_ID, formatType: 'WAV' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'VALIDATION_FAILED',
      message: 'Invalid MIME type. Expected: audio/wav, audio/x-wav, audio/wave',
    });
  });

  it('refuses a request without a body', async () => {
    const response = await put({ body: null });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'NO_BODY',
      message: 'Request body is empty.',
    });
  });

  it('answers a missing base URL as SERVER_CONFIGURATION_ERROR', async () => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', undefined);
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', undefined);
    vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    const response = await put();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'SERVER_CONFIGURATION_ERROR',
      message:
        'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL is not set.',
    });
  });

  it('answers a failed transfer as INTERNAL_ERROR', async () => {
    vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('socket hang up'));
      },
    });

    const response = await put({ body });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Upload failed. Please try again.',
    });
  });

  it('answers an unexpected failure, such as a malformed file name, as INTERNAL_ERROR', async () => {
    vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});

    const response = await put({ headers: { 'x-file-name': '%E0%A4%A' } });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Upload failed. Please try again.',
    });
  });

  it('hands the request signal over: an aborted request stores nothing', async () => {
    vi.spyOn(loggers.s3, 'error').mockImplementation(() => {});
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_002);
    const controller = new AbortController();
    controller.abort();

    const response = await put({ signal: controller.signal });

    expect(response.status).toBe(500);
    expect(
      readLocalFormatObject(`releases/${RELEASE_ID}/digital-formats/WAV/1700000000002-take.wav`)
    ).toBeNull();
  });
});
