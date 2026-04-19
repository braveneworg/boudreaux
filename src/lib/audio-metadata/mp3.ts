/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import NodeID3 from 'node-id3';

import type { WriteCommentOptions } from './types/audio';

/**
 * Writes or replaces the COMM (comment) frame in an MP3 file using node-id3.
 *
 * Works identically for CBR (e.g. 320kbps) and VBR (e.g. V0) MP3s —
 * the encoding method has no effect on ID3 tag handling.
 *
 * The ID3v2 COMM frame supports a language code and a short description
 * field in addition to the comment text. The language defaults to 'eng'.
 * node-id3 is preferred over ffmpeg here because ffmpeg does not expose
 * the language and shortText subfields of the COMM frame.
 */
export async function writeMp3Comment(
  filePath: string,
  comment: string,
  options: WriteCommentOptions = {}
): Promise<void> {
  const { language = 'eng' } = options;

  const existingTags = NodeID3.read(filePath);

  const updatedTags: NodeID3.Tags = {
    ...existingTags,
    comment: {
      language,
      text: comment,
    },
  };

  const result = NodeID3.update(updatedTags, filePath);

  if (result !== true) {
    throw new Error(`node-id3 failed to write comment to "${filePath}": ${result}`);
  }
}
