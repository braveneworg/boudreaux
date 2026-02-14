import 'server-only';

import { createHash } from 'node:crypto';

import * as mm from 'music-metadata';

import type { ServiceResponse } from './service.types';
import type { Readable } from 'node:stream';

/**
 * Audio metadata extracted from an audio file
 */
export interface AudioMetadata {
  /** Track title from metadata */
  title?: string;
  /** Artist name(s) from metadata */
  artist?: string;
  /** Album name from metadata */
  album?: string;
  /** Duration in seconds */
  duration?: number;
  /** Track number on the album */
  trackNumber?: number;
  /** Total tracks on the album */
  trackTotal?: number;
  /** Year or date of release */
  year?: number;
  /** Release date (full date if available) */
  date?: string;
  /** Genre(s) */
  genre?: string[];
  /** Record label */
  label?: string;
  /** Catalog number */
  catalogNumber?: string;
  /** Album artist (may differ from track artist) */
  albumArtist?: string;
  /** Bitrate in kbps */
  bitrate?: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of audio channels */
  channels?: number;
  /** Audio codec */
  codec?: string;
  /** File format container */
  container?: string;
  /** Whether the file is lossless */
  lossless?: boolean;
  /** Cover art as base64 data URL (if present) */
  coverArt?: string;
  /** Cover art MIME type */
  coverArtMimeType?: string;
  /** SHA-256 hash of the audio file content for duplicate detection */
  audioFileHash?: string;
}

/**
 * Service for extracting metadata from audio files
 */
export class AudioMetadataService {
  /**
   * Extract metadata from an audio file buffer
   * @param buffer - The audio file buffer
   * @param mimeType - The MIME type of the audio file
   * @param fileName - Optional file name for format detection
   */
  static async extractMetadata(
    buffer: Buffer,
    mimeType: string,
    _fileName?: string
  ): Promise<ServiceResponse<AudioMetadata>> {
    try {
      // Compute SHA-256 hash of the file content for duplicate detection
      const audioFileHash = createHash('sha256').update(buffer).digest('hex');

      const metadata = await mm.parseBuffer(buffer, {
        mimeType,
        size: buffer.length,
      });

      const { format, common } = metadata;

      // Extract cover art if available
      let coverArt: string | undefined;
      let coverArtMimeType: string | undefined;

      if (common.picture && common.picture.length > 0) {
        const picture = common.picture[0];
        const base64Data = Buffer.from(picture.data).toString('base64');
        coverArt = `data:${picture.format};base64,${base64Data}`;
        coverArtMimeType = picture.format;
      }

      const result: AudioMetadata = {
        // Basic track info
        title: common.title,
        artist: common.artist || common.artists?.join(', '),
        album: common.album,
        albumArtist: common.albumartist,
        duration: format.duration ? Math.round(format.duration) : undefined,

        // Track position info
        trackNumber: common.track?.no ?? undefined,
        trackTotal: common.track?.of ?? undefined,

        // Release info
        year: common.year,
        date: common.date,
        genre: common.genre,
        label: common.label?.[0],
        catalogNumber: common.catalognumber?.[0],

        // Technical info
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
        sampleRate: format.sampleRate,
        channels: format.numberOfChannels,
        codec: format.codec,
        container: format.container,
        lossless: format.lossless,

        // Cover art
        coverArt,
        coverArtMimeType,

        // File hash
        audioFileHash,
      };

      return { success: true, data: result };
    } catch (error) {
      console.error('Audio metadata extraction error:', error);

      if (error instanceof Error) {
        // Handle specific music-metadata errors
        if (error.message.includes('MIME-type')) {
          return {
            success: false,
            error: 'Unsupported audio format. Please upload a valid audio file.',
          };
        }
        if (error.message.includes('End-Of-Stream')) {
          return {
            success: false,
            error: 'Invalid or corrupted audio file.',
          };
        }
        return { success: false, error: `Failed to extract metadata: ${error.message}` };
      }

      return { success: false, error: 'Failed to extract audio metadata' };
    }
  }

  /**
   * Extract metadata from a file stream (for larger files)
   * @param stream - Readable stream of the audio file
   * @param mimeType - The MIME type of the audio file
   * @param fileSize - Size of the file in bytes
   */
  static async extractMetadataFromStream(
    stream: Readable,
    mimeType: string,
    fileSize: number
  ): Promise<ServiceResponse<AudioMetadata>> {
    try {
      const metadata = await mm.parseStream(stream, {
        mimeType,
        size: fileSize,
      });

      const { format, common } = metadata;

      // Extract cover art if available
      let coverArt: string | undefined;
      let coverArtMimeType: string | undefined;

      if (common.picture && common.picture.length > 0) {
        const picture = common.picture[0];
        const base64Data = Buffer.from(picture.data).toString('base64');
        coverArt = `data:${picture.format};base64,${base64Data}`;
        coverArtMimeType = picture.format;
      }

      const result: AudioMetadata = {
        title: common.title,
        artist: common.artist || common.artists?.join(', '),
        album: common.album,
        duration: format.duration ? Math.round(format.duration) : undefined,
        trackNumber: common.track?.no ?? undefined,
        trackTotal: common.track?.of ?? undefined,
        year: common.year,
        genre: common.genre,
        bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
        sampleRate: format.sampleRate,
        channels: format.numberOfChannels,
        codec: format.codec,
        container: format.container,
        lossless: format.lossless,
        coverArt,
        coverArtMimeType,
      };

      return { success: true, data: result };
    } catch (error) {
      console.error('Audio metadata extraction from stream error:', error);

      if (error instanceof Error) {
        return { success: false, error: `Failed to extract metadata: ${error.message}` };
      }

      return { success: false, error: 'Failed to extract audio metadata from stream' };
    }
  }
}
