/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generateS3Key,
  getDefaultMimeType,
  getFileExtensionForFormat,
} from '@/lib/constants/digital-formats';

describe('digital-formats constants', () => {
  describe('generateS3Key', () => {
    it('should return the correct S3 key pattern', () => {
      const result = generateS3Key('release-123', 'FLAC', 'file-abc', 'flac');

      expect(result).toBe('releases/release-123/digital-formats/FLAC/file-abc.flac');
    });

    it('should handle different format types', () => {
      const result = generateS3Key('r1', 'MP3_320KBPS', 'f1', 'mp3');

      expect(result).toBe('releases/r1/digital-formats/MP3_320KBPS/f1.mp3');
    });
  });

  describe('getFileExtensionForFormat', () => {
    it.each([
      ['MP3_V0', 'mp3'],
      ['MP3_320KBPS', 'mp3'],
      ['AAC', 'aac'],
      ['OGG_VORBIS', 'ogg'],
      ['FLAC', 'flac'],
      ['ALAC', 'm4a'],
      ['WAV', 'wav'],
      ['AIFF', 'aiff'],
    ] as const)('should return "%s" extension for %s format', (formatType, expectedExtension) => {
      expect(getFileExtensionForFormat(formatType)).toBe(expectedExtension);
    });
  });

  describe('getDefaultMimeType', () => {
    it.each([
      ['MP3_V0', 'audio/mpeg'],
      ['MP3_320KBPS', 'audio/mpeg'],
      ['AAC', 'audio/aac'],
      ['OGG_VORBIS', 'audio/ogg'],
      ['FLAC', 'audio/flac'],
      ['ALAC', 'audio/x-m4a'],
      ['WAV', 'audio/wav'],
      ['AIFF', 'audio/aiff'],
    ] as const)(
      'should return the first MIME type for %s format',
      (formatType, expectedMimeType) => {
        expect(getDefaultMimeType(formatType)).toBe(expectedMimeType);
      }
    );
  });
});
