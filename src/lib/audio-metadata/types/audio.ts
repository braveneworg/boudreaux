/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type AudioFormat = 'ogg' | 'flac' | 'aac' | 'mp3' | 'aiff';

export interface WriteCommentOptions {
  /** ISO 639-2 three-letter language code — only used for MP3 COMM frame (default: 'eng') */
  language?: string;
}

export interface AudioMetadataWriter {
  writeComment(filePath: string, comment: string, options?: WriteCommentOptions): Promise<void>;
}
