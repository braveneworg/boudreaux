/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeTagViaFfmpeg } from './ffmpeg';

import type { WriteCommentOptions } from './types/audio';

/**
 * Writes or replaces the COMMENT Vorbis tag in an Ogg Vorbis (.ogg / .oga) file.
 *
 * Vorbis Comments use a plain key=value format. The COMMENT key is the
 * conventional field for freeform comments.
 */
export async function writeOggComment(
  filePath: string,
  comment: string,
  _options?: WriteCommentOptions
): Promise<void> {
  await writeTagViaFfmpeg(filePath, 'COMMENT', comment);
}
