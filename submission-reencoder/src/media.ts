/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { join } from 'node:path';

import { audioArgs, posterArgs, probeArgs, videoArgs } from './ffmpeg-args.js';
import { writeCard } from './image.js';
import { assertWithinDuration, planMedia, processFailure, readProbe } from './probe.js';
import { ATTACHMENT_MAX_AUDIO_SECONDS, ReencodeError } from './types.js';

import type { MediaPlan, ProbeReport } from './probe.js';
import type { ProgressReporter } from './progress.js';
import type {
  MediaBinary,
  ProcessResult,
  ReencodeOutput,
  ReencoderDeps,
  WrittenFile,
} from './types.js';

/** One audio or video upload to re-encode. */
export interface MediaRequest {
  /** The downloaded upload: a local file the Lambda named. */
  inputPath: string;
  /** The run's temp dir, where the copy, poster and card are written. */
  outDir: string;
  /** What the upload's type said it is. */
  declared: 'AUDIO' | 'VIDEO';
  /** Milliseconds since the epoch after which no process may still be running. */
  deadline: number;
  progress: ProgressReporter;
}

/** The seams a media re-encode goes through. */
export type MediaDeps = Pick<ReencoderDeps, 'runProcess' | 'now'>;

/** The longest a probe may take. It reads headers; a minute means it is stuck. */
const PROBE_TIMEOUT_MS = 60_000;
/** The longest taking one frame from the written copy may take. */
const POSTER_TIMEOUT_MS = 60_000;
/** The poster is taken this far into the copy, as a share of its length… */
const POSTER_POSITION = 0.1;
/** …but no later than this, in seconds. Frame zero is too often black. */
const POSTER_LATEST_SECONDS = 3;

const MICROSECONDS_PER_SECOND = 1_000_000;
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT = 100;

interface MediaRun {
  request: MediaRequest;
  deps: MediaDeps;
}

interface ToolCall {
  binary: MediaBinary;
  args: string[];
  /** The longest this call may take, the run's remaining time permitting. */
  capMs: number;
  onStdout?: (text: string) => void;
}

/**
 * How far an encode is, from a chunk of ffmpeg's `-progress` output: the last
 * `out_time_us` in it against the source's length. `null` when the chunk has
 * none or the length is unknown.
 */
export const percentOf = (text: string, totalSeconds: number | null): number | null => {
  const last = [...text.matchAll(/out_time_us=(\d+)/g)].at(-1)?.at(1);
  if (last === undefined || totalSeconds === null || totalSeconds <= 0) {
    return null;
  }
  return (Number(last) / MICROSECONDS_PER_SECOND / totalSeconds) * PERCENT;
};

/**
 * Run one of the two binaries inside what is left of the run's time, so the
 * Lambda can still report a failure before its own 900s limit kills it.
 */
const runTool = ({ request, deps }: MediaRun, call: ToolCall): Promise<ProcessResult> => {
  const remainingMs = request.deadline - deps.now();
  if (remainingMs <= 0) {
    throw new ReencodeError('failed', 'the run is out of time');
  }
  return deps.runProcess({
    binary: call.binary,
    args: call.args,
    timeoutMs: Math.min(call.capMs, remainingMs),
    cwd: request.outDir,
    onStdout: call.onStdout,
  });
};

const probe = async (run: MediaRun, path: string): Promise<ProbeReport> =>
  readProbe(
    await runTool(run, { binary: 'ffprobe', args: probeArgs(path), capMs: PROBE_TIMEOUT_MS })
  );

/** Run an encode, passing on how far it is. */
const encode = async (
  run: MediaRun,
  args: string[],
  totalSeconds: number | null
): Promise<void> => {
  const result = await runTool(run, {
    binary: 'ffmpeg',
    args,
    capMs: Number.POSITIVE_INFINITY,
    onStdout: (text) => {
      const percent = percentOf(text, totalSeconds);
      if (percent !== null) {
        run.request.progress.percent(percent);
      }
    },
  });
  if (result.code !== 0) {
    throw processFailure('ffmpeg', result);
  }
};

/** A length as the wire takes it: whole seconds, within the contract's bound. */
const wholeSeconds = (durationSeconds: number | null): number | null =>
  durationSeconds === null
    ? null
    : Math.min(ATTACHMENT_MAX_AUDIO_SECONDS, Math.max(0, Math.round(durationSeconds)));

/** Where in a copy its poster is taken, in seconds. */
const posterTime = (durationSeconds: number | null): number => {
  const position = Math.min(POSTER_LATEST_SECONDS, (durationSeconds ?? 0) * POSTER_POSITION);
  return Math.round(position * MILLISECONDS_PER_SECOND) / MILLISECONDS_PER_SECOND;
};

/** Take one frame of the written copy as `poster.jpg`. The copy is ours, so a failure is too. */
const takePoster = async (
  run: MediaRun,
  copyPath: string,
  durationSeconds: number | null
): Promise<WrittenFile> => {
  const path = join(run.request.outDir, 'poster.jpg');
  const result = await runTool(run, {
    binary: 'ffmpeg',
    args: posterArgs({
      inputPath: copyPath,
      outputPath: path,
      atSeconds: posterTime(durationSeconds),
    }),
    capMs: POSTER_TIMEOUT_MS,
  });
  if (result.code !== 0) {
    throw new ReencodeError('failed', `the poster could not be taken: ${result.stderrTail}`);
  }
  return { name: 'poster.jpg', path, contentType: 'image/jpeg' };
};

type VideoPlan = Extract<MediaPlan, { kind: 'VIDEO' }>;
type AudioPlan = Extract<MediaPlan, { kind: 'AUDIO' }>;

/**
 * Write `copy.mp4`, then `poster.jpg` and `card.webp` from it. The size and
 * length answered are the written copy's, measured, not the source's claims.
 */
const encodeVideo = async (run: MediaRun, plan: VideoPlan): Promise<ReencodeOutput> => {
  const { inputPath, outDir } = run.request;
  const copyPath = join(outDir, 'copy.mp4');
  await encode(
    run,
    videoArgs({
      inputPath,
      outputPath: copyPath,
      videoIndex: plan.videoIndex,
      audioIndex: plan.audioIndex,
    }),
    plan.durationSeconds
  );
  const written = await probe(run, copyPath);
  const picture = written.streams.find((stream) => stream.codecType === 'video');
  if (!picture || picture.width === null || picture.height === null) {
    throw new ReencodeError('unreadable', 'the encode wrote no picture');
  }
  assertWithinDuration(written.durationSeconds, 'VIDEO');
  const poster = await takePoster(run, copyPath, written.durationSeconds);

  return {
    kind: 'VIDEO',
    copy: { name: 'copy.mp4', path: copyPath, contentType: 'video/mp4' },
    card: await writeCard(poster.path, outDir),
    poster,
    width: picture.width,
    height: picture.height,
    durationSeconds: wholeSeconds(written.durationSeconds),
  };
};

/** Write `copy.mp3`. The length answered is the written copy's, measured. */
const encodeAudio = async (run: MediaRun, plan: AudioPlan): Promise<ReencodeOutput> => {
  const { inputPath, outDir } = run.request;
  const copyPath = join(outDir, 'copy.mp3');
  await encode(
    run,
    audioArgs({
      inputPath,
      outputPath: copyPath,
      audioIndex: plan.audioIndex,
      bitrateKbps: plan.bitrateKbps,
    }),
    plan.durationSeconds
  );
  const written = await probe(run, copyPath);
  if (!written.streams.some((stream) => stream.codecType === 'audio')) {
    throw new ReencodeError('unreadable', 'the encode wrote no sound');
  }
  assertWithinDuration(written.durationSeconds, 'AUDIO');

  return {
    kind: 'AUDIO',
    copy: { name: 'copy.mp3', path: copyPath, contentType: 'audio/mpeg' },
    card: null,
    poster: null,
    width: null,
    height: null,
    durationSeconds: wholeSeconds(written.durationSeconds),
  };
};

/**
 * Re-encode an audio or video upload with ffprobe and ffmpeg, both held to the
 * one local file (see `ffmpeg-args.ts`). A video upload with no picture is
 * kept as audio.
 *
 * @throws ReencodeError `unsupported`, `unreadable`, `too-long` or `failed`.
 */
export const reencodeMedia = async (
  request: MediaRequest,
  deps: MediaDeps
): Promise<ReencodeOutput> => {
  const run: MediaRun = { request, deps };
  await request.progress.stage('probing');
  const plan = planMedia(await probe(run, request.inputPath), request.declared);
  await request.progress.stage('encoding');

  return plan.kind === 'VIDEO' ? encodeVideo(run, plan) : encodeAudio(run, plan);
};
