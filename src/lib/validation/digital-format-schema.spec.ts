/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect } from 'vitest';

import { FORMAT_SIZE_LIMITS } from '@/lib/constants/digital-formats';

import {
  digitalFormatUploadSchema,
  digitalFormatConfirmationSchema,
  multiTrackConfirmationSchema,
} from './digital-format-schema';

describe('digitalFormatUploadSchema', () => {
  describe('MP3_V0 validation', () => {
    it('should accept valid MP3 V0 file within size limit', () => {
      const valid = {
        formatType: 'MP3_V0',
        fileName: 'album.mp3',
        fileSize: FORMAT_SIZE_LIMITS.MP3_V0 - 1000,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject MP3 V0 file exceeding size limit', () => {
      const oversized = {
        formatType: 'MP3_V0',
        fileName: 'album.mp3',
        fileSize: FORMAT_SIZE_LIMITS.MP3_V0 + 1,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(oversized);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('50');
    });

    it('should reject MP3 V0 with invalid MIME type', () => {
      const invalidMime = {
        formatType: 'MP3_V0',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: 'audio/flac',
      };

      const result = digitalFormatUploadSchema.safeParse(invalidMime);
      expect(result.success).toBe(false);
    });
  });

  describe('MP3_320KBPS validation', () => {
    it('should accept valid MP3 file within size limit', () => {
      const validMP3 = {
        formatType: 'MP3_320KBPS',
        fileName: 'album.mp3',
        fileSize: FORMAT_SIZE_LIMITS.MP3_320KBPS - 1000,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(validMP3);
      expect(result.success).toBe(true);
    });

    it('should reject MP3 file exceeding size limit', () => {
      const oversizedMP3 = {
        formatType: 'MP3_320KBPS',
        fileName: 'album.mp3',
        fileSize: FORMAT_SIZE_LIMITS.MP3_320KBPS + 1,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(oversizedMP3);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('50');
    });

    it('should reject MP3 with invalid MIME type', () => {
      const invalidMimeType = {
        formatType: 'MP3_320KBPS',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: 'audio/flac',
      };

      const result = digitalFormatUploadSchema.safeParse(invalidMimeType);
      expect(result.success).toBe(false);
    });
  });

  describe('AAC validation', () => {
    it('should accept valid AAC file within size limit', () => {
      const validAAC = {
        formatType: 'AAC',
        fileName: 'album.aac',
        fileSize: FORMAT_SIZE_LIMITS.AAC - 500,
        mimeType: 'audio/aac',
      };

      const result = digitalFormatUploadSchema.safeParse(validAAC);
      expect(result.success).toBe(true);
    });

    it('should reject AAC file exceeding size limit', () => {
      const oversizedAAC = {
        formatType: 'AAC',
        fileName: 'album.aac',
        fileSize: FORMAT_SIZE_LIMITS.AAC + 1000,
        mimeType: 'audio/aac',
      };

      const result = digitalFormatUploadSchema.safeParse(oversizedAAC);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('50');
    });

    it('should accept audio/x-aac MIME type variant', () => {
      const validAAC = {
        formatType: 'AAC',
        fileName: 'album.aac',
        fileSize: 50000000,
        mimeType: 'audio/x-aac',
      };

      const result = digitalFormatUploadSchema.safeParse(validAAC);
      expect(result.success).toBe(true);
    });
  });

  describe('FLAC validation', () => {
    it('should accept valid FLAC file within size limit', () => {
      const validFLAC = {
        formatType: 'FLAC',
        fileName: 'album.flac',
        fileSize: FORMAT_SIZE_LIMITS.FLAC - 1000,
        mimeType: 'audio/flac',
      };

      const result = digitalFormatUploadSchema.safeParse(validFLAC);
      expect(result.success).toBe(true);
    });

    it('should reject FLAC file exceeding size limit', () => {
      const oversizedFLAC = {
        formatType: 'FLAC',
        fileName: 'album.flac',
        fileSize: FORMAT_SIZE_LIMITS.FLAC + 1,
        mimeType: 'audio/flac',
      };

      const result = digitalFormatUploadSchema.safeParse(oversizedFLAC);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('150');
    });

    it('should accept audio/x-flac MIME type variant', () => {
      const validFLAC = {
        formatType: 'FLAC',
        fileName: 'album.flac',
        fileSize: 100000000,
        mimeType: 'audio/x-flac',
      };

      const result = digitalFormatUploadSchema.safeParse(validFLAC);
      expect(result.success).toBe(true);
    });
  });

  describe('WAV validation', () => {
    it('should accept valid WAV file within size limit', () => {
      const validWAV = {
        formatType: 'WAV',
        fileName: 'album.wav',
        fileSize: FORMAT_SIZE_LIMITS.WAV - 1000,
        mimeType: 'audio/wav',
      };

      const result = digitalFormatUploadSchema.safeParse(validWAV);
      expect(result.success).toBe(true);
    });

    it('should reject WAV file exceeding size limit', () => {
      const oversizedWAV = {
        formatType: 'WAV',
        fileName: 'album.wav',
        fileSize: FORMAT_SIZE_LIMITS.WAV + 1,
        mimeType: 'audio/wav',
      };

      const result = digitalFormatUploadSchema.safeParse(oversizedWAV);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('300');
    });

    it('should accept audio/x-wav MIME type variant', () => {
      const validWAV = {
        formatType: 'WAV',
        fileName: 'album.wav',
        fileSize: FORMAT_SIZE_LIMITS.WAV - 1000,
        mimeType: 'audio/x-wav',
      };

      const result = digitalFormatUploadSchema.safeParse(validWAV);
      expect(result.success).toBe(true);
    });

    it('should accept audio/wave MIME type variant', () => {
      const validWAV = {
        formatType: 'WAV',
        fileName: 'album.wav',
        fileSize: FORMAT_SIZE_LIMITS.WAV - 1000,
        mimeType: 'audio/wave',
      };

      const result = digitalFormatUploadSchema.safeParse(validWAV);
      expect(result.success).toBe(true);
    });
  });

  describe('OGG_VORBIS validation', () => {
    it('should accept valid Ogg Vorbis file within size limit', () => {
      const valid = {
        formatType: 'OGG_VORBIS',
        fileName: 'album.ogg',
        fileSize: FORMAT_SIZE_LIMITS.OGG_VORBIS - 1000,
        mimeType: 'audio/ogg',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject Ogg Vorbis file exceeding size limit', () => {
      const oversized = {
        formatType: 'OGG_VORBIS',
        fileName: 'album.ogg',
        fileSize: FORMAT_SIZE_LIMITS.OGG_VORBIS + 1,
        mimeType: 'audio/ogg',
      };

      const result = digitalFormatUploadSchema.safeParse(oversized);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('50');
    });

    it('should accept audio/vorbis MIME type variant', () => {
      const valid = {
        formatType: 'OGG_VORBIS',
        fileName: 'album.ogg',
        fileSize: 50000000,
        mimeType: 'audio/vorbis',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept application/ogg MIME type variant', () => {
      const valid = {
        formatType: 'OGG_VORBIS',
        fileName: 'album.ogg',
        fileSize: 50000000,
        mimeType: 'application/ogg',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('ALAC validation', () => {
    it('should accept valid ALAC file within size limit', () => {
      const valid = {
        formatType: 'ALAC',
        fileName: 'album.m4a',
        fileSize: FORMAT_SIZE_LIMITS.ALAC - 1000,
        mimeType: 'audio/x-m4a',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject ALAC file exceeding size limit', () => {
      const oversized = {
        formatType: 'ALAC',
        fileName: 'album.m4a',
        fileSize: FORMAT_SIZE_LIMITS.ALAC + 1,
        mimeType: 'audio/x-m4a',
      };

      const result = digitalFormatUploadSchema.safeParse(oversized);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('150');
    });

    it('should accept audio/m4a MIME type variant', () => {
      const valid = {
        formatType: 'ALAC',
        fileName: 'album.m4a',
        fileSize: 100000000,
        mimeType: 'audio/m4a',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should accept audio/mp4 MIME type variant', () => {
      const valid = {
        formatType: 'ALAC',
        fileName: 'album.m4a',
        fileSize: 100000000,
        mimeType: 'audio/mp4',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('AIFF validation', () => {
    it('should accept valid AIFF file within size limit', () => {
      const valid = {
        formatType: 'AIFF',
        fileName: 'album.aiff',
        fileSize: FORMAT_SIZE_LIMITS.AIFF - 1000,
        mimeType: 'audio/aiff',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject AIFF file exceeding size limit', () => {
      const oversized = {
        formatType: 'AIFF',
        fileName: 'album.aiff',
        fileSize: FORMAT_SIZE_LIMITS.AIFF + 1,
        mimeType: 'audio/aiff',
      };

      const result = digitalFormatUploadSchema.safeParse(oversized);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('300');
    });

    it('should accept audio/x-aiff MIME type variant', () => {
      const valid = {
        formatType: 'AIFF',
        fileName: 'album.aiff',
        fileSize: FORMAT_SIZE_LIMITS.AIFF - 1000,
        mimeType: 'audio/x-aiff',
      };

      const result = digitalFormatUploadSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('Common field validation', () => {
    it('should reject negative file size', () => {
      const negativeSize = {
        formatType: 'MP3_320KBPS',
        fileName: 'album.mp3',
        fileSize: -100,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(negativeSize);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('>0');
    });

    it('should reject zero file size', () => {
      const zeroSize = {
        formatType: 'MP3_320KBPS',
        fileName: 'album.mp3',
        fileSize: 0,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(zeroSize);
      expect(result.success).toBe(false);

      const errorMessage = (
        result as { success: false; error: { issues: { message: string }[] } }
      ).error.issues
        .map((i) => i.message)
        .join(' ');
      expect(errorMessage).toContain('>0');
    });

    it('should reject empty file name', () => {
      const emptyFileName = {
        formatType: 'MP3_320KBPS',
        fileName: '',
        fileSize: 50000000,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(emptyFileName);
      expect(result.success).toBe(false);
    });

    it('should reject invalid format type', () => {
      const invalidFormat = {
        formatType: 'INVALID_FORMAT',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: 'audio/mpeg',
      };

      const result = digitalFormatUploadSchema.safeParse(invalidFormat);
      expect(result.success).toBe(false);
    });
  });

  describe('Cross-format validation', () => {
    it('should reject MP3 format with FLAC MIME type', () => {
      const mismatchedData = {
        formatType: 'MP3_320KBPS',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: 'audio/flac',
      };

      const result = digitalFormatUploadSchema.safeParse(mismatchedData);
      expect(result.success).toBe(false);
    });

    it('should reject FLAC format with WAV MIME type', () => {
      const mismatchedData = {
        formatType: 'FLAC',
        fileName: 'album.flac',
        fileSize: 100000000,
        mimeType: 'audio/wav',
      };

      const result = digitalFormatUploadSchema.safeParse(mismatchedData);
      expect(result.success).toBe(false);
    });

    it('should accept empty MIME type for any format (browser folder picker)', () => {
      const emptyMime = {
        formatType: 'MP3_V0',
        fileName: 'album.mp3',
        fileSize: 50000000,
        mimeType: '',
      };

      const result = digitalFormatUploadSchema.safeParse(emptyMime);
      expect(result.success).toBe(true);
    });
  });
});

describe('digitalFormatConfirmationSchema', () => {
  it('should accept valid confirmation data with all fields', () => {
    const validConfirmation = {
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'MP3_320KBPS',
      s3Key: 'releases/123/digital-formats/MP3_320KBPS/album.mp3',
      fileName: 'album.mp3',
      fileSize: 50000000,
      mimeType: 'audio/mpeg',
    };

    const result = digitalFormatConfirmationSchema.safeParse(validConfirmation);
    expect(result.success).toBe(true);
  });

  it('should reject confirmation without releaseId', () => {
    const missingReleaseId = {
      formatType: 'MP3_320KBPS',
      s3Key: 'releases/123/digital-formats/MP3_320KBPS/album.mp3',
      fileName: 'album.mp3',
      fileSize: 50000000,
      mimeType: 'audio/mpeg',
    };

    const result = digitalFormatConfirmationSchema.safeParse(missingReleaseId);
    expect(result.success).toBe(false);
  });

  it('should reject confirmation without s3Key', () => {
    const missingS3Key = {
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: 50000000,
      mimeType: 'audio/mpeg',
    };

    const result = digitalFormatConfirmationSchema.safeParse(missingS3Key);
    expect(result.success).toBe(false);
  });

  it('should validate s3Key format', () => {
    const invalidS3Key = {
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'MP3_320KBPS',
      s3Key: '',
      fileName: 'album.mp3',
      fileSize: 50000000,
      mimeType: 'audio/mpeg',
    };

    const result = digitalFormatConfirmationSchema.safeParse(invalidS3Key);
    expect(result.success).toBe(false);
  });

  it('should apply same size limit validation as upload schema', () => {
    const oversizedConfirmation = {
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'MP3_320KBPS',
      s3Key: 'releases/123/digital-formats/MP3_320KBPS/album.mp3',
      fileName: 'album.mp3',
      fileSize: FORMAT_SIZE_LIMITS.MP3_320KBPS + 1000,
      mimeType: 'audio/mpeg',
    };

    const result = digitalFormatConfirmationSchema.safeParse(oversizedConfirmation);
    expect(result.success).toBe(false);
  });
});

describe('multiTrackConfirmationSchema', () => {
  const validMultiTrack = {
    releaseId: '507f1f77bcf86cd799439011',
    formatType: 'MP3_320KBPS',
    files: [
      {
        trackNumber: 1,
        s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/1-song1.mp3',
        fileName: 'song1.mp3',
        fileSize: 10000000,
        mimeType: 'audio/mpeg',
      },
      {
        trackNumber: 2,
        s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/2-song2.mp3',
        fileName: 'song2.mp3',
        fileSize: 12000000,
        mimeType: 'audio/mpeg',
      },
    ],
  };

  it('should accept valid multi-track confirmation data', () => {
    const result = multiTrackConfirmationSchema.safeParse(validMultiTrack);
    expect(result.success).toBe(true);
  });

  it('should reject empty files array', () => {
    const result = multiTrackConfirmationSchema.safeParse({
      ...validMultiTrack,
      files: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing releaseId', () => {
    const { releaseId: _releaseId, ...noReleaseId } = validMultiTrack;
    const result = multiTrackConfirmationSchema.safeParse(noReleaseId);
    expect(result.success).toBe(false);
  });

  it('should reject invalid format type', () => {
    const result = multiTrackConfirmationSchema.safeParse({
      ...validMultiTrack,
      formatType: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('should reject file with empty s3Key', () => {
    const result = multiTrackConfirmationSchema.safeParse({
      ...validMultiTrack,
      files: [{ ...validMultiTrack.files[0], s3Key: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject file with non-positive trackNumber', () => {
    const result = multiTrackConfirmationSchema.safeParse({
      ...validMultiTrack,
      files: [{ ...validMultiTrack.files[0], trackNumber: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject when total file size exceeds format limit', () => {
    // WAV total limit is 5GB, use enough tracks at a large per-track size
    // to exceed it while staying under the per-track limit (300MB)
    const hugeFiles = Array.from({ length: 20 }, (_, i) => ({
      trackNumber: i + 1,
      s3Key: `key-${i}`,
      fileName: `song${i}.wav`,
      fileSize: 290_000_000, // 290MB per track × 20 = 5.8GB > 5GB WAV limit
      mimeType: 'audio/wav',
    }));

    const result = multiTrackConfirmationSchema.safeParse({
      releaseId: '507f1f77bcf86cd799439011',
      formatType: 'WAV',
      files: hugeFiles,
    });
    expect(result.success).toBe(false);
  });

  it('should accept files within total size limit', () => {
    const smallFiles = Array.from({ length: 5 }, (_, i) => ({
      trackNumber: i + 1,
      s3Key: `key-${i}`,
      fileName: `song${i}.mp3`,
      fileSize: 5_000_000, // 5MB per track × 5 = 25MB (well under 1GB)
      mimeType: 'audio/mpeg',
    }));

    const result = multiTrackConfirmationSchema.safeParse({
      ...validMultiTrack,
      files: smallFiles,
    });
    expect(result.success).toBe(true);
  });
});
