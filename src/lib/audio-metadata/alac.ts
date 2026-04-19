/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeTagViaFfmpeg } from './ffmpeg';

import type { WriteCommentOptions } from './types/audio';

/**
 * Writes or replaces the comment tag (©cmt atom) in an ALAC/M4A file.
 *
 * ALAC uses the same MP4 container as AAC, so metadata handling is
 * identical. The lossless audio encoding has no effect on tag behaviour.
 */
export async function writeAlacComment(
  filePath: string,
  comment: string,
  _options?: WriteCommentOptions
): Promise<void> {
  await writeTagViaFfmpeg(filePath, 'comment', comment);
}
