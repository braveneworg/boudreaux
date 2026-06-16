/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  collectFilesFromEntry,
  findMatchingFilesForFormat,
  formatFileSize,
  getValidExtensionsForFormat,
  MULTI_EXT_MAP,
} from './file-helpers';

describe('file-helpers', () => {
  describe('formatFileSize', () => {
    it('formats 0 as "0 Bytes"', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
    });

    it('formats sub-KB values as Bytes', () => {
      expect(formatFileSize(512)).toMatch(/Bytes$/);
    });

    it('formats KB-range values', () => {
      expect(formatFileSize(2048)).toBe('2 KB');
    });

    it('formats MB-range values with two decimals', () => {
      expect(formatFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB');
    });
  });

  describe('getValidExtensionsForFormat', () => {
    it('returns the multi-extension list for AIFF', () => {
      // AIFF accepts both .aiff and .aif via MULTI_EXT_MAP.
      const exts = getValidExtensionsForFormat('AIFF');
      expect(exts).toEqual(MULTI_EXT_MAP.aiff);
    });

    it('returns a single-extension list for FLAC', () => {
      expect(getValidExtensionsForFormat('FLAC')).toEqual(['flac']);
    });
  });

  describe('findMatchingFilesForFormat', () => {
    it('treats files without an extension as non-matches (?? "" fallback)', () => {
      // A file whose name contains no "." returns undefined from
      // split('.').pop()? — the `?? ''` fallback yields '' which never
      // matches a format extension.
      const noExtFile = new File(['data'], 'README', { type: 'text/plain' });
      const flacFile = new File(['data'], 'track.flac', { type: 'audio/flac' });

      const matches = findMatchingFilesForFormat([noExtFile, flacFile], 'FLAC');

      expect(matches).toEqual([flacFile]);
    });

    it('matches by case-insensitive extension', () => {
      const upper = new File(['data'], 'Track.FLAC', { type: 'audio/flac' });
      expect(findMatchingFilesForFormat([upper], 'FLAC')).toEqual([upper]);
    });
  });

  describe('collectFilesFromEntry', () => {
    const makeFileEntry = (name: string): FileSystemFileEntry => {
      const file = new File(['data'], name, { type: 'audio/flac' });
      return {
        isFile: true,
        isDirectory: false,
        name,
        file: (cb: (file: File) => void) => cb(file),
      } as unknown as FileSystemFileEntry;
    };

    it('returns a single file for a file entry', async () => {
      const entry = makeFileEntry('a.flac');
      const files = await collectFilesFromEntry(entry);
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('a.flac');
    });

    it('walks every batch returned by a directory entry', async () => {
      const child = makeFileEntry('child.flac');
      const batches = [[child], []];
      const reader = {
        readEntries: (cb: (entries: FileSystemEntry[]) => void) => cb(batches.shift() ?? []),
      };
      const dir = {
        isFile: false,
        isDirectory: true,
        createReader: () => reader,
      } as unknown as FileSystemDirectoryEntry;

      const files = await collectFilesFromEntry(dir);
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('child.flac');
    });

    it('returns an empty array for an entry that is neither file nor directory', async () => {
      // Exercises the trailing `return []` — covers the false branch of
      // `if (entry.isDirectory)` after `isFile` is also false.
      const weird = {
        isFile: false,
        isDirectory: false,
      } as unknown as FileSystemEntry;

      const files = await collectFilesFromEntry(weird);
      expect(files).toEqual([]);
    });
  });
});
