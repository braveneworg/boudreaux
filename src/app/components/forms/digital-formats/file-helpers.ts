/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getFileExtensionForFormat } from '@/lib/constants/digital-formats';
import type { DigitalFormatType } from '@/types/digital-format';

/** Map of format extensions that accept multiple file extensions. */
export const MULTI_EXT_MAP: Partial<Record<string, string[]>> = {
  aiff: ['aiff', 'aif'],
  aac: ['aac', 'm4a'],
};

/** Format file size for display (Bytes / KB / MB / GB). */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get the list of valid file extensions for a given digital format type
 * (handles MULTI_EXT_MAP fallthrough).
 */
export function getValidExtensionsForFormat(formatType: DigitalFormatType): string[] {
  const expectedExt = getFileExtensionForFormat(formatType);
  return MULTI_EXT_MAP[expectedExt] ?? [expectedExt];
}

/** Find all files in a list that match a format's expected extension(s). */
export function findMatchingFilesForFormat(files: File[], formatType: DigitalFormatType): File[] {
  const validExts = getValidExtensionsForFormat(formatType);
  return files.filter((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    return validExts.includes(ext);
  });
}

/**
 * Read a single file from a FileSystemFileEntry (drag-and-drop FileSystem API).
 */
function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

/**
 * Recursively collect all files from a FileSystemEntry (file or directory).
 * Used to support folder drag-and-drop via DataTransferItem.webkitGetAsEntry().
 */
export async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    return [file];
  }
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    let batch = await readDirectoryEntries(dirReader);
    while (batch.length > 0) {
      for (const child of batch) {
        const childFiles = await collectFilesFromEntry(child);
        files.push(...childFiles);
      }
      batch = await readDirectoryEntries(dirReader);
    }
    return files;
  }
  return [];
}
