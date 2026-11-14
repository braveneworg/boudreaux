/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

import { createWorkspace, fileSink, removeWorkspace } from './lib/files.js';
import { createS3Store } from './s3.js';

import type { S3Client } from '@aws-sdk/client-s3';

const BUCKET = 'uploads-bucket';
const KEY = 'uploads/65f0c0000000000000000001/3f1c2c5e-0000-4000-8000-000000000001';

/** An S3 client that answers every command with `response` and records what it was sent. */
const clientAnswering = (response: unknown) => {
  const send = vi.fn().mockResolvedValue(response);
  return { send, client: { send } as unknown as S3Client };
};

describe('createS3Store', () => {
  describe('open', () => {
    it('gets the object it was asked for', async () => {
      const { send, client } = clientAnswering({ ContentLength: 3, Body: Readable.from(['abc']) });

      await createS3Store(client).open(BUCKET, KEY);

      const command = send.mock.calls[0][0] as GetObjectCommand;
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({ Bucket: BUCKET, Key: KEY });
    });

    it('answers the size S3 states and the unread body', async () => {
      const body = Readable.from([Buffer.from('abc')]);
      const { client } = clientAnswering({ ContentLength: 3, Body: body });

      const opened = await createS3Store(client).open(BUCKET, KEY);

      expect(opened.bytes).toBe(3);
      expect(opened.body).toBe(body);
      expect(body.readableDidRead).toBe(false);
    });

    it('answers an unknown size when S3 states none', async () => {
      const { client } = clientAnswering({ Body: Readable.from(['abc']) });

      expect((await createS3Store(client).open(BUCKET, KEY)).bytes).toBeNull();
    });

    it('fails when S3 answers no body to read', async () => {
      const { client } = clientAnswering({ ContentLength: 0 });

      await expect(createS3Store(client).open(BUCKET, KEY)).rejects.toThrow(/no body/);
    });
  });

  describe('putFile', () => {
    let dir: string;
    let filePath: string;

    beforeEach(async () => {
      dir = await createWorkspace();
      filePath = join(dir, 'copy.jpg');
      await pipeline(Readable.from([Buffer.from('jpeg bytes')]), fileSink(filePath));
    });

    afterEach(async () => {
      await removeWorkspace(dir);
    });

    it('puts the file with its type, its cache policy and its length', async () => {
      const { send, client } = clientAnswering({});

      await createS3Store(client).putFile({
        bucket: BUCKET,
        key: 'copies/a/b/copy.jpg',
        filePath,
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      const command = send.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: BUCKET,
        Key: 'copies/a/b/copy.jpg',
        ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
        ContentLength: 10,
      });
    });

    it('sends the file’s bytes as the body', async () => {
      const { send, client } = clientAnswering({});

      await createS3Store(client).putFile({
        bucket: BUCKET,
        key: 'copies/a/b/copy.jpg',
        filePath,
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      const command = send.mock.calls[0][0] as PutObjectCommand;
      expect((await buffer(command.input.Body as Readable)).toString()).toBe('jpeg bytes');
    });
  });

  describe('remove', () => {
    it('deletes the object it was asked to', async () => {
      const { send, client } = clientAnswering({});

      await createS3Store(client).remove(BUCKET, KEY);

      const command = send.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({ Bucket: BUCKET, Key: KEY });
    });
  });
});
