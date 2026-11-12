/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';

import { downloadUpload } from './download.js';
import { createWorkspace, fileSource, removeWorkspace } from './lib/files.js';

import type { ObjectStore, OpenedObject } from './types.js';

const MEGABYTE = 1024 * 1024;
const IMAGE_LIMIT = 20 * MEGABYTE;

const BUCKET = 'uploads-bucket';
const KEY = 'uploads/65f0c0000000000000000001/3f1c2c5e-0000-4000-8000-000000000001';

/** A body of `megabytes` one-megabyte chunks that counts how many it handed out. */
const chunkedBody = (megabytes: number): { body: Readable; served: () => number } => {
  let served = 0;
  const chunks = function* (): Generator<Buffer> {
    while (served < megabytes) {
      served += 1;
      yield Buffer.alloc(MEGABYTE, 1);
    }
  };
  return { body: Readable.from(chunks(), { highWaterMark: 1 }), served: () => served };
};

const storeOpening = (opened: OpenedObject): ObjectStore => ({
  open: vi.fn().mockResolvedValue(opened),
  putFile: vi.fn(),
  remove: vi.fn(),
});

/** The failure code a rejected promise carries. */
const failureOf = async (run: Promise<unknown>): Promise<string | null> => {
  try {
    await run;
    return null;
  } catch (err) {
    return (err as { failure?: string }).failure ?? 'not-a-reencode-error';
  }
};

describe('downloadUpload', () => {
  let dir: string;
  let destination: string;

  beforeEach(async () => {
    dir = await createWorkspace();
    destination = join(dir, 'upload');
  });

  afterEach(async () => {
    await removeWorkspace(dir);
  });

  it('opens the upload it was told to', async () => {
    const store = storeOpening({ bytes: 3, body: Readable.from([Buffer.from('abc')]) });

    await downloadUpload({ bucket: BUCKET, key: KEY, kind: 'IMAGE', destination }, store);

    expect(store.open).toHaveBeenCalledWith(BUCKET, KEY);
  });

  it('writes the body to the destination and answers its size', async () => {
    const store = storeOpening({
      bytes: 6,
      body: Readable.from([Buffer.from('abc'), Buffer.from('def')]),
    });

    const bytes = await downloadUpload(
      { bucket: BUCKET, key: KEY, kind: 'IMAGE', destination },
      store
    );

    expect(bytes).toBe(6);
    expect((await buffer(fileSource(destination))).toString()).toBe('abcdef');
  });

  it('refuses an object larger than its kind allows before reading any of it', async () => {
    const { body, served } = chunkedBody(1);
    const store = storeOpening({ bytes: IMAGE_LIMIT + 1, body });

    const failure = await failureOf(
      downloadUpload({ bucket: BUCKET, key: KEY, kind: 'IMAGE', destination }, store)
    );

    expect(failure).toBe('too-large');
    expect(served()).toBe(0);
    expect(body.destroyed).toBe(true);
  });

  it('accepts an object exactly at its kind’s limit', async () => {
    const store = storeOpening({ bytes: IMAGE_LIMIT, body: chunkedBody(20).body });

    const bytes = await downloadUpload(
      { bucket: BUCKET, key: KEY, kind: 'IMAGE', destination },
      store
    );

    expect(bytes).toBe(IMAGE_LIMIT);
  });

  it('holds each kind to its own limit', async () => {
    const store = storeOpening({
      bytes: IMAGE_LIMIT + 1,
      body: Readable.from([Buffer.from('abc')]),
    });

    const failure = await failureOf(
      downloadUpload({ bucket: BUCKET, key: KEY, kind: 'AUDIO', destination }, store)
    );

    expect(failure).toBeNull();
  });

  it('aborts a body that runs past the limit the store did not report', async () => {
    const { body, served } = chunkedBody(40);
    const store = storeOpening({ bytes: null, body });

    const failure = await failureOf(
      downloadUpload({ bucket: BUCKET, key: KEY, kind: 'IMAGE', destination }, store)
    );

    expect(failure).toBe('too-large');
    expect(served()).toBeLessThan(40);
    expect(body.destroyed).toBe(true);
  });

  it('aborts a body that runs past a size the store understated', async () => {
    const { body } = chunkedBody(40);
    const store = storeOpening({ bytes: 10, body });

    const failure = await failureOf(
      downloadUpload({ bucket: BUCKET, key: KEY, kind: 'IMAGE', destination }, store)
    );

    expect(failure).toBe('too-large');
  });

  it('lets a store failure through as it is', async () => {
    const store = storeOpening({ bytes: 3, body: Readable.from([Buffer.from('abc')]) });
    vi.mocked(store.open).mockRejectedValue(new Error('AccessDenied'));

    await expect(
      downloadUpload({ bucket: BUCKET, key: KEY, kind: 'IMAGE', destination }, store)
    ).rejects.toThrow('AccessDenied');
  });
});
