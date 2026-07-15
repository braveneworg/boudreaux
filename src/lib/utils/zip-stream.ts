/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import path from 'node:path';
import { Readable } from 'node:stream';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';

import type { getS3Client } from '@/lib/utils/s3-client';

/** An archiver zip instance, as threaded through the download zip pipelines. */
export type ZipArchive = ReturnType<typeof archiver>;

type S3ClientLike = ReturnType<typeof getS3Client>;

/**
 * Create a store-mode (no compression) zip archive — audio payloads are
 * already compressed, so store mode trades nothing for a large CPU win.
 */
export const createStoreArchive = (): ZipArchive => archiver('zip', { zlib: { level: 0 } });

/**
 * Defense-in-depth against zip-slip: force every archive entry to a
 * path.basename without slashes, backslashes, or `..`. Upload-time validation
 * should already guarantee safe names, but an archive with `../../etc/passwd`
 * would escape on server-side extraction (backups, scanners, admin review).
 */
export const safeArchiveEntryName = (fileName: string): string => {
  const base = path.basename(fileName).replace(/[\\/]/g, '_');
  const sanitized = base.replace(/[^A-Za-z0-9._\- ]/g, '_').replace(/\.{2,}/g, '_');
  return sanitized.length > 0 ? sanitized : 'file';
};

/**
 * Download an S3 object's body fully into a Buffer. Resolves once the
 * entire body has been streamed to memory.
 */
export const fetchObjectBuffer = async (
  s3Client: S3ClientLike,
  bucket: string,
  key: string
): Promise<Buffer | null> => {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) {
    return null;
  }
  // AWS SDK v3 in Node returns an IncomingMessage with a smithy-injected
  // `transformToByteArray` helper; tests pass a plain `Readable`. Support both.
  const maybeTransform = (body as { transformToByteArray?: () => Promise<Uint8Array> })
    .transformToByteArray;
  if (typeof maybeTransform === 'function') {
    const bytes = await maybeTransform.call(body);
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return null;
};

/**
 * Issue a single prefetch and attach a passive rejection handler so that
 * if the consumer abandons the promise (e.g. another fetch fails first and
 * the surrounding try/catch exits the consume loop), Node does not log it
 * as an unhandled rejection. Awaiting the returned promise still observes
 * the original rejection.
 */
export const issuePrefetch = (
  s3Client: S3ClientLike,
  bucket: string,
  key: string
): Promise<Buffer | null> => {
  const promise = fetchObjectBuffer(s3Client, bucket, key);
  // Suppress "unhandled rejection" — the consumer's `await` (or the outer
  // try/catch) is the authoritative handler.
  promise.catch(() => {});
  return promise;
};

/**
 * Kick off up to `depth` concurrent S3 body downloads for the head of `keys`.
 * The caller refills the returned in-flight list via `issuePrefetch` as it
 * drains entries into the archive.
 */
export const startBufferPrefetch = (
  s3Client: S3ClientLike,
  bucket: string,
  keys: readonly string[],
  depth: number
): Array<Promise<Buffer | null>> => {
  const inFlight: Array<Promise<Buffer | null>> = [];
  const initial = Math.min(depth, keys.length);
  for (let i = 0; i < initial; i++) {
    const key = keys.at(i);
    if (key === undefined) {
      break;
    }
    inFlight.push(issuePrefetch(s3Client, bucket, key));
  }
  return inFlight;
};
