/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AudioTagStripService } from './audio-tag-strip-service';

// Mock server-only to allow testing server components
vi.mock('server-only', () => ({}));

// Mock node-taglib-sharp
const mockDispose = vi.fn();
const mockSave = vi.fn();
const mockTag = { comment: undefined as string | undefined };
const mockCreateFromPath = vi.fn((_path: string) => ({
  tag: mockTag,
  save: mockSave,
  dispose: mockDispose,
}));

vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: (path: string) => mockCreateFromPath(path),
  },
}));

// Mock node:fs/promises
const mockStat = vi.fn();
vi.mock('node:fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

describe('AudioTagStripService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTag.comment = undefined;
    mockStat.mockResolvedValue({ size: 5_000_000 });
  });

  describe('stripCommentTag', () => {
    it('should strip comment when present', async () => {
      mockTag.comment = 'Encoded by LAME 3.99.5';

      const result = await AudioTagStripService.stripCommentTag('/tmp/test.mp3');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.commentFound).toBe(true);
      expect(result.data.finalFileSize).toBe(5_000_000);
      expect(mockSave).toHaveBeenCalledOnce();
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should report no comment found when tag.comment is undefined', async () => {
      mockTag.comment = undefined;

      const result = await AudioTagStripService.stripCommentTag('/tmp/test.flac');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.commentFound).toBe(false);
      expect(result.data.finalFileSize).toBe(5_000_000);
      expect(mockSave).not.toHaveBeenCalled();
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should report no comment found when tag.comment is empty string', async () => {
      mockTag.comment = '';

      const result = await AudioTagStripService.stripCommentTag('/tmp/test.wav');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.commentFound).toBe(false);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should report no comment found when tag.comment is whitespace only', async () => {
      mockTag.comment = '   ';

      const result = await AudioTagStripService.stripCommentTag('/tmp/test.ogg');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.commentFound).toBe(false);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should set comment to undefined when stripping', async () => {
      mockTag.comment = 'Some comment';

      await AudioTagStripService.stripCommentTag('/tmp/test.mp3');

      expect(mockTag.comment).toBeUndefined();
    });

    it('should return error response when file open fails', async () => {
      mockCreateFromPath.mockImplementationOnce(() => {
        throw new Error('File not found or corrupt');
      });

      const result = await AudioTagStripService.stripCommentTag('/tmp/corrupt.mp3');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('File not found or corrupt');
    });

    it('should return error response when file save fails', async () => {
      mockTag.comment = 'Will fail to save';
      mockSave.mockImplementationOnce(() => {
        throw new Error('Write permission denied');
      });

      const result = await AudioTagStripService.stripCommentTag('/tmp/readonly.mp3');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Write permission denied');
      // dispose should still be called via finally
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockCreateFromPath.mockImplementationOnce(() => {
        throw 'unexpected string error';
      });

      const result = await AudioTagStripService.stripCommentTag('/tmp/failing.mp3');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to strip comment tag');
    });

    it('should always call dispose even when stat fails after stripping', async () => {
      mockTag.comment = 'Some comment';
      mockStat.mockRejectedValueOnce(new Error('stat failed'));

      const result = await AudioTagStripService.stripCommentTag('/tmp/test.mp3');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('stat failed');
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should return correct file size from stat', async () => {
      mockTag.comment = 'Comment to strip';
      mockStat.mockResolvedValueOnce({ size: 4_999_500 });

      const result = await AudioTagStripService.stripCommentTag('/tmp/test.mp3');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.finalFileSize).toBe(4_999_500);
    });
  });
});
