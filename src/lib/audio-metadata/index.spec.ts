/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { detectFormat, supportsComment, writeComment } from './index';

const mockWriteOggComment = vi.fn();
const mockWriteFlacComment = vi.fn();
const mockWriteAacComment = vi.fn();
const mockWriteMp3Comment = vi.fn();
const mockWriteAiffComment = vi.fn();

vi.mock('./ogg', () => ({
  writeOggComment: (...args: unknown[]) => mockWriteOggComment(...args),
}));

vi.mock('./flac', () => ({
  writeFlacComment: (...args: unknown[]) => mockWriteFlacComment(...args),
}));

vi.mock('./aac', () => ({
  writeAacComment: (...args: unknown[]) => mockWriteAacComment(...args),
}));

vi.mock('./mp3', () => ({
  writeMp3Comment: (...args: unknown[]) => mockWriteMp3Comment(...args),
}));

vi.mock('./aiff', () => ({
  writeAiffComment: (...args: unknown[]) => mockWriteAiffComment(...args),
}));

describe('audio-metadata/index', () => {
  describe('detectFormat', () => {
    it('should detect .ogg as ogg', () => {
      expect(detectFormat('/path/to/file.ogg')).toBe('ogg');
    });

    it('should detect .oga as ogg', () => {
      expect(detectFormat('/path/to/file.oga')).toBe('ogg');
    });

    it('should detect .flac as flac', () => {
      expect(detectFormat('/path/to/file.flac')).toBe('flac');
    });

    it('should detect .m4a as aac', () => {
      expect(detectFormat('/path/to/file.m4a')).toBe('aac');
    });

    it('should detect .aac as aac', () => {
      expect(detectFormat('/path/to/file.aac')).toBe('aac');
    });

    it('should detect .mp3 as mp3', () => {
      expect(detectFormat('/path/to/file.mp3')).toBe('mp3');
    });

    it('should detect .aiff as aiff', () => {
      expect(detectFormat('/path/to/file.aiff')).toBe('aiff');
    });

    it('should detect .aif as aiff', () => {
      expect(detectFormat('/path/to/file.aif')).toBe('aiff');
    });

    it('should handle uppercase extensions', () => {
      expect(detectFormat('/path/to/file.OGG')).toBe('ogg');
    });

    it('should handle mixed-case extensions', () => {
      expect(detectFormat('/path/to/file.FlAc')).toBe('flac');
    });

    it('should handle uppercase .AIFF extension', () => {
      expect(detectFormat('/path/to/file.AIFF')).toBe('aiff');
    });

    it('should throw for unsupported extension', () => {
      expect(() => detectFormat('/path/to/file.wav')).toThrow('Unsupported file extension ".wav"');
    });

    it('should throw for file with no extension', () => {
      expect(() => detectFormat('/path/to/file')).toThrow('Unsupported file extension ""');
    });

    it('should include supported extensions in error message', () => {
      expect(() => detectFormat('/path/to/file.xyz')).toThrow('Supported:');
    });
  });

  describe('supportsComment', () => {
    it('should return true for .ogg files', () => {
      expect(supportsComment('/path/to/file.ogg')).toBe(true);
    });

    it('should return true for .flac files', () => {
      expect(supportsComment('/path/to/file.flac')).toBe(true);
    });

    it('should return true for .mp3 files', () => {
      expect(supportsComment('/path/to/file.mp3')).toBe(true);
    });

    it('should return true for .aac files', () => {
      expect(supportsComment('/path/to/file.aac')).toBe(true);
    });

    it('should return true for .aiff files', () => {
      expect(supportsComment('/path/to/file.aiff')).toBe(true);
    });

    it('should return false for .wav files', () => {
      expect(supportsComment('/path/to/file.wav')).toBe(false);
    });

    it('should handle uppercase .WAV extension', () => {
      expect(supportsComment('/path/to/file.WAV')).toBe(false);
    });

    it('should return false for unknown extensions', () => {
      expect(supportsComment('/path/to/file.xyz')).toBe(false);
    });
  });

  describe('writeComment', () => {
    beforeEach(() => {
      mockWriteOggComment.mockResolvedValue(undefined);
      mockWriteFlacComment.mockResolvedValue(undefined);
      mockWriteAacComment.mockResolvedValue(undefined);
      mockWriteMp3Comment.mockResolvedValue(undefined);
      mockWriteAiffComment.mockResolvedValue(undefined);
    });

    it('should route .ogg files to writeOggComment', async () => {
      await writeComment('/tmp/track.ogg', 'test comment');

      expect(mockWriteOggComment).toHaveBeenCalledWith('/tmp/track.ogg', 'test comment', undefined);
    });

    it('should route .flac files to writeFlacComment', async () => {
      await writeComment('/tmp/track.flac', 'test comment');

      expect(mockWriteFlacComment).toHaveBeenCalledWith(
        '/tmp/track.flac',
        'test comment',
        undefined
      );
    });

    it('should route .aac files to writeAacComment', async () => {
      await writeComment('/tmp/track.aac', 'test comment');

      expect(mockWriteAacComment).toHaveBeenCalledWith('/tmp/track.aac', 'test comment', undefined);
    });

    it('should route .m4a files to writeAacComment', async () => {
      await writeComment('/tmp/track.m4a', 'test comment');

      expect(mockWriteAacComment).toHaveBeenCalledWith('/tmp/track.m4a', 'test comment', undefined);
    });

    it('should route .mp3 files to writeMp3Comment', async () => {
      await writeComment('/tmp/track.mp3', 'test comment');

      expect(mockWriteMp3Comment).toHaveBeenCalledWith('/tmp/track.mp3', 'test comment', undefined);
    });

    it('should route .aiff files to writeAiffComment', async () => {
      await writeComment('/tmp/track.aiff', 'test comment');

      expect(mockWriteAiffComment).toHaveBeenCalledWith(
        '/tmp/track.aiff',
        'test comment',
        undefined
      );
    });

    it('should route .aif files to writeAiffComment', async () => {
      await writeComment('/tmp/track.aif', 'test comment');

      expect(mockWriteAiffComment).toHaveBeenCalledWith(
        '/tmp/track.aif',
        'test comment',
        undefined
      );
    });

    it('should pass options through to the format writer', async () => {
      const options = { language: 'fra' };
      await writeComment('/tmp/track.mp3', 'test comment', options);

      expect(mockWriteMp3Comment).toHaveBeenCalledWith('/tmp/track.mp3', 'test comment', options);
    });

    it('should throw for unsupported formats', async () => {
      await expect(writeComment('/tmp/track.wav', 'test')).rejects.toThrow(
        'Unsupported file extension'
      );
    });
  });
});
