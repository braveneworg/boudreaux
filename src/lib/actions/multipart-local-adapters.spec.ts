/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createHash } from 'node:crypto';

import {
  isLocalMultipartUpload,
  LOCAL_PART_SINK_PATH,
  localAbortUpload,
  localCompleteUpload,
  localObjectExists,
  localPartUploadUrl,
  localRecordPart,
  localStartUpload,
} from './multipart-local-adapters';

vi.mock('server-only', () => ({}));

const KEY_PREFIX = 'media/videos/aaaaaaaaaaaaaaaaaaaaaaaa/';

/** A distinct key per test — the completed-object map is process-wide. */
let keyCounter = 0;
const nextKey = (): string => {
  keyCounter += 1;
  return `${KEY_PREFIX}clip-${keyCounter}.mp4`;
};

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const md5Etag = (text: string): string =>
  `"${createHash('md5').update(bytes(text)).digest('hex')}"`;

describe('isLocalMultipartUpload', () => {
  it('is true when E2E_MODE is enabled', () => {
    vi.stubEnv('E2E_MODE', 'true');
    expect(isLocalMultipartUpload()).toBe(true);
  });

  it('is false when E2E_MODE is unset', () => {
    vi.stubEnv('E2E_MODE', '');
    expect(isLocalMultipartUpload()).toBe(false);
  });
});

describe('localStartUpload', () => {
  it('mints a distinct upload id per call', () => {
    const first = localStartUpload({ s3Key: nextKey() });
    const second = localStartUpload({ s3Key: nextKey() });
    expect(first).not.toBe(second);
  });
});

describe('localPartUploadUrl', () => {
  it('points at the sink route carrying the upload id and part number', () => {
    const url = localPartUploadUrl({ uploadId: 'upload-1', partNumber: 7 });
    expect(url).toBe(`${LOCAL_PART_SINK_PATH}?uploadId=upload-1&partNumber=7`);
  });

  it('percent-encodes an upload id with URL-significant characters', () => {
    const url = localPartUploadUrl({ uploadId: 'a&b=c', partNumber: 1 });
    expect(url).toContain('uploadId=a%26b%3Dc');
  });
});

describe('localRecordPart', () => {
  it('returns the quoted MD5 of the part body, the way S3 does', () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    const eTag = localRecordPart({ uploadId, partNumber: 1, body: bytes('part-one') });
    expect(eTag).toBe(md5Etag('part-one'));
  });

  it('returns null for an upload id it never issued', () => {
    const eTag = localRecordPart({ uploadId: 'never-issued', partNumber: 1, body: bytes('x') });
    expect(eTag).toBeNull();
  });
});

describe('localCompleteUpload', () => {
  it('returns the assembled size as the sum of the recorded part bodies', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    const first = localRecordPart({ uploadId, partNumber: 1, body: bytes('12345') });
    const second = localRecordPart({ uploadId, partNumber: 2, body: bytes('678') });

    const fileSize = localCompleteUpload({
      s3Key,
      uploadId,
      parts: [
        { partNumber: 1, eTag: first ?? '' },
        { partNumber: 2, eTag: second ?? '' },
      ],
    });

    expect(fileSize).toBe(8);
  });

  it('throws for an upload id it never issued rather than inventing a size', () => {
    expect(() =>
      localCompleteUpload({
        s3Key: nextKey(),
        uploadId: 'never-issued',
        parts: [{ partNumber: 1, eTag: '"abc"' }],
      })
    ).toThrow(/unknown upload id/i);
  });

  it('throws when the key does not match the one the upload was started for', () => {
    const uploadId = localStartUpload({ s3Key: nextKey() });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    expect(() =>
      localCompleteUpload({
        s3Key: nextKey(),
        uploadId,
        parts: [{ partNumber: 1, eTag: md5Etag('x') }],
      })
    ).toThrow(/does not match/i);
  });

  it('throws when a listed part was never uploaded', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    expect(() =>
      localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 2, eTag: md5Etag('x') }] })
    ).toThrow(/part 2/i);
  });

  it('throws when a listed ETag does not match the uploaded part', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    expect(() =>
      localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 1, eTag: '"deadbeef"' }] })
    ).toThrow(/etag/i);
  });

  it('consumes the upload id, so a replayed complete fails', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    const parts = [{ partNumber: 1, eTag: md5Etag('x') }];
    localCompleteUpload({ s3Key, uploadId, parts });
    expect(() => localCompleteUpload({ s3Key, uploadId, parts })).toThrow(/unknown upload id/i);
  });
});

describe('localObjectExists', () => {
  it('is false for a key whose upload never completed', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    expect(localObjectExists(s3Key)).toBe(false);
  });

  it('is true once the upload completes', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 1, eTag: md5Etag('x') }] });
    expect(localObjectExists(s3Key)).toBe(true);
  });
});

describe('localAbortUpload', () => {
  it('discards the upload so its parts can no longer be completed', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    localAbortUpload(uploadId);
    expect(() =>
      localCompleteUpload({ s3Key, uploadId, parts: [{ partNumber: 1, eTag: md5Etag('x') }] })
    ).toThrow(/unknown upload id/i);
  });

  it('leaves no object behind for the aborted key', () => {
    const s3Key = nextKey();
    const uploadId = localStartUpload({ s3Key });
    localRecordPart({ uploadId, partNumber: 1, body: bytes('x') });
    localAbortUpload(uploadId);
    expect(localObjectExists(s3Key)).toBe(false);
  });

  it('ignores an upload id it never issued', () => {
    expect(() => localAbortUpload('never-issued')).not.toThrow();
  });
});
