/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { stat } from 'node:fs/promises';

import { File } from 'node-taglib-sharp';

import type { ServiceResponse } from '@/lib/services/service.types';

/**
 * Result of stripping comment metadata from an audio file
 */
export interface CommentStripResult {
  /** Whether a comment was found and stripped */
  commentFound: boolean;
  /** The original comment value (for logging) */
  originalComment?: string;
  /** Final file size in bytes after stripping (may differ from original) */
  finalFileSize: number;
}

/**
 * Service for stripping comment metadata tags from audio files.
 *
 * Uses `node-taglib-sharp` which supports all common audio formats:
 * MP3 (ID3v1/ID3v2), AAC, AIFF, FLAC, OGG Vorbis, M4A/ALAC, WAV.
 *
 * The unified `tag.comment` property abstracts over format-specific
 * comment fields (ID3v2 COMM frame, Vorbis COMMENT, MP4 ©cmt atom,
 * RIFF ICMT chunk, etc.).
 */
export class AudioTagStripService {
  /**
   * Strip the comment metadata tag from an audio file on disk.
   *
   * Modifies the file in-place. If no comment is present, the file is not modified.
   * Returns the final file size (which may differ from the original after tag modification).
   *
   * @param filePath - Absolute path to the audio file
   */
  static async stripCommentTag(filePath: string): Promise<ServiceResponse<CommentStripResult>> {
    let tagFile: ReturnType<typeof File.createFromPath> | undefined;

    try {
      tagFile = File.createFromPath(filePath);
      const originalComment = tagFile.tag.comment;

      if (originalComment && originalComment.trim().length > 0) {
        tagFile.tag.comment = undefined;
        tagFile.save();
        tagFile.dispose();
        tagFile = undefined;

        const fileStat = await stat(filePath);

        return {
          success: true,
          data: {
            commentFound: true,
            originalComment,
            finalFileSize: fileStat.size,
          },
        };
      }

      // No comment found — file unchanged
      tagFile.dispose();
      tagFile = undefined;

      const fileStat = await stat(filePath);

      return {
        success: true,
        data: {
          commentFound: false,
          finalFileSize: fileStat.size,
        },
      };
    } catch (error) {
      console.error('[audio-tag-strip] Failed to strip comment tag:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to strip comment tag',
      };
    } finally {
      try {
        tagFile?.dispose();
      } catch {
        // Ignore dispose errors
      }
    }
  }
}
