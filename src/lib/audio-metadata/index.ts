/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import 'server-only';

import path from 'node:path';

import { writeAacComment } from './aac';
import { writeAiffComment } from './aiff';
import { writeFlacComment } from './flac';
import { writeMp3Comment } from './mp3';
import { writeOggComment } from './ogg';

import type { AudioFormat, WriteCommentOptions } from './types/audio';

const EXT_TO_FORMAT: Record<string, AudioFormat> = {
  '.ogg': 'ogg',
  '.oga': 'ogg',
  '.flac': 'flac',
  '.m4a': 'aac', // covers both AAC and ALAC — tag handling is identical
  '.aac': 'aac',
  '.mp3': 'mp3',
  '.aiff': 'aiff',
  '.aif': 'aiff',
};

/** Format extensions that do not support metadata comment tags. */
const COMMENTLESS_EXTENSIONS = new Set(['.wav']);

/**
 * Returns true if the file format supports writing comment metadata.
 * WAV files and unrecognized extensions are excluded.
 */
export function supportsComment(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return Object.hasOwn(EXT_TO_FORMAT, ext) && !COMMENTLESS_EXTENSIONS.has(ext);
}

/**
 * Detects the audio format from the file extension.
 * Throws if the extension is not recognised.
 */
export function detectFormat(filePath: string): AudioFormat {
  const ext = path.extname(filePath).toLowerCase();
  const format = EXT_TO_FORMAT[ext];
  if (!format) {
    throw new Error(
      `Unsupported file extension "${ext}". Supported: ${Object.keys(EXT_TO_FORMAT).join(', ')}`
    );
  }
  return format;
}

/**
 * Writes or replaces the comment/description metadata field in an audio file.
 *
 * Supports: Ogg Vorbis, FLAC, AAC/M4A, MP3 (CBR and VBR).
 *
 * Format is detected automatically from the file extension. Pass
 * `options.language` to control the ID3 COMM frame language for MP3 files
 * (defaults to 'eng'); the option is ignored for all other formats.
 *
 * @example
 * await writeComment('./track.flac', 'Mastered 2024-01-15')
 * await writeComment('./track.mp3', 'Remaster', { language: 'eng' })
 */
export async function writeComment(
  filePath: string,
  comment: string,
  options?: WriteCommentOptions
): Promise<void> {
  const format = detectFormat(filePath);

  switch (format) {
    case 'ogg':
      return writeOggComment(filePath, comment, options);
    case 'flac':
      return writeFlacComment(filePath, comment, options);
    case 'aac':
      return writeAacComment(filePath, comment, options);
    case 'mp3':
      return writeMp3Comment(filePath, comment, options);
    case 'aiff':
      return writeAiffComment(filePath, comment, options);
  }
}

export { writeOggComment, writeFlacComment, writeAacComment, writeMp3Comment, writeAiffComment };
export type { AudioFormat, WriteCommentOptions };
