/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  submissionReencodeCallbackSchema,
  submissionReencodeDataSchema,
} from '@fakefour/job-contract';
import { verifyJobSignature } from '@fakefour/job-contract/signing';
import sharp from 'sharp';

import { lambdaHandler, runLambda } from './handler.js';
import { fileBytes, fileSink } from './lib/files.js';
import {
  ATTACHMENT_ID,
  BUCKET,
  CALLBACK_URL,
  COPY_PREFIX,
  JOB_TOKEN,
  PROGRESS_URL,
  SIGNING_KEY,
  START_MS,
  UPLOAD_KEY,
  createFakeDeps,
  reencodeEvent,
} from './test-utils/fakes.js';

import type { FakeDeps, RecordedPost } from './test-utils/fakes.js';
import type { ProcessRequest, ProcessResult } from './types.js';

const MEGABYTE = 1024 * 1024;
const IMMUTABLE = 'public, max-age=31536000, immutable';

const pngBytes = (width = 400, height = 300): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#208040' } })
    .png()
    .toBuffer();

const callbackPosts = ({ posts }: FakeDeps): RecordedPost[] =>
  posts.filter(({ url }) => url === CALLBACK_URL);

const progressBodies = ({ posts }: FakeDeps): unknown[] =>
  posts.filter(({ url }) => url === PROGRESS_URL).map(({ body }) => body);

const exited = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
  code: 0,
  stdout: '',
  stderrTail: '',
  timedOut: false,
  overflowed: false,
  ...overrides,
});

const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';

/** ffprobe's report of a file with the given streams. */
const probeOf = (formatName: string, streams: Array<Record<string, unknown>>): ProcessResult =>
  exited({
    stdout: JSON.stringify({ streams, format: { format_name: formatName, duration: '12.000000' } }),
  });

/**
 * Stands in for ffmpeg and ffprobe on a 1920×1080 video with sound: the encode
 * writes a few bytes as the copy, the poster run writes a real JPEG.
 */
const fakeVideoTools = async (request: ProcessRequest): Promise<ProcessResult> => {
  const output = request.args.at(-1) ?? '';
  if (request.binary === 'ffprobe') {
    const size = output.endsWith('copy.mp4') ? [1280, 720] : [1920, 1080];
    return probeOf(MP4, [
      { index: 0, codec_type: 'video', width: size.at(0), height: size.at(1) },
      { index: 1, codec_type: 'audio' },
    ]);
  }
  if (output.endsWith('poster.jpg')) {
    await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#204060' } })
      .jpeg()
      .toFile(output);
    return exited();
  }
  await pipeline(Readable.from([Buffer.from('an encoded video')]), fileSink(output));
  return exited();
};

/** Stands in for ffmpeg and ffprobe on a file with sound and no picture. */
const fakeAudioTools = async (request: ProcessRequest): Promise<ProcessResult> => {
  const output = request.args.at(-1) ?? '';
  if (request.binary === 'ffprobe') {
    return probeOf('mp3', [{ index: 0, codec_type: 'audio', bit_rate: '128000' }]);
  }
  await pipeline(Readable.from([Buffer.from('an encoded song')]), fileSink(output));
  return exited();
};

describe('runLambda', () => {
  describe('an event that is not a re-encode', () => {
    const invalid = { ...reencodeEvent(), uploadKey: 'uploads/../../etc/passwd' };

    it('answers failed', async () => {
      const fake = createFakeDeps();

      expect(await runLambda(invalid, fake.deps)).toEqual({ ok: false, error: 'failed' });
    });

    it('still tells the web app at once, signed, when the event says where', async () => {
      const fake = createFakeDeps();

      await runLambda(invalid, fake.deps);

      const [post] = callbackPosts(fake);
      expect(post.body).toEqual({ jobToken: JOB_TOKEN, result: { ok: false, error: 'failed' } });
      expect(
        verifyJobSignature({
          header: post.headers['x-job-signature'],
          rawBody: post.rawBody,
          signingKey: SIGNING_KEY,
          nowSeconds: START_MS / 1000,
        })
      ).toEqual({ ok: true });
    });

    it('posts nothing when the event does not say where to report', async () => {
      const fake = createFakeDeps();

      await runLambda({ task: 'submission-reencode', kind: 'IMAGE' }, fake.deps);

      expect(fake.posts).toEqual([]);
    });

    it('touches no object and makes no temp dir', async () => {
      const fake = createFakeDeps();

      await runLambda(invalid, fake.deps);

      expect(fake.store.opened).toEqual([]);
      expect(fake.store.removed).toEqual([]);
      expect(fake.workspaces).toEqual([]);
    });

    it.each([
      ['a bucket that is not a bucket name', { bucket: 'x' }],
      ['a copy prefix outside copies/', { copyPrefix: 'media/submissions/a/b/' }],
      ['a kind that is not an attachment kind', { kind: 'PDF' }],
      ['another task', { task: 'video-enrichment' }],
    ])('refuses %s', async (_name, overrides) => {
      const fake = createFakeDeps();

      const result = await runLambda({ ...reencodeEvent(), ...overrides }, fake.deps);

      expect(result).toEqual({ ok: false, error: 'failed' });
    });
  });

  describe('an image', () => {
    let fake: FakeDeps;

    beforeEach(async () => {
      fake = createFakeDeps({ [UPLOAD_KEY]: await pngBytes() });
    });

    it('answers what it wrote, in the shape the wire contract takes', async () => {
      const result = await runLambda(reencodeEvent(), fake.deps);

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'IMAGE',
          copyKey: `${COPY_PREFIX}copy.jpg`,
          cardKey: `${COPY_PREFIX}card.webp`,
          posterKey: null,
          copyBytes: fake.store.objects.get(`${COPY_PREFIX}copy.jpg`)?.length,
          width: 400,
          height: 300,
          durationSeconds: null,
        },
      });
      expect(submissionReencodeDataSchema.safeParse(result.ok && result.data).success).toBe(true);
    });

    it('stores the copy and the card under the copy prefix, typed and immutable', async () => {
      await runLambda(reencodeEvent(), fake.deps);

      const stored = fake.store.puts.map(({ bucket, key, contentType, cacheControl }) => ({
        bucket,
        key,
        contentType,
        cacheControl,
      }));
      expect(stored).toEqual(
        expect.arrayContaining([
          {
            bucket: BUCKET,
            key: `${COPY_PREFIX}copy.jpg`,
            contentType: 'image/jpeg',
            cacheControl: IMMUTABLE,
          },
          {
            bucket: BUCKET,
            key: `${COPY_PREFIX}card.webp`,
            contentType: 'image/webp',
            cacheControl: IMMUTABLE,
          },
        ])
      );
      expect(stored).toHaveLength(2);
    });

    it('posts the signed completion callback with the result', async () => {
      const result = await runLambda(reencodeEvent(), fake.deps);

      const [post, ...rest] = callbackPosts(fake);
      expect(rest).toEqual([]);
      expect(post.body).toEqual({ jobToken: JOB_TOKEN, result });
      expect(submissionReencodeCallbackSchema.safeParse(post.body).success).toBe(true);
      expect(
        verifyJobSignature({
          header: post.headers['x-job-signature'],
          rawBody: post.rawBody,
          signingKey: SIGNING_KEY,
          nowSeconds: START_MS / 1000,
        })
      ).toEqual({ ok: true });
    });

    it('checkpoints downloading, encoding and storing, in order', async () => {
      await runLambda(reencodeEvent(), fake.deps);

      expect(progressBodies(fake)).toEqual([
        { jobToken: JOB_TOKEN, stage: 'downloading' },
        { jobToken: JOB_TOKEN, stage: 'encoding' },
        { jobToken: JOB_TOKEN, stage: 'storing' },
      ]);
    });

    it('posts the callback after every checkpoint', async () => {
      await runLambda(reencodeEvent(), fake.deps);

      expect(fake.posts.at(-1)?.url).toBe(CALLBACK_URL);
    });

    it('deletes the upload after a success', async () => {
      await runLambda(reencodeEvent(), fake.deps);

      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
      expect(fake.store.objects.has(UPLOAD_KEY)).toBe(false);
    });

    it('deletes the upload before it reports', async () => {
      const order: string[] = [];
      const { remove } = fake.store;
      const { fetchFn } = fake.deps;
      fake.store.remove = async (bucket, key) => {
        order.push('delete');
        await remove(bucket, key);
      };
      fake.deps.fetchFn = (async (url: string, init: RequestInit) => {
        if (url === CALLBACK_URL) {
          order.push('callback');
        }
        return fetchFn(url, init);
      }) as typeof fetch;

      await runLambda(reencodeEvent(), fake.deps);

      expect(order).toEqual(['delete', 'callback']);
    });

    it('removes its temp dir after a success', async () => {
      await runLambda(reencodeEvent(), fake.deps);

      const [dir] = fake.workspaces;
      expect(fake.removedWorkspaces).toEqual([dir]);
      await expect(fileBytes(dir)).rejects.toThrow(/ENOENT/);
    });

    it('still succeeds when the upload cannot be deleted', async () => {
      fake.store.remove = vi.fn().mockRejectedValue(new Error('AccessDenied'));

      expect(await runLambda(reencodeEvent(), fake.deps)).toMatchObject({ ok: true });
    });

    it('still succeeds when every progress post fails', async () => {
      const { fetchFn } = fake.deps;
      fake.deps.fetchFn = (async (url: string, init: RequestInit) => {
        if (url === PROGRESS_URL) {
          throw new Error('progress endpoint is down');
        }
        return fetchFn(url, init);
      }) as typeof fetch;

      expect(await runLambda(reencodeEvent(), fake.deps)).toMatchObject({ ok: true });
    });

    it('posts nothing when the event names no callback or progress url', async () => {
      const event = reencodeEvent({ callbackUrl: undefined, progressUrl: undefined });

      expect(await runLambda(event, fake.deps)).toMatchObject({ ok: true });
      expect(fake.posts).toEqual([]);
    });

    it('never logs the signing key, the job token or a url’s query string', async () => {
      const lines: string[] = [];
      for (const level of ['info', 'warn', 'error'] as const) {
        vi.spyOn(console, level).mockImplementation((line: unknown) => {
          lines.push(String(line));
        });
      }

      await runLambda(reencodeEvent(), fake.deps);
      await runLambda(reencodeEvent(), fake.deps);

      const logged = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      expect(logged).not.toContain(SIGNING_KEY);
      expect(logged).not.toContain(JOB_TOKEN);
      expect(logged).not.toContain('callback-query');
      expect(logged).not.toContain('progress-query');
    });
  });

  describe('a file that is refused', () => {
    it('refuses an upload over its kind’s limit as too-large, without reading it', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.alloc(20 * MEGABYTE + 1) });

      const result = await runLambda(reencodeEvent(), fake.deps);

      expect(result).toEqual({ ok: false, error: 'too-large' });
      expect(fake.store.opened.at(0)?.destroyed).toBe(true);
    });

    it('refuses a file sharp cannot decode as unreadable', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('not a picture') });

      expect(await runLambda(reencodeEvent(), fake.deps)).toEqual({
        ok: false,
        error: 'unreadable',
      });
    });

    it('reports the refusal over the signed callback', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('not a picture') });

      await runLambda(reencodeEvent(), fake.deps);

      const [post] = callbackPosts(fake);
      expect(post.body).toEqual({
        jobToken: JOB_TOKEN,
        result: { ok: false, error: 'unreadable' },
      });
      expect(post.headers['x-job-signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    });

    it('deletes the upload after a failure', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('not a picture') });

      await runLambda(reencodeEvent(), fake.deps);

      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
    });

    it('removes its temp dir after a failure', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('not a picture') });

      await runLambda(reencodeEvent(), fake.deps);

      const [dir] = fake.workspaces;
      await expect(fileBytes(dir)).rejects.toThrow(/ENOENT/);
    });

    it('stores nothing after a failure', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('not a picture') });

      await runLambda(reencodeEvent(), fake.deps);

      expect(fake.store.puts).toEqual([]);
    });
  });

  describe('something unexpected', () => {
    it('answers failed when the upload cannot be opened, and still tries to delete it', async () => {
      const fake = createFakeDeps();

      const result = await runLambda(reencodeEvent(), fake.deps);

      expect(result).toEqual({ ok: false, error: 'failed' });
      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
    });

    it('answers failed when a file cannot be stored', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: await pngBytes() });
      fake.store.putFile = vi.fn().mockRejectedValue(new Error('SlowDown'));

      const result = await runLambda(reencodeEvent(), fake.deps);

      expect(result).toEqual({ ok: false, error: 'failed' });
      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
      await expect(fileBytes(fake.workspaces[0])).rejects.toThrow(/ENOENT/);
    });

    it('answers failed when no temp dir can be made, and still deletes the upload', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: await pngBytes() });
      fake.deps.workspace.create = vi.fn().mockRejectedValue(new Error('ENOSPC'));

      const result = await runLambda(reencodeEvent(), fake.deps);

      expect(result).toEqual({ ok: false, error: 'failed' });
      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
      expect(callbackPosts(fake)).toHaveLength(1);
    });

    it('still reports when the temp dir cannot be removed', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: await pngBytes() });
      fake.deps.workspace.remove = vi.fn().mockRejectedValue(new Error('EBUSY'));

      expect(await runLambda(reencodeEvent(), fake.deps)).toMatchObject({ ok: true });
      expect(callbackPosts(fake)).toHaveLength(1);
    });

    it('answers failed for media once the run is out of time', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('a video') }, fakeVideoTools);
      const { open } = fake.store;
      fake.store.open = async (bucket, key) => {
        fake.clock.nowMs += 16 * 60 * 1000;
        return open(bucket, key);
      };

      const result = await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

      expect(result).toEqual({ ok: false, error: 'failed' });
    });
  });

  describe('a video', () => {
    let fake: FakeDeps;

    beforeEach(() => {
      fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('a video') }, fakeVideoTools);
    });

    it('answers the copy, the poster and the card', async () => {
      const result = await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'VIDEO',
          copyKey: `${COPY_PREFIX}copy.mp4`,
          cardKey: `${COPY_PREFIX}card.webp`,
          posterKey: `${COPY_PREFIX}poster.jpg`,
          copyBytes: 16,
          width: 1280,
          height: 720,
          durationSeconds: 12,
        },
      });
      expect(submissionReencodeDataSchema.safeParse(result.ok && result.data).success).toBe(true);
    });

    it('stores all three files with their types', async () => {
      await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

      const stored = new Map(fake.store.puts.map(({ key, contentType }) => [key, contentType]));
      expect([...stored.entries()].toSorted()).toEqual([
        [`${COPY_PREFIX}card.webp`, 'image/webp'],
        [`${COPY_PREFIX}copy.mp4`, 'video/mp4'],
        [`${COPY_PREFIX}poster.jpg`, 'image/jpeg'],
      ]);
    });

    it('checkpoints all four stages, in order', async () => {
      await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

      expect(progressBodies(fake)).toEqual([
        { jobToken: JOB_TOKEN, stage: 'downloading' },
        { jobToken: JOB_TOKEN, stage: 'probing' },
        { jobToken: JOB_TOKEN, stage: 'encoding' },
        { jobToken: JOB_TOKEN, stage: 'storing' },
      ]);
    });

    it('deletes the upload and removes its temp dir', async () => {
      await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
      await expect(fileBytes(fake.workspaces[0])).rejects.toThrow(/ENOENT/);
    });
  });

  describe('audio', () => {
    it('answers an MP3 with no picture', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('a song') }, fakeAudioTools);

      const result = await runLambda(reencodeEvent({ kind: 'AUDIO' }), fake.deps);

      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'AUDIO',
          copyKey: `${COPY_PREFIX}copy.mp3`,
          cardKey: null,
          posterKey: null,
          copyBytes: 15,
          width: null,
          height: null,
          durationSeconds: 12,
        },
      });
    });

    it('says a video upload with no picture is audio', async () => {
      const fake = createFakeDeps({ [UPLOAD_KEY]: Buffer.from('a song') }, fakeAudioTools);

      const result = await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

      expect(result).toMatchObject({
        ok: true,
        data: { kind: 'AUDIO', copyKey: `${COPY_PREFIX}copy.mp3` },
      });
    });
  });
});

describe('lambdaHandler', () => {
  it('ignores its second argument: AWS passes the context there, never deps', async () => {
    const fake = createFakeDeps();

    const result = await lambdaHandler({ attachmentId: ATTACHMENT_ID }, fake.deps);

    expect(result).toEqual({ ok: false, error: 'failed' });
    expect(fake.posts).toEqual([]);
  });
});
