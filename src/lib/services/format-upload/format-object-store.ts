/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { Upload } from '@aws-sdk/lib-storage';

import { loggers } from '@/lib/utils/logger';
import {
  deleteS3Object,
  getS3BucketName,
  getS3Client,
  verifyS3ObjectExists,
} from '@/lib/utils/s3-client';

import type { FormatObjectStore } from './types';

/** 10 MB parts balance memory use with upload throughput. */
const PART_SIZE = 10 * 1024 * 1024;

/** Up to four parts in flight at once. */
const QUEUE_SIZE = 4;

const toMegabytes = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

/**
 * The production adapter: S3 through lib-storage's multipart `Upload`, which
 * streams the file in parts instead of buffering it (whole-file buffering
 * caused OOM stalls on large WAVs). The signal aborts the upload, and
 * `leavePartsOnError: false` removes the parts already sent.
 */
export const s3FormatObjectStore: FormatObjectStore = {
  put: async ({ s3Key, filePath, contentType, contentLength, signal }) => {
    signal.throwIfAborted();

    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: getS3BucketName(),
        Key: s3Key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: contentLength,
      },
      partSize: PART_SIZE,
      queueSize: QUEUE_SIZE,
      leavePartsOnError: false,
    });

    upload.on('httpUploadProgress', ({ loaded = 0 }) => {
      const percent = contentLength > 0 ? ((loaded / contentLength) * 100).toFixed(1) : '?';
      loggers.s3.info(
        `[upload-proxy] progress ${percent}% (${toMegabytes(loaded)}MB / ${toMegabytes(contentLength)}MB) key=${s3Key}`
      );
    });

    const abort = (): void => {
      void upload.abort();
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await upload.done();
    } finally {
      signal.removeEventListener('abort', abort);
    }
  },
  exists: (s3Key) => verifyS3ObjectExists(s3Key),
  delete: (s3Key) => deleteS3Object(s3Key),
};

interface LocalFormatObject {
  body: Buffer;
  contentType: string;
}

const globalForLocalFormatObjects = globalThis as unknown as {
  boudreauxLocalFormatObjects?: Map<string, LocalFormatObject>;
};

// On globalThis so the upload route and the Server Actions, which the dev
// server may load as separate module instances, share one store, and a module
// reload keeps what was received.
const localObjects: Map<string, LocalFormatObject> =
  (globalForLocalFormatObjects.boudreauxLocalFormatObjects ??= new Map());

/**
 * The local adapter, for E2E runs with no bucket and no credentials: it keeps
 * each object's bytes and content type in memory. The route that receives a
 * file and the actions that confirm or discard it run in one server process,
 * as they do under `next dev` and the standalone E2E server.
 */
export const localFormatObjectStore: FormatObjectStore = {
  put: async ({ s3Key, filePath, contentType, signal }) => {
    signal.throwIfAborted();
    const body = await readFile(filePath, { signal });
    localObjects.set(s3Key, { body, contentType });
  },
  exists: async (s3Key) => localObjects.has(s3Key),
  delete: async (s3Key) => {
    localObjects.delete(s3Key);
    return true;
  },
};

/** What the local adapter holds under `s3Key`, so a spec can read back what was stored. */
export const readLocalFormatObject = (s3Key: string): LocalFormatObject | null =>
  localObjects.get(s3Key) ?? null;

/** The one place the adapter is chosen, per call: local under `E2E_MODE`, S3 otherwise. */
const selectedStore = (): FormatObjectStore =>
  process.env.E2E_MODE === 'true' ? localFormatObjectStore : s3FormatObjectStore;

/** The object store as the format upload module sees it. */
export const formatObjectStore: FormatObjectStore = {
  put: (object) => selectedStore().put(object),
  exists: (s3Key) => selectedStore().exists(s3Key),
  delete: (s3Key) => selectedStore().delete(s3Key),
};
