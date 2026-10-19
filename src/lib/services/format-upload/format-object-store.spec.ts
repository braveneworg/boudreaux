/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loggers } from '@/lib/utils/logger';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';

import {
  formatObjectStore,
  localFormatObjectStore,
  readLocalFormatObject,
  s3FormatObjectStore,
} from './format-object-store';

import type { FormatObjectPut } from './types';
import type { Readable } from 'node:stream';

vi.mock('server-only', () => ({}));

/** What the S3 adapter handed lib-storage, and the controls a test drives it with. */
const upload = vi.hoisted(() => ({
  options: [] as Array<{
    params: {
      Bucket: string;
      Key: string;
      Body: unknown;
      ContentType: string;
      ContentLength: number;
    };
    partSize: number;
    queueSize: number;
    leavePartsOnError: boolean;
  }>,
  progress: undefined as ((progress: { loaded?: number }) => void) | undefined,
  done: vi.fn(),
  abort: vi.fn(),
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(options: (typeof upload.options)[number]) {
      upload.options.push(options);
    }
    on(event: string, handler: (progress: { loaded?: number }) => void): void {
      if (event === 'httpUploadProgress') upload.progress = handler;
    }
    done = upload.done;
    abort = upload.abort;
  },
}));

vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => ({ client: 's3' }),
  getS3BucketName: () => 'format-bucket',
  verifyS3ObjectExists: vi.fn(),
  deleteS3Object: vi.fn(),
}));

let dir = '';
let filePath = '';

const putOf = (overrides: Partial<FormatObjectPut> = {}): FormatObjectPut => ({
  s3Key: 'releases/r1/digital-formats/FLAC/1-one.flac',
  filePath,
  contentType: 'audio/flac',
  contentLength: 4,
  signal: new AbortController().signal,
  ...overrides,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'format-object-store-'));
  filePath = join(dir, 'one.flac');
  await writeFile(filePath, Buffer.from([1, 2, 3, 4]));
  upload.options.length = 0;
  upload.progress = undefined;
  upload.done.mockReset().mockResolvedValue({});
  upload.abort.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  upload.options.forEach(({ params }) => (params.Body as Readable).destroy());
  await rm(dir, { recursive: true, force: true });
});

describe('s3FormatObjectStore', () => {
  it('sends the file through a multipart Upload with 10 MB parts, four at a time', async () => {
    await s3FormatObjectStore.put(putOf());

    expect(upload.options).toEqual([
      {
        client: { client: 's3' },
        params: {
          Bucket: 'format-bucket',
          Key: 'releases/r1/digital-formats/FLAC/1-one.flac',
          Body: expect.objectContaining({ path: filePath }),
          ContentType: 'audio/flac',
          ContentLength: 4,
        },
        partSize: 10 * 1024 * 1024,
        queueSize: 4,
        leavePartsOnError: false,
      },
    ]);
  });

  it('aborts the upload when the signal fires', async () => {
    const controller = new AbortController();
    upload.done.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          upload.abort.mockImplementationOnce(async () => reject(new Error('Upload aborted.')));
        })
    );

    const put = s3FormatObjectStore.put(putOf({ signal: controller.signal }));
    controller.abort();

    await expect(put).rejects.toThrow('Upload aborted.');
    expect(upload.abort).toHaveBeenCalledTimes(1);
  });

  it('starts nothing for a signal that has already fired', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(s3FormatObjectStore.put(putOf({ signal: controller.signal }))).rejects.toThrow();
    expect(upload.options).toEqual([]);
  });

  it('logs the progress of the transfer', async () => {
    const info = vi.spyOn(loggers.s3, 'info').mockImplementation(() => {});
    upload.done.mockImplementationOnce(async () => {
      upload.progress?.({ loaded: 2 });
      upload.progress?.({});
    });

    await s3FormatObjectStore.put(putOf());

    expect(info.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('progress 50.0%'),
      expect.stringContaining('progress 0.0%'),
    ]);
  });

  it('logs an unknown percentage for an empty file', async () => {
    const info = vi.spyOn(loggers.s3, 'info').mockImplementation(() => {});
    upload.done.mockImplementationOnce(async () => upload.progress?.({ loaded: 0 }));

    await s3FormatObjectStore.put(putOf({ contentLength: 0 }));

    expect(info).toHaveBeenCalledWith(expect.stringContaining('progress ?%'));
  });

  it('checks and deletes objects through the S3 client helpers', async () => {
    vi.mocked(verifyS3ObjectExists).mockResolvedValueOnce(true);
    vi.mocked(deleteS3Object).mockResolvedValueOnce(true);

    const exists = await s3FormatObjectStore.exists('releases/r1/digital-formats/FLAC/a.flac');
    const deleted = await s3FormatObjectStore.delete('releases/r1/digital-formats/FLAC/a.flac');

    expect([exists, deleted]).toEqual([true, true]);
    expect(verifyS3ObjectExists).toHaveBeenCalledWith('releases/r1/digital-formats/FLAC/a.flac');
    expect(deleteS3Object).toHaveBeenCalledWith('releases/r1/digital-formats/FLAC/a.flac');
  });
});

describe('localFormatObjectStore', () => {
  it('keeps the bytes and the content type of what it was given', async () => {
    const s3Key = 'releases/r1/digital-formats/FLAC/local-kept.flac';

    await localFormatObjectStore.put(putOf({ s3Key }));

    expect(await localFormatObjectStore.exists(s3Key)).toBe(true);
    expect(readLocalFormatObject(s3Key)).toEqual({
      body: Buffer.from([1, 2, 3, 4]),
      contentType: 'audio/flac',
    });
  });

  it('deletes an object, and a missing key deletes as it does in S3', async () => {
    const s3Key = 'releases/r1/digital-formats/FLAC/local-deleted.flac';
    await localFormatObjectStore.put(putOf({ s3Key }));

    const deleted = [
      await localFormatObjectStore.delete(s3Key),
      await localFormatObjectStore.delete(s3Key),
    ];

    expect(deleted).toEqual([true, true]);
    expect(await localFormatObjectStore.exists(s3Key)).toBe(false);
  });

  it('keeps nothing for a signal that has already fired', async () => {
    const s3Key = 'releases/r1/digital-formats/FLAC/local-aborted.flac';
    const controller = new AbortController();
    controller.abort();

    await expect(
      localFormatObjectStore.put(putOf({ s3Key, signal: controller.signal }))
    ).rejects.toThrow();
    expect(readLocalFormatObject(s3Key)).toBeNull();
  });
});

describe('formatObjectStore', () => {
  it('sends to the local adapter under E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    const s3Key = 'releases/r1/digital-formats/FLAC/selected-local.flac';

    await formatObjectStore.put(putOf({ s3Key }));

    expect(await formatObjectStore.exists(s3Key)).toBe(true);
    expect(await formatObjectStore.delete(s3Key)).toBe(true);
    expect(readLocalFormatObject(s3Key)).toBeNull();
    expect(upload.options).toEqual([]);
  });

  it('sends to S3 otherwise', async () => {
    vi.stubEnv('E2E_MODE', 'false');
    vi.mocked(verifyS3ObjectExists).mockResolvedValueOnce(false);

    await formatObjectStore.put(putOf());
    const exists = await formatObjectStore.exists('releases/r1/digital-formats/FLAC/s3.flac');

    expect(upload.options).toHaveLength(1);
    expect(exists).toBe(false);
  });
});
