/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { writeTagViaFfmpeg } from './ffmpeg';

import type { WriteCommentOptions } from './types/audio';

/**
 * Writes or replaces the comment metadata tag in an AIFF (.aiff / .aif) file.
 *
 * AIFF supports ID3v2 tags stored in an `ID3 ` chunk. ffmpeg reads and
 * writes these tags transparently via `-metadata comment=…` with
 * `-codec copy` (no re-encode).
 */
export async function writeAiffComment(
  filePath: string,
  comment: string,
  _options?: WriteCommentOptions
): Promise<void> {
  await writeTagViaFfmpeg(filePath, 'comment', comment);
}
