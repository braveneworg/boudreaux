/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeTagViaFfmpeg } from './ffmpeg';

import type { WriteCommentOptions } from './types/audio';

/**
 * Writes or replaces the comment tag (©cmt atom) in an AAC/M4A file.
 *
 * AAC is delivered in an MP4 container which uses iTunes-style atoms.
 * ffmpeg maps the generic 'comment' key to the ©cmt atom automatically.
 */
export async function writeAacComment(
  filePath: string,
  comment: string,
  _options?: WriteCommentOptions
): Promise<void> {
  await writeTagViaFfmpeg(filePath, 'comment', comment);
}
