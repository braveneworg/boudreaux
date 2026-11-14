/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { fileBytes, fileSource } from './lib/files.js';

import type { ObjectStore } from './types.js';

/**
 * The private bucket, through the Lambda's own role: read and delete under
 * `uploads/`, write under `copies/`, and nothing else (see `template.yaml`).
 *
 * @param client - Injectable S3 client; the default takes its region and
 * credentials from the Lambda's environment.
 */
export const createS3Store = (client: S3Client = new S3Client({})): ObjectStore => ({
  open: async (bucket, key) => {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = response.Body;
    if (!(body instanceof Readable)) {
      throw new Error('S3 answered no body to read');
    }
    // The headers are in and the body is not: the caller checks the size
    // before it reads a byte.
    return { bytes: response.ContentLength ?? null, body };
  },
  putFile: async ({ bucket, key, filePath, contentType, cacheControl }) => {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileSource(filePath),
        ContentLength: await fileBytes(filePath),
        ContentType: contentType,
        CacheControl: cacheControl,
      })
    );
  },
  remove: async (bucket, key) => {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
});
