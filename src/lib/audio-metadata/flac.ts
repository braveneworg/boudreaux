/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeTagViaFfmpeg } from './ffmpeg';

import type { WriteCommentOptions } from './types/audio';

/**
 * Writes or replaces the COMMENT Vorbis tag in a FLAC file.
 *
 * FLAC embeds Vorbis Comments in its VORBIS_COMMENT metadata block —
 * the same key=value spec used by Ogg Vorbis, so the tag key is identical.
 */
export async function writeFlacComment(
  filePath: string,
  comment: string,
  _options?: WriteCommentOptions
): Promise<void> {
  await writeTagViaFfmpeg(filePath, 'COMMENT', comment);
}
