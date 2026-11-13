/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  ATTACHMENT_MAX_AUDIO_SECONDS,
  ATTACHMENT_MAX_VIDEO_SECONDS,
  ATTACHMENT_VIDEO_SHORT_SIDE,
} from './types.js';

/**
 * The argument vectors ffprobe and ffmpeg are run with (ADR-0026). Every one
 * reads a single local file under the two guards in {@link inputGuards}; none
 * is ever handed a URL.
 */

/**
 * The container demuxers a user's file may be opened with. Everything else is
 * refused before a byte is decoded — above all the demuxers that read a text
 * file naming other files to open (an HLS playlist, a concat script, an SDP
 * description, an image sequence), which is how a "media" upload reaches a
 * file or a host the uploader should not.
 */
export const ALLOWED_FORMATS: readonly string[] = [
  'mov',
  'mp4',
  'm4a',
  '3gp',
  '3g2',
  'mj2',
  'matroska',
  'webm',
  'avi',
  'mp3',
  'wav',
  'flac',
  'ogg',
  'aiff',
  'aac',
];

/**
 * How far past a limit an encode keeps writing. A source that hides or lies
 * about its length is stopped here, and the written copy is then measured.
 */
const DURATION_CAP_MARGIN_SECONDS = 2;

/** H.264 speed/size trade-off: fast enough for ten minutes inside the run budget. */
const VIDEO_PRESET = 'veryfast';
/** H.264 constant quality: visually clean at 720p. */
const VIDEO_CRF = '23';
/** A ceiling on the video bitrate, so a noisy source cannot fill the temp dir. */
const VIDEO_MAX_RATE = '5M';
const VIDEO_BUFFER_SIZE = '10M';
/** AAC bitrate for a video's stereo sound. */
const VIDEO_AUDIO_BITRATE = '128k';
/** JPEG quantiser for the poster frame (2 is best, 31 worst). */
const POSTER_QUALITY = '3';

/**
 * Input options that hold a demuxer to one local file: no protocol but
 * `file` (so no network, no `concat:` or `subfile:`), and no demuxer but the
 * listed containers. They are input options, so they must precede `-i`.
 */
const inputGuards = (): string[] => [
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  ALLOWED_FORMATS.join(','),
];

/** Flags every ffmpeg run starts with: quiet, non-interactive, overwrite its own output. */
const ffmpegPreamble = (): string[] => ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y'];

/** Output options that drop everything but the mapped picture and sound. */
const stripOutput = (): string[] => ['-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn'];

/**
 * `scale` arguments that hold the short side to the limit, never enlarge, and
 * land on even dimensions (4:2:0 needs them). `-2` keeps the aspect ratio and
 * rounds the other side to even.
 */
const scaleFilter = (): string => {
  const side = (dimension: 'iw' | 'ih'): string =>
    `max(2,2*trunc(min(${ATTACHMENT_VIDEO_SHORT_SIDE},${dimension})/2))`;

  return `scale=w='if(gt(iw,ih),-2,${side('iw')})':h='if(gt(iw,ih),${side('ih')},-2)'`;
};

/**
 * ffprobe: the container's name and length, and each stream's type and size,
 * as JSON. Tags are not asked for: they are text a stranger wrote.
 */
export const probeArgs = (inputPath: string): string[] => [
  '-v',
  'error',
  '-hide_banner',
  ...inputGuards(),
  '-print_format',
  'json',
  '-show_entries',
  'format=format_name,duration,bit_rate:stream=index,codec_type,codec_name,width,height,bit_rate:stream_disposition=attached_pic',
  '-i',
  inputPath,
];

/** What {@link videoArgs} needs. */
export interface VideoArgsRequest {
  inputPath: string;
  outputPath: string;
  /** The source's stream index of the picture to keep. */
  videoIndex: number;
  /** The source's stream index of the sound to keep, or `null` for a silent video. */
  audioIndex: number | null;
}

/** The sound options of a video: AAC stereo, or none. */
const videoAudioArgs = (audioIndex: number | null): string[] =>
  audioIndex === null
    ? ['-an']
    : ['-map', `0:${audioIndex}`, '-c:a', 'aac', '-b:a', VIDEO_AUDIO_BITRATE, '-ac', '2'];

/** ffmpeg: one picture stream and at most one sound stream, as H.264 + AAC in MP4. */
export const videoArgs = ({
  inputPath,
  outputPath,
  videoIndex,
  audioIndex,
}: VideoArgsRequest): string[] => [
  ...ffmpegPreamble(),
  ...inputGuards(),
  '-i',
  inputPath,
  '-map',
  `0:${videoIndex}`,
  ...videoAudioArgs(audioIndex),
  ...stripOutput(),
  '-vf',
  scaleFilter(),
  '-c:v',
  'libx264',
  '-preset',
  VIDEO_PRESET,
  '-crf',
  VIDEO_CRF,
  '-maxrate',
  VIDEO_MAX_RATE,
  '-bufsize',
  VIDEO_BUFFER_SIZE,
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-t',
  String(ATTACHMENT_MAX_VIDEO_SECONDS + DURATION_CAP_MARGIN_SECONDS),
  '-progress',
  'pipe:1',
  '-nostats',
  '-f',
  'mp4',
  outputPath,
];

/** What {@link audioArgs} needs. */
export interface AudioArgsRequest {
  inputPath: string;
  outputPath: string;
  /** The source's stream index of the sound to keep. */
  audioIndex: number;
  /** A valid MP3 bitrate, in kbps. */
  bitrateKbps: number;
}

/** ffmpeg: one sound stream, as MP3. */
export const audioArgs = ({
  inputPath,
  outputPath,
  audioIndex,
  bitrateKbps,
}: AudioArgsRequest): string[] => [
  ...ffmpegPreamble(),
  ...inputGuards(),
  '-i',
  inputPath,
  '-map',
  `0:${audioIndex}`,
  '-vn',
  ...stripOutput(),
  '-c:a',
  'libmp3lame',
  '-b:a',
  `${bitrateKbps}k`,
  '-t',
  String(ATTACHMENT_MAX_AUDIO_SECONDS + DURATION_CAP_MARGIN_SECONDS),
  '-progress',
  'pipe:1',
  '-nostats',
  '-f',
  'mp3',
  outputPath,
];

/** What {@link posterArgs} needs. */
export interface PosterArgsRequest {
  /** The written copy — never the upload. */
  inputPath: string;
  outputPath: string;
  /** How far into the copy the frame is taken, in seconds. */
  atSeconds: number;
}

/** ffmpeg: one frame of the written copy, as a JPEG. */
export const posterArgs = ({ inputPath, outputPath, atSeconds }: PosterArgsRequest): string[] => [
  ...ffmpegPreamble(),
  ...inputGuards(),
  '-ss',
  String(atSeconds),
  '-i',
  inputPath,
  '-map',
  '0:v:0',
  '-an',
  ...stripOutput(),
  '-frames:v',
  '1',
  '-c:v',
  'mjpeg',
  '-q:v',
  POSTER_QUALITY,
  '-f',
  'image2',
  '-update',
  '1',
  outputPath,
];
