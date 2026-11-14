/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { ALLOWED_FORMATS } from './ffmpeg-args.js';
import {
  ATTACHMENT_MAX_AUDIO_SECONDS,
  ATTACHMENT_MAX_VIDEO_SECONDS,
  ReencodeError,
} from './types.js';

import type { MediaBinary, ProcessResult } from './types.js';

/** One stream of a probed file. */
export interface ProbeStream {
  /** The stream's index in the file, as `-map 0:<index>` takes it. */
  index: number;
  /** `video`, `audio`, `subtitle`, `data`, …; `null` when ffprobe gave none. */
  codecType: string | null;
  /** Cover art: a still picture stored as a video stream. */
  attachedPicture: boolean;
  width: number | null;
  height: number | null;
  bitRate: number | null;
}

/** What ffprobe said about a file, in the shape the rules read. */
export interface ProbeReport {
  /** The demuxer's names, e.g. `['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2']`. */
  formatNames: string[];
  durationSeconds: number | null;
  bitRate: number | null;
  streams: ProbeStream[];
}

/** What to write for a file, decided from its probe. */
export type MediaPlan =
  | { kind: 'VIDEO'; videoIndex: number; audioIndex: number | null; durationSeconds: number | null }
  | { kind: 'AUDIO'; audioIndex: number; bitrateKbps: number; durationSeconds: number | null };

/** ffprobe prints numbers as strings; an absent one is `N/A` or missing. */
const numeric = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    const parsed = Number(value);
    return value !== undefined && Number.isFinite(parsed) ? parsed : null;
  });

const probeOutputSchema = z.object({
  format: z.object({
    format_name: z.string(),
    duration: numeric,
    bit_rate: numeric,
  }),
  streams: z
    .array(
      z.object({
        index: z.number().int().min(0),
        codec_type: z.string().optional(),
        width: numeric,
        height: numeric,
        bit_rate: numeric,
        disposition: z.object({ attached_pic: z.number().optional() }).optional(),
      })
    )
    .default([]),
});

/**
 * What ffprobe and ffmpeg log when the whitelists stop them, and what the HLS
 * demuxer logs when it declines a playlist it was not allowed to recognise by
 * name. Only the refusal's code hangs on this: the file is refused either way.
 */
const REFUSED_BY_GUARD = /not on whitelist|m3u8\/hls/i;

/** The longest slice of stderr a refusal carries into the log. */
const STDERR_DETAIL_LENGTH = 300;

/**
 * Why a run of ffprobe or ffmpeg on a user's file did not exit cleanly, as the
 * refusal it stands for: `unsupported` when a whitelist stopped it,
 * `unreadable` when the file could not be parsed or decoded, `failed` when the
 * process timed out or never ran.
 */
export const processFailure = (
  tool: MediaBinary,
  { timedOut, overflowed, code, stderrTail }: ProcessResult
): ReencodeError => {
  if (timedOut) {
    return new ReencodeError('failed', `${tool} ran out of time`);
  }
  if (overflowed) {
    return new ReencodeError('unreadable', `${tool} wrote more than it can have to say`);
  }
  if (code === null) {
    return new ReencodeError('failed', `${tool} did not run: ${stderrTail}`);
  }
  const detail = stderrTail.slice(-STDERR_DETAIL_LENGTH);
  return REFUSED_BY_GUARD.test(stderrTail)
    ? new ReencodeError('unsupported', `${tool} refused the format: ${detail}`)
    : new ReencodeError('unreadable', `${tool} could not read the file: ${detail}`);
};

/** ffprobe's stdout as JSON, or `null` when it is not JSON. */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/**
 * Read an ffprobe run into a {@link ProbeReport}.
 *
 * @throws ReencodeError `unsupported` when a whitelist stopped the probe,
 * `unreadable` when the file could not be parsed, `failed` when ffprobe timed
 * out or never ran.
 */
export const readProbe = (result: ProcessResult): ProbeReport => {
  if (result.code !== 0) {
    throw processFailure('ffprobe', result);
  }
  const parsed = probeOutputSchema.safeParse(parseJson(result.stdout));
  if (!parsed.success) {
    throw new ReencodeError('unreadable', 'ffprobe output was not a probe');
  }
  const { format, streams } = parsed.data;

  return {
    formatNames: format.format_name.split(',').filter((name) => name !== ''),
    durationSeconds: format.duration,
    bitRate: format.bit_rate,
    streams: streams.map((stream) => ({
      index: stream.index,
      codecType: stream.codec_type ?? null,
      attachedPicture: stream.disposition?.attached_pic === 1,
      width: stream.width,
      height: stream.height,
      bitRate: stream.bit_rate,
    })),
  };
};

/** MP3 bitrates (MPEG-1 Layer III) the kept copy may use, highest first. */
const MP3_BITRATES_KBPS = [192, 160, 128, 112, 96, 80, 64] as const;
const MP3_MAX_KBPS = 192;
const MP3_MIN_KBPS = 64;

/**
 * The bitrate an audio copy is written at: the highest valid MP3 bitrate that
 * is at most 192 kbps and not above the source, and never below 64 kbps. A
 * source that does not state its bitrate is kept at 192.
 */
export const mp3BitrateKbps = (sourceBitsPerSecond: number | null): number => {
  if (sourceBitsPerSecond === null || sourceBitsPerSecond <= 0) {
    return MP3_MAX_KBPS;
  }
  const sourceKbps = sourceBitsPerSecond / 1000;

  return MP3_BITRATES_KBPS.find((bitrate) => bitrate <= sourceKbps) ?? MP3_MIN_KBPS;
};

/** A length may run this far past its limit: containers round and pad. */
const DURATION_TOLERANCE_SECONDS = 1;

/**
 * Refuse a length over its kind's limit. An unknown length passes: the encode
 * is capped, and the written copy is measured again.
 *
 * @throws ReencodeError `too-long`.
 */
export const assertWithinDuration = (
  durationSeconds: number | null,
  kind: 'AUDIO' | 'VIDEO'
): void => {
  const limit = kind === 'VIDEO' ? ATTACHMENT_MAX_VIDEO_SECONDS : ATTACHMENT_MAX_AUDIO_SECONDS;
  if (durationSeconds !== null && durationSeconds > limit + DURATION_TOLERANCE_SECONDS) {
    throw new ReencodeError('too-long', `${kind} runs ${Math.round(durationSeconds)}s`);
  }
};

/** Whether every name the demuxer goes by is an allowed container. */
const isAllowedFormat = (formatNames: readonly string[]): boolean =>
  formatNames.length > 0 && formatNames.every((name) => ALLOWED_FORMATS.includes(name));

/**
 * Decide what to write for a probed file.
 *
 * The format name is checked here as well as by ffprobe's own whitelist: a
 * playlist, a concat script or an image sequence must not pass on one guard
 * alone. A video upload with no picture is kept as audio; cover art is not a
 * picture.
 *
 * @throws ReencodeError `unsupported` for a format off the list or a file with
 * nothing to keep, `too-long` for a length over its kind's limit.
 */
export const planMedia = (report: ProbeReport, declared: 'AUDIO' | 'VIDEO'): MediaPlan => {
  if (!isAllowedFormat(report.formatNames)) {
    throw new ReencodeError('unsupported', `format ${report.formatNames.join(',')}`);
  }
  const { durationSeconds, streams } = report;
  const picture =
    declared === 'VIDEO'
      ? streams.find((stream) => stream.codecType === 'video' && !stream.attachedPicture)
      : undefined;
  const sound = streams.find((stream) => stream.codecType === 'audio');

  if (picture) {
    assertWithinDuration(durationSeconds, 'VIDEO');
    return {
      kind: 'VIDEO',
      videoIndex: picture.index,
      audioIndex: sound?.index ?? null,
      durationSeconds,
    };
  }
  if (!sound) {
    throw new ReencodeError('unsupported', 'no picture and no sound to keep');
  }
  assertWithinDuration(durationSeconds, 'AUDIO');
  return {
    kind: 'AUDIO',
    audioIndex: sound.index,
    bitrateKbps: mp3BitrateKbps(sound.bitRate ?? report.bitRate),
    durationSeconds,
  };
};
