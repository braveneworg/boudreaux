// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import {
  localCompleteUpload,
  localObjectExists,
  localStartUpload,
} from '@/lib/actions/multipart-local-adapters';

import { PUT } from './route';

vi.mock('server-only', () => ({}));

const S3_KEY_PREFIX = 'media/videos/bbbbbbbbbbbbbbbbbbbbbbbb/';

let keyCounter = 0;
const nextKey = (): string => {
  keyCounter += 1;
  return `${S3_KEY_PREFIX}sink-${keyCounter}.mp4`;
};

interface SinkRequestArgs {
  uploadId?: string;
  partNumber?: string;
  body?: string;
  contentLength?: string;
}

const sinkRequest = ({
  uploadId,
  partNumber,
  body,
  contentLength,
}: SinkRequestArgs): NextRequest => {
  const url = new URL('http://127.0.0.1:3099/api/test-harness/multipart-sink');
  if (uploadId !== undefined) url.searchParams.set('uploadId', uploadId);
  if (partNumber !== undefined) url.searchParams.set('partNumber', partNumber);
  const headers = new Headers();
  if (contentLength !== undefined) headers.set('content-length', contentLength);
  return new NextRequest(url, { method: 'PUT', body: body ?? '', headers });
};

beforeEach(() => {
  vi.stubEnv('E2E_MODE', 'true');
});

describe('PUT /api/test-harness/multipart-sink — production gate', () => {
  it('404s when E2E_MODE is not enabled', async () => {
    vi.stubEnv('E2E_MODE', '');
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'bytes' }));
    expect(response.status).toBe(404);
  });

  it('records nothing when it 404s', async () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    vi.stubEnv('E2E_MODE', '');
    await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'bytes' }));
    expect(() =>
      localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 1, eTag: 'x' }] })
    ).toThrow(/never uploaded/i);
  });
});

describe('PUT /api/test-harness/multipart-sink — part delivery', () => {
  it('accepts a part for a known upload', async () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'part-bytes' }));
    expect(response.status).toBe(200);
  });

  it('returns a quoted MD5 ETag header the uploader can collect', async () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'part-bytes' }));
    expect(response.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it('makes the part completable at its delivered size', async () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'twelve bytes' }));
    const eTag = response.headers.get('ETag') ?? '';
    expect(localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 1, eTag }] })).toBe(12);
  });

  it('makes the assembled object visible to the existence check', async () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'abc' }));
    localCompleteUpload({
      s3Key,
      uploadId,
      parts: [{ partNumber: 1, eTag: response.headers.get('ETag') ?? '' }],
    });
    expect(localObjectExists(s3Key)).toBe(true);
  });

  it('never caches the response', async () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '1', body: 'abc' }));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('PUT /api/test-harness/multipart-sink — rejected requests', () => {
  it('409s for an upload id it was never told about', async () => {
    const response = await PUT(
      sinkRequest({ uploadId: 'never-issued', partNumber: '1', body: 'abc' })
    );
    expect(response.status).toBe(409);
  });

  it('400s when the upload id is missing', async () => {
    const response = await PUT(sinkRequest({ partNumber: '1', body: 'abc' }));
    expect(response.status).toBe(400);
  });

  it('400s when the part number is not a positive integer', async () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(sinkRequest({ uploadId, partNumber: '0', body: 'abc' }));
    expect(response.status).toBe(400);
  });

  it('400s when the part number is not a number at all', async () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(sinkRequest({ uploadId, partNumber: 'one', body: 'abc' }));
    expect(response.status).toBe(400);
  });

  it('413s a declared body larger than one part, without reading it', async () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const response = await PUT(
      sinkRequest({ uploadId, partNumber: '1', body: 'abc', contentLength: String(1024 ** 4) })
    );
    expect(response.status).toBe(413);
  });
});
