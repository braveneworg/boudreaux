/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';

import sharp from 'sharp';

import { audioArgs, posterArgs, probeArgs, videoArgs } from './ffmpeg-args.js';
import { createWorkspace, removeWorkspace } from './lib/files.js';
import { percentOf, reencodeMedia } from './media.js';

import type { ProgressReporter } from './progress.js';
import type { ProcessRequest, ProcessResult } from './types.js';

const START_MS = 1_000_000;
const DEADLINE_MS = START_MS + 600_000;

const exited = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
  code: 0,
  stdout: '',
  stderrTail: '',
  timedOut: false,
  overflowed: false,
  ...overrides,
});

interface FakeStream {
  index: number;
  codec_type: string;
  width?: number;
  height?: number;
  bit_rate?: string;
}

const probeOf = (formatName: string, duration: string | null, streams: FakeStream[]): string =>
  JSON.stringify({
    streams,
    format: { format_name: formatName, ...(duration ? { duration } : {}) },
  });

const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2';
const sourceVideo = probeOf(MP4, '30.000000', [
  { index: 0, codec_type: 'video', width: 1920, height: 1080 },
  { index: 1, codec_type: 'audio', bit_rate: '128000' },
]);
const sourceAudio = probeOf('mp3', '200.000000', [
  { index: 0, codec_type: 'audio', bit_rate: '100000' },
]);
const copyVideo = probeOf(MP4, '30.021000', [
  { index: 0, codec_type: 'video', width: 1280, height: 720 },
  { index: 1, codec_type: 'audio' },
]);
const copyAudio = probeOf('mp3', '200.040000', [{ index: 0, codec_type: 'audio' }]);

/** What the fake ffmpeg and ffprobe answer, per kind of run. */
interface Script {
  source: ProcessResult;
  copy: ProcessResult;
  encode: ProcessResult;
  poster: ProcessResult;
  /** What the fake encoder writes to stdout while it runs. */
  encodeStdout: string;
}

describe('reencodeMedia', () => {
  let dir: string;
  let input: string;
  let nowMs: number;
  let script: Script;
  let runs: ProcessRequest[];
  let stages: string[];
  let percents: number[];

  const progress: ProgressReporter = {
    stage: async (stage) => {
      stages.push(stage);
    },
    percent: (percent) => {
      percents.push(percent);
    },
    settle: async () => {},
  };

  /** Stands in for both binaries: answers from the script, and writes a real poster. */
  const runProcess = async (request: ProcessRequest): Promise<ProcessResult> => {
    runs.push(request);
    const output = request.args.at(-1) ?? '';
    if (request.binary === 'ffprobe') {
      return output === input ? script.source : script.copy;
    }
    if (output.endsWith('poster.jpg')) {
      if (script.poster.code === 0) {
        await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#204060' } })
          .jpeg()
          .toFile(output);
      }
      return script.poster;
    }
    request.onStdout?.(script.encodeStdout);
    return script.encode;
  };

  const run = (declared: 'AUDIO' | 'VIDEO' = 'VIDEO') =>
    reencodeMedia(
      { inputPath: input, outDir: dir, declared, deadline: DEADLINE_MS, progress },
      { runProcess, now: () => nowMs }
    );

  /** The failure code a run refuses with. */
  const failureOf = async (declared: 'AUDIO' | 'VIDEO' = 'VIDEO'): Promise<string | null> => {
    try {
      await run(declared);
      return null;
    } catch (err) {
      return (err as { failure?: string }).failure ?? 'not-a-reencode-error';
    }
  };

  const ranBinaries = (): string[] => runs.map(({ binary }) => binary);

  beforeEach(async () => {
    dir = await createWorkspace();
    input = join(dir, 'upload');
    nowMs = START_MS;
    runs = [];
    stages = [];
    percents = [];
    script = {
      source: exited({ stdout: sourceVideo }),
      copy: exited({ stdout: copyVideo }),
      encode: exited(),
      poster: exited(),
      encodeStdout: '',
    };
  });

  afterEach(async () => {
    await removeWorkspace(dir);
  });

  describe('a video', () => {
    it('probes the upload, encodes it, measures the copy, then takes a poster from the copy', async () => {
      await run();

      const copyPath = join(dir, 'copy.mp4');
      expect(runs.map(({ binary, args }) => [binary, args])).toEqual([
        ['ffprobe', probeArgs(input)],
        [
          'ffmpeg',
          videoArgs({ inputPath: input, outputPath: copyPath, videoIndex: 0, audioIndex: 1 }),
        ],
        ['ffprobe', probeArgs(copyPath)],
        [
          'ffmpeg',
          posterArgs({
            inputPath: copyPath,
            outputPath: join(dir, 'poster.jpg'),
            atSeconds: 3,
          }),
        ],
      ]);
    });

    it('answers the copy, the poster and a card, sized as the copy was written', async () => {
      expect(await run()).toEqual({
        kind: 'VIDEO',
        copy: { name: 'copy.mp4', path: join(dir, 'copy.mp4'), contentType: 'video/mp4' },
        card: { name: 'card.webp', path: join(dir, 'card.webp'), contentType: 'image/webp' },
        poster: { name: 'poster.jpg', path: join(dir, 'poster.jpg'), contentType: 'image/jpeg' },
        width: 1280,
        height: 720,
        durationSeconds: 30,
      });
    });

    it('writes the card from the poster', async () => {
      await run();

      const card = await sharp(join(dir, 'card.webp')).metadata();
      expect([card.format, card.width, card.height]).toEqual(['webp', 640, 360]);
    });

    it('takes the poster a tenth of the way into a short video', async () => {
      script.copy = exited({
        stdout: probeOf(MP4, '4.000000', [
          { index: 0, codec_type: 'video', width: 640, height: 360 },
        ]),
      });

      await run();

      expect(runs.at(3)?.args).toContain('0.4');
    });

    it('checkpoints probing, then encoding', async () => {
      await run();

      expect(stages).toEqual(['probing', 'encoding']);
    });

    it('reports how far the encode is from what ffmpeg prints', async () => {
      script.encodeStdout = 'frame=10\nout_time_us=15000000\nprogress=continue\n';

      await run();

      expect(percents).toEqual([50]);
    });

    it('reports no percent for a source that does not state its length', async () => {
      script.source = exited({
        stdout: probeOf('matroska,webm', null, [{ index: 0, codec_type: 'video' }]),
      });
      script.encodeStdout = 'out_time_us=15000000\n';

      await run();

      expect(percents).toEqual([]);
    });

    it('refuses a copy that came out over ten minutes, from a source that hid its length', async () => {
      script.source = exited({
        stdout: probeOf('matroska,webm', null, [{ index: 0, codec_type: 'video' }]),
      });
      script.copy = exited({
        stdout: probeOf(MP4, '602.000000', [
          { index: 0, codec_type: 'video', width: 640, height: 360 },
        ]),
      });

      expect(await failureOf()).toBe('too-long');
    });

    it('refuses a copy with no picture in it as unreadable', async () => {
      script.copy = exited({ stdout: probeOf(MP4, '30.000000', []) });

      expect(await failureOf()).toBe('unreadable');
    });

    it('reports a poster that could not be taken as failed', async () => {
      script.poster = exited({ code: 1, stderrTail: 'Output file is empty' });

      expect(await failureOf()).toBe('failed');
    });
  });

  describe('audio', () => {
    beforeEach(() => {
      script.source = exited({ stdout: sourceAudio });
      script.copy = exited({ stdout: copyAudio });
    });

    it('probes the upload, encodes it as MP3 no higher than its source, and measures the copy', async () => {
      await run('AUDIO');

      const copyPath = join(dir, 'copy.mp3');
      expect(runs.map(({ binary, args }) => [binary, args])).toEqual([
        ['ffprobe', probeArgs(input)],
        [
          'ffmpeg',
          audioArgs({ inputPath: input, outputPath: copyPath, audioIndex: 0, bitrateKbps: 96 }),
        ],
        ['ffprobe', probeArgs(copyPath)],
      ]);
    });

    it('answers the copy alone, with no picture', async () => {
      expect(await run('AUDIO')).toEqual({
        kind: 'AUDIO',
        copy: { name: 'copy.mp3', path: join(dir, 'copy.mp3'), contentType: 'audio/mpeg' },
        card: null,
        poster: null,
        width: null,
        height: null,
        durationSeconds: 200,
      });
    });

    it('keeps a video upload with no picture as audio, and says so', async () => {
      expect(await run('VIDEO')).toMatchObject({
        kind: 'AUDIO',
        copy: { name: 'copy.mp3' },
        poster: null,
      });
    });

    it('never answers a length over what the wire allows', async () => {
      script.copy = exited({
        stdout: probeOf('mp3', '10800.900000', [{ index: 0, codec_type: 'audio' }]),
      });

      expect((await run('AUDIO')).durationSeconds).toBe(10_800);
    });

    it('refuses a copy with no sound in it as unreadable', async () => {
      script.copy = exited({ stdout: probeOf('mp3', '0.000000', []) });

      expect(await failureOf('AUDIO')).toBe('unreadable');
    });
  });

  describe('refusals', () => {
    it('refuses a playlist as unsupported without running ffmpeg', async () => {
      script.source = exited({
        code: 1,
        stderrTail: 'Not detecting m3u8/hls with non standard extension and non standard mime type',
      });

      expect(await failureOf()).toBe('unsupported');
      expect(ranBinaries()).toEqual(['ffprobe']);
    });

    it('refuses a concat script as unsupported without running ffmpeg', async () => {
      script.source = exited({
        code: 1,
        stderrTail: "[concat @ 0x1] Format not on whitelist 'mov,mp4'",
      });

      expect(await failureOf()).toBe('unsupported');
      expect(ranBinaries()).toEqual(['ffprobe']);
    });

    it('refuses a format name off the list even when ffprobe let it through', async () => {
      script.source = exited({
        stdout: probeOf('hls', '30.000000', [{ index: 0, codec_type: 'video' }]),
      });

      expect(await failureOf()).toBe('unsupported');
      expect(ranBinaries()).toEqual(['ffprobe']);
    });

    it('refuses a video over ten minutes without encoding it', async () => {
      script.source = exited({
        stdout: probeOf(MP4, '905.000000', [{ index: 0, codec_type: 'video' }]),
      });

      expect(await failureOf()).toBe('too-long');
      expect(ranBinaries()).toEqual(['ffprobe']);
    });

    it('refuses a file ffprobe cannot parse as unreadable', async () => {
      script.source = exited({ code: 1, stderrTail: 'Invalid data found when processing input' });

      expect(await failureOf()).toBe('unreadable');
    });

    it('refuses a file ffmpeg cannot decode as unreadable', async () => {
      script.encode = exited({ code: 1, stderrTail: 'Error while decoding stream #0:0' });

      expect(await failureOf()).toBe('unreadable');
    });

    it('reports an encode that ran out of time as failed', async () => {
      script.encode = exited({ code: null, timedOut: true });

      expect(await failureOf()).toBe('failed');
    });
  });

  describe('time', () => {
    it('gives the encode what is left of the run and the probe a minute', async () => {
      await run();

      expect(runs.map(({ timeoutMs }) => timeoutMs)).toEqual([60_000, 600_000, 60_000, 60_000]);
    });

    it('never gives a process longer than the run has left', async () => {
      nowMs = DEADLINE_MS - 5_000;

      await run();

      expect(runs.map(({ timeoutMs }) => timeoutMs)).toEqual([5_000, 5_000, 5_000, 5_000]);
    });

    it('starts nothing once the run is out of time', async () => {
      nowMs = DEADLINE_MS;

      expect(await failureOf()).toBe('failed');
      expect(runs).toEqual([]);
    });

    it('runs every process in the temp dir', async () => {
      await run();

      expect(runs.map(({ cwd }) => cwd)).toEqual([dir, dir, dir, dir]);
    });
  });
});

describe('percentOf', () => {
  it('reads the last out_time_us of a chunk against the length', () => {
    expect(percentOf('out_time_us=1000000\nout_time_us=7500000\n', 30)).toBe(25);
  });

  it('answers nothing for a chunk with no out_time_us', () => {
    expect(percentOf('frame=10\nprogress=continue\n', 30)).toBeNull();
  });

  it('answers nothing for an out_time ffmpeg does not know yet', () => {
    expect(percentOf('out_time_us=N/A\n', 30)).toBeNull();
  });

  it('answers nothing when the length is unknown', () => {
    expect(percentOf('out_time_us=7500000\n', null)).toBeNull();
  });

  it('answers nothing for a length of zero', () => {
    expect(percentOf('out_time_us=7500000\n', 0)).toBeNull();
  });
});
