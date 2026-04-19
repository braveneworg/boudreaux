/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type AudioFormat = 'ogg' | 'flac' | 'aac' | 'alac' | 'mp3';

export interface WriteCommentOptions {
  /** BCP 47 / ISO 639-2 language code — only used for MP3 COMM frame (default: 'eng') */
  language?: string;
}

export interface AudioMetadataWriter {
  writeComment(filePath: string, comment: string, options?: WriteCommentOptions): Promise<void>;
}
