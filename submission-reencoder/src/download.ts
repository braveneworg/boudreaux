/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { fileSink } from './lib/files.js';
import { ReencodeError, attachmentUploadLimitBytes } from './types.js';

import type { AttachmentKind, ObjectStore } from './types.js';

/** One upload to bring to the run's temp dir. */
export interface DownloadRequest {
  bucket: string;
  key: string;
  /** What the upload's type said it is; it sets the size limit. */
  kind: AttachmentKind;
  /** The local path to write, named by the Lambda. */
  destination: string;
}

const tooLarge = (limit: number): ReencodeError =>
  new ReencodeError('too-large', `the upload is over ${limit} bytes`);

/**
 * A pass-through that fails once more than `limit` bytes have gone by, and
 * counts what did. The stated size is checked first, but it is only what the
 * store said: this is what holds the body itself to the limit.
 */
const byteLimit = (limit: number): { stream: Transform; seen: () => number } => {
  let seen = 0;
  const stream = new Transform({
    transform: (chunk: Buffer, _encoding, done) => {
      seen += chunk.length;
      if (seen > limit) {
        done(tooLarge(limit));
        return;
      }
      done(null, chunk);
    },
  });
  return { stream, seen: () => seen };
};

/**
 * Write an upload to a local file, refusing one larger than its kind allows.
 * The size the store reports is checked before any of the body is read, and a
 * body that runs past the limit anyway is cut off.
 *
 * @returns The number of bytes written.
 * @throws ReencodeError `too-large`. Any store or disk error is rethrown as it is.
 */
export const downloadUpload = async (
  { bucket, key, kind, destination }: DownloadRequest,
  store: ObjectStore
): Promise<number> => {
  const limit = attachmentUploadLimitBytes(kind);
  const { bytes, body } = await store.open(bucket, key);
  if (bytes !== null && bytes > limit) {
    body.destroy();
    throw tooLarge(limit);
  }
  const { stream, seen } = byteLimit(limit);
  // `pipeline` destroys the body when the limit trips, which drops the
  // connection instead of draining the rest of the object.
  await pipeline(body, stream, fileSink(destination));

  return seen();
};
