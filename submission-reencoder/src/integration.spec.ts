/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';

import sharp from 'sharp';

import { runLambda } from './handler.js';
import { createWorkspace, fileSink, fileSource, removeWorkspace } from './lib/files.js';
import { createProcessRunner } from './process.js';
import { COPY_PREFIX, UPLOAD_KEY, createFakeDeps, reencodeEvent } from './test-utils/fakes.js';

import type { FakeDeps } from './test-utils/fakes.js';
import type { AttachmentKind, SubmissionReencodeResult } from './types.js';

/**
 * The audio and video paths end to end with the real ffmpeg and ffprobe, the
 * real process runner and the real argument vectors. Only S3 and the network
 * are faked. Skipped where the two binaries are not on PATH.
 */
const hasMediaTools = ['ffmpeg', 'ffprobe'].every(
  (binary) => spawnSync(binary, ['-version'], { stdio: 'ignore' }).status === 0
);

interface ProbedStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  bit_rate?: string;
}

interface Probed {
  streams: ProbedStream[];
  format: { format_name: string; duration: string; tags?: Record<string, string> };
}

describe.runIf(hasMediaTools)('re-encode with the real ffmpeg', { timeout: 120_000 }, () => {
  let fixtures: string;

  /** Make a fixture with ffmpeg's synthetic sources, and answer its bytes. */
  const generate = async (name: string, args: string[]): Promise<Buffer> => {
    const path = join(fixtures, name);
    execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args, path]);
    return buffer(fileSource(path));
  };

  const testVideo = (size: string, seconds: number, rate = 25): string[] => [
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=${size}:rate=${rate}:duration=${seconds}`,
  ];

  const sine = (seconds: number): string[] => [
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:sample_rate=44100:duration=${seconds}`,
  ];

  /** Run the Lambda on `upload`, declared as `kind`, against a fake bucket. */
  const reencode = async (
    upload: Buffer,
    kind: AttachmentKind
  ): Promise<{ result: SubmissionReencodeResult; fake: FakeDeps }> => {
    const fake = createFakeDeps({ [UPLOAD_KEY]: upload }, createProcessRunner());
    const result = await runLambda(reencodeEvent({ kind }), fake.deps);
    return { result, fake };
  };

  /** What ffprobe says about a file the Lambda stored. */
  const probeStored = async (fake: FakeDeps, name: string): Promise<Probed> => {
    const path = join(fixtures, `stored-${fake.workspaces.length}-${Date.now()}-${name}`);
    const bytes = fake.store.objects.get(`${COPY_PREFIX}${name}`) ?? Buffer.alloc(0);
    await pipeline(Readable.from([bytes]), fileSink(path));
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path];
    return JSON.parse(execFileSync('ffprobe', args, { encoding: 'utf8' })) as Probed;
  };

  const streamOf = (probed: Probed, type: string): ProbedStream | undefined =>
    probed.streams.find(({ codec_type }) => codec_type === type);

  beforeAll(async () => {
    fixtures = await createWorkspace();
  });

  afterAll(async () => {
    await removeWorkspace(fixtures);
  });

  describe('a landscape video with sound, in Matroska', () => {
    let result: SubmissionReencodeResult;
    let fake: FakeDeps;
    let copy: Probed;

    beforeAll(async () => {
      const upload = await generate('landscape.mkv', [
        ...testVideo('1280x960', 2),
        ...sine(2),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv444p',
        '-c:a',
        'flac',
        '-metadata',
        'title=a private title',
        '-shortest',
      ]);
      ({ result, fake } = await reencode(upload, 'VIDEO'));
      copy = await probeStored(fake, 'copy.mp4');
    });

    it('answers a video with its copy, poster and card', () => {
      expect(result).toEqual({
        ok: true,
        data: {
          kind: 'VIDEO',
          copyKey: `${COPY_PREFIX}copy.mp4`,
          cardKey: `${COPY_PREFIX}card.webp`,
          posterKey: `${COPY_PREFIX}poster.jpg`,
          copyBytes: fake.store.objects.get(`${COPY_PREFIX}copy.mp4`)?.length,
          width: 960,
          height: 720,
          durationSeconds: 2,
        },
      });
    });

    it('writes an MP4', () => {
      expect(copy.format.format_name).toContain('mp4');
    });

    it('writes H.264 in 8-bit 4:2:0 with its short side at 720', () => {
      const picture = streamOf(copy, 'video');

      expect([picture?.codec_name, picture?.pix_fmt, picture?.width, picture?.height]).toEqual([
        'h264',
        'yuv420p',
        960,
        720,
      ]);
    });

    it('writes AAC sound', () => {
      expect(streamOf(copy, 'audio')?.codec_name).toBe('aac');
    });

    it('writes one picture stream and one sound stream, and nothing else', () => {
      expect(copy.streams.map(({ codec_type }) => codec_type).toSorted()).toEqual([
        'audio',
        'video',
      ]);
    });

    it('drops the source’s title', () => {
      expect(JSON.stringify(copy.format.tags ?? {})).not.toContain('a private title');
    });

    it('puts the index before the media, so playback can start early', () => {
      const bytes = fake.store.objects.get(`${COPY_PREFIX}copy.mp4`) ?? Buffer.alloc(0);

      expect(bytes.indexOf('moov')).toBeGreaterThan(0);
      expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'));
    });

    it('takes the poster from the copy, at the copy’s size', async () => {
      const poster = join(fixtures, 'landscape-poster');
      const bytes = fake.store.objects.get(`${COPY_PREFIX}poster.jpg`) ?? Buffer.alloc(0);
      await pipeline(Readable.from([bytes]), fileSink(poster));

      const { format, width, height } = await sharp(poster).metadata();
      expect([format, width, height]).toEqual(['jpeg', 960, 720]);
    });

    it('writes the card 640 px wide from the poster', async () => {
      const card = join(fixtures, 'landscape-card');
      const bytes = fake.store.objects.get(`${COPY_PREFIX}card.webp`) ?? Buffer.alloc(0);
      await pipeline(Readable.from([bytes]), fileSink(card));

      const { format, width, height } = await sharp(card).metadata();
      expect([format, width, height]).toEqual(['webp', 640, 480]);
    });

    it('deletes the upload and leaves no temp dir', () => {
      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
      expect(fake.removedWorkspaces).toEqual(fake.workspaces);
    });
  });

  describe('a small portrait video with no sound', () => {
    let result: SubmissionReencodeResult;
    let copy: Probed;

    beforeAll(async () => {
      const upload = await generate('portrait.mp4', [
        ...testVideo('360x640', 1),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
      ]);
      const run = await reencode(upload, 'VIDEO');
      ({ result } = run);
      copy = await probeStored(run.fake, 'copy.mp4');
    });

    it('never enlarges it', () => {
      expect(result).toMatchObject({ ok: true, data: { kind: 'VIDEO', width: 360, height: 640 } });
    });

    it('writes no sound stream', () => {
      expect(copy.streams.map(({ codec_type }) => codec_type)).toEqual(['video']);
    });
  });

  it('lands a video with odd dimensions on even ones', async () => {
    const upload = await generate('odd.mkv', [...testVideo('853x479', 1), '-c:v', 'ffv1']);

    const { result } = await reencode(upload, 'VIDEO');

    expect(result).toMatchObject({ ok: true, data: { width: 852, height: 478 } });
  });

  it('holds a tall video’s short side, its width, to 720', async () => {
    const upload = await generate('tall.mp4', [
      ...testVideo('1080x1920', 1),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
    ]);

    const { result } = await reencode(upload, 'VIDEO');

    expect(result).toMatchObject({ ok: true, data: { width: 720, height: 1280 } });
  });

  describe('audio in WAV', () => {
    let result: SubmissionReencodeResult;
    let copy: Probed;

    beforeAll(async () => {
      const upload = await generate('tone.wav', [...sine(3), '-metadata', 'title=a private title']);
      const run = await reencode(upload, 'AUDIO');
      ({ result } = run);
      copy = await probeStored(run.fake, 'copy.mp3');
    });

    it('answers audio with its copy and no picture', () => {
      expect(result).toMatchObject({
        ok: true,
        data: {
          kind: 'AUDIO',
          copyKey: `${COPY_PREFIX}copy.mp3`,
          cardKey: null,
          posterKey: null,
          width: null,
          height: null,
          durationSeconds: 3,
        },
      });
    });

    it('writes an MP3 at 192 kbps from a lossless source', () => {
      const sound = streamOf(copy, 'audio');

      expect([copy.format.format_name, sound?.codec_name, sound?.bit_rate]).toEqual([
        'mp3',
        'mp3',
        '192000',
      ]);
    });

    it('drops the source’s title', () => {
      expect(JSON.stringify(copy.format.tags ?? {})).not.toContain('a private title');
    });
  });

  it('keeps a 96 kbps source at 96 kbps, never above it', async () => {
    const upload = await generate('low.mp3', [...sine(3), '-c:a', 'libmp3lame', '-b:a', '96k']);

    const { fake } = await reencode(upload, 'AUDIO');

    expect(streamOf(await probeStored(fake, 'copy.mp3'), 'audio')?.bit_rate).toBe('96000');
  });

  it('keeps a video upload with sound and no picture as audio', async () => {
    const upload = await generate('sound-only.mp4', [...sine(2), '-c:a', 'aac']);

    const { result, fake } = await reencode(upload, 'VIDEO');

    expect(result).toMatchObject({
      ok: true,
      data: { kind: 'AUDIO', copyKey: `${COPY_PREFIX}copy.mp3`, posterKey: null },
    });
    expect((await probeStored(fake, 'copy.mp3')).format.format_name).toBe('mp3');
  });

  it('keeps only the sound of an audio upload that carries a picture', async () => {
    const upload = await generate('with-picture.mp4', [
      ...testVideo('320x240', 2),
      ...sine(2),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
    ]);

    const { result, fake } = await reencode(upload, 'AUDIO');

    expect(result).toMatchObject({ ok: true, data: { kind: 'AUDIO' } });
    expect(
      (await probeStored(fake, 'copy.mp3')).streams.map(({ codec_type }) => codec_type)
    ).toEqual(['audio']);
  });

  describe('files that are not media', () => {
    const playlist = Buffer.from(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-TARGETDURATION:10',
        '#EXTINF:10,',
        '/etc/hosts',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n')
    );
    const concatScript = Buffer.from("ffconcat version 1.0\nfile '/etc/hosts'\n");
    const sdp = Buffer.from(
      [
        'v=0',
        'o=- 0 0 IN IP4 127.0.0.1',
        's=No Name',
        'c=IN IP4 127.0.0.1',
        't=0 0',
        'm=video 5004 RTP/AVP 96',
        'a=rtpmap:96 H264/90000',
        '',
      ].join('\n')
    );

    it.each([
      ['an HLS playlist pointing at /etc/hosts', playlist, 'VIDEO'],
      ['an HLS playlist declared as audio', playlist, 'AUDIO'],
      ['a concat script pointing at /etc/hosts', concatScript, 'VIDEO'],
      ['an SDP description', sdp, 'VIDEO'],
    ] as const)('refuses %s as unsupported and stores nothing', async (_name, upload, kind) => {
      const { result, fake } = await reencode(upload, kind);

      expect(result).toEqual({ ok: false, error: 'unsupported' });
      expect(fake.store.puts).toEqual([]);
      expect(fake.store.removed).toEqual([UPLOAD_KEY]);
    });

    it('refuses a still picture declared as a video as unsupported', async () => {
      const png = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#336699' },
      })
        .png()
        .toBuffer();

      const { result } = await reencode(png, 'VIDEO');

      expect(result).toEqual({ ok: false, error: 'unsupported' });
    });

    it('refuses bytes that are no format at all as unreadable', async () => {
      const { result } = await reencode(Buffer.alloc(64 * 1024, 0x5a), 'VIDEO');

      expect(result).toEqual({ ok: false, error: 'unreadable' });
    });
  });

  it('refuses a video over ten minutes as too-long, without storing anything', async () => {
    const upload = await generate('long.mp4', [
      ...testVideo('32x32', 603, 1),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
    ]);

    const { result, fake } = await reencode(upload, 'VIDEO');

    expect(result).toEqual({ ok: false, error: 'too-long' });
    expect(fake.store.puts).toEqual([]);
  });

  it('reports how far the encode is while it runs', async () => {
    const upload = await generate('progress.mkv', [...testVideo('640x480', 4), '-c:v', 'ffv1']);
    const fake = createFakeDeps({ [UPLOAD_KEY]: upload }, createProcessRunner());
    // Three seconds pass between any two readings of the clock, so the
    // reporter's throttle never holds a percent back.
    fake.deps.now = () => {
      fake.clock.nowMs += 3_000;
      return fake.clock.nowMs;
    };

    await runLambda(reencodeEvent({ kind: 'VIDEO' }), fake.deps);

    const percents = fake.posts.flatMap(({ body }) =>
      body.stage === 'encoding' && typeof body.percent === 'number' ? [body.percent] : []
    );
    expect(percents.length).toBeGreaterThan(0);
    expect(percents).toEqual(percents.toSorted((a, b) => a - b));
  });
});
