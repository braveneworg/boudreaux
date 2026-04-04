/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useCallback, useRef, useState } from 'react';

import {
  Upload,
  FileAudio,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Music,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Separator } from '@/app/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import {
  confirmDigitalFormatUploadAction,
  confirmMultiTrackUploadAction,
} from '@/lib/actions/confirm-upload-action';
import { deleteFormatFilesAction } from '@/lib/actions/delete-format-files-action';
import { findOrCreateReleaseAction } from '@/lib/actions/find-or-create-release-action';
import { getFileExtensionForFormat, getDefaultMimeType } from '@/lib/constants/digital-formats';
import { FORMAT_CONFIGS } from '@/lib/constants/format-configs';
import { cn } from '@/lib/utils';
import { getTrackDisplayTitle } from '@/lib/utils/get-track-display-title';
import type { DigitalFormatType, UploadState } from '@/types/digital-format';

interface ExistingFormatFile {
  trackNumber: number;
  title: string | null;
  fileName: string;
  fileSize: number;
  duration: number | null;
}

interface ExistingFormat {
  formatType: DigitalFormatType;
  trackCount: number;
  totalFileSize: number;
  files: ExistingFormatFile[];
}

interface DigitalFormatsAccordionProps {
  releaseId?: string;
  existingFormats?: ExistingFormat[];
  /**
   * Called after the first MP3_320KBPS upload in create mode: the release has
   * been auto-created in the DB and the upload confirmed. The parent form should
   * switch to edit mode and populate fields from the returned metadata.
   */
  onReleaseAutoCreated?: (result: {
    releaseId: string;
    releaseTitle: string;
    metadata: { album?: string; artist?: string; year?: number; label?: string };
  }) => void;
  /**
   * Called when audio metadata is successfully extracted from an uploaded MP3_320KBPS file.
   * The parent form can use this to pre-populate form fields.
   */
  onMetadataExtracted?: (metadata: {
    album?: string;
    artist?: string;
    albumArtist?: string;
    year?: number;
    label?: string;
    coverArt?: string;
  }) => void;
}

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/** File metadata stored per format after selection */
interface SelectedFile {
  file: File;
  fileName: string;
  fileSize: number;
  fileCount?: number; // Number of files in a batch upload (displayed as "N files")
}

/** Info for a single uploaded file within a format's batch */
interface UploadedFileInfo {
  fileName: string;
  fileSize: number;
  s3Key: string;
  title?: string;
  duration?: number;
}

/** Result of uploading a single file to the server proxy */
interface SingleUploadResult {
  success: boolean;
  s3Key?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  error?: string;
}

/**
 * Read all File objects from a FileSystemDirectoryEntry (recursively).
 * Uses the browser FileSystem API available via drag-and-drop DataTransferItem.webkitGetAsEntry().
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

async function collectFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    return [file];
  }
  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    // readEntries may return results in batches, so loop until empty
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

/**
 * Find all files in a list that match a format's expected extension(s).
 */
/** Map of format extensions that accept multiple file extensions */
const MULTI_EXT_MAP: Partial<Record<string, string[]>> = {
  aiff: ['aiff', 'aif'],
  aac: ['aac', 'm4a'],
};

function findMatchingFilesForFormat(files: File[], formatType: DigitalFormatType): File[] {
  const expectedExt = getFileExtensionForFormat(formatType);
  const validExts = MULTI_EXT_MAP[expectedExt] ?? [expectedExt];
  return files.filter((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    return validExts.includes(ext);
  });
}

export function DigitalFormatsAccordion({
  releaseId,
  existingFormats = [],
  onReleaseAutoCreated,
  onMetadataExtracted,
}: DigitalFormatsAccordionProps) {
  // Track upload state for each format
  const [uploadStates, setUploadStates] = useState<Record<DigitalFormatType, UploadState>>(
    {} as Record<DigitalFormatType, UploadState>
  );

  // Track which formats have been successfully uploaded
  const [uploadedFormats, setUploadedFormats] = useState<Set<DigitalFormatType>>(
    new Set(existingFormats.map((f) => f.formatType))
  );

  // Track error messages
  const [errorMessages, setErrorMessages] = useState<Record<DigitalFormatType, string | null>>(
    {} as Record<DigitalFormatType, string | null>
  );

  // Track selected files per format (for display before/after upload)
  const [selectedFiles, setSelectedFiles] = useState<Record<DigitalFormatType, SelectedFile>>(
    () => {
      const initial: Record<string, SelectedFile> = {};
      for (const fmt of existingFormats) {
        const label = fmt.files.length === 1 ? fmt.files[0].fileName : `${fmt.files.length} files`;
        initial[fmt.formatType] = {
          file: new File([], label),
          fileName: label,
          fileSize: fmt.totalFileSize,
          fileCount: fmt.files.length > 1 ? fmt.files.length : undefined,
        };
      }
      return initial as Record<DigitalFormatType, SelectedFile>;
    }
  );

  // Track drag-over state per format
  const [dragOverFormat, setDragOverFormat] = useState<DigitalFormatType | null>(null);

  // Track uploaded file details per format (for displaying the file list)
  const [uploadedFilesList, setUploadedFilesList] = useState<
    Record<DigitalFormatType, UploadedFileInfo[]>
  >(() => {
    const initial: Record<string, UploadedFileInfo[]> = {};
    for (const fmt of existingFormats) {
      if (fmt.files.length > 0) {
        initial[fmt.formatType] = fmt.files.map((f) => ({
          fileName: f.fileName,
          fileSize: f.fileSize,
          s3Key: '', // Existing files don't expose s3Key to the client
        }));
      }
    }
    return initial as Record<DigitalFormatType, UploadedFileInfo[]>;
  });

  // Track album title extracted from audio metadata
  const [albumTitle, setAlbumTitle] = useState<string | null>(null);

  // Track which format is pending re-upload confirmation
  const [confirmReuploadFormat, setConfirmReuploadFormat] = useState<DigitalFormatType | null>(
    null
  );

  // Track whether we're deleting existing files before re-upload
  const [isDeletingFiles, setIsDeletingFiles] = useState(false);

  // File input refs per format for programmatic click
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /**
   * Upload a single file to the server proxy and return the result.
   * Does NOT set terminal upload state or show toasts — callers handle that.
   */
  const uploadSingleFile = useCallback(
    async (formatType: DigitalFormatType, file: File): Promise<SingleUploadResult> => {
      const uploadStartTime = performance.now();
      console.info(
        `[upload] ${formatType}: START file="${file.name}" size=${(file.size / 1024 / 1024).toFixed(1)}MB type="${file.type}"`
      );

      if (!releaseId) {
        console.warn(`[upload] ${formatType}: SKIPPED — no releaseId`);
        return {
          success: false,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          error: 'No release ID',
        };
      }

      // Validate file type matches the target format before uploading
      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
      if (config) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const expectedExtension = getFileExtensionForFormat(formatType);
        const validExtensions = MULTI_EXT_MAP[expectedExtension] ?? [expectedExtension];
        const extensionMatch = validExtensions.includes(fileExtension);
        const mimeMatch = file.type === '' || config.mimeTypes.includes(file.type);

        if (!extensionMatch || (!mimeMatch && file.type !== '')) {
          const message = `Wrong file type for ${config.label}. Expected a ${config.acceptTypes.split(',')[0]} file.`;
          return {
            success: false,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            error: message,
          };
        }
      }

      try {
        const resolvedMimeType = file.type || getDefaultMimeType(formatType);
        console.info(
          `[upload] ${formatType}: sending PUT to /api/releases/${releaseId}/upload/${formatType} (mime=${resolvedMimeType})`
        );
        const fetchStartTime = performance.now();
        const uploadResponse = await fetch(`/api/releases/${releaseId}/upload/${formatType}`, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': resolvedMimeType,
            'x-file-name': encodeURIComponent(file.name),
            'x-file-size': String(file.size),
          },
        });

        const uploadResult = (await uploadResponse.json()) as {
          success: boolean;
          s3Key?: string;
          contentType?: string;
          message?: string;
        };

        const fetchElapsed = ((performance.now() - fetchStartTime) / 1000).toFixed(1);
        console.info(
          `[upload] ${formatType}: server response status=${uploadResponse.status} ok=${uploadResponse.ok} in ${fetchElapsed}s`,
          uploadResult
        );

        if (!uploadResponse.ok || !uploadResult.success || !uploadResult.s3Key) {
          const msg = uploadResult.message ?? 'Upload failed';
          return {
            success: false,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            error: msg,
          };
        }

        const totalElapsed = ((performance.now() - uploadStartTime) / 1000).toFixed(1);
        console.info(`[upload] ${formatType}: SUCCESS in ${totalElapsed}s`);

        return {
          success: true,
          s3Key: uploadResult.s3Key,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        };
      } catch (error) {
        const totalElapsed = ((performance.now() - uploadStartTime) / 1000).toFixed(1);
        console.error(`[upload] ${formatType}: FAILED after ${totalElapsed}s`, error);
        return {
          success: false,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          error: error instanceof Error ? error.message : 'Upload failed. Please try again.',
        };
      }
    },
    [releaseId]
  );

  /**
   * Handle a single-file upload with full state management (for non-batch uploads).
   */
  const handleFileUpload = useCallback(
    async (formatType: DigitalFormatType, file: File) => {
      // Store selected file metadata for display
      setSelectedFiles((prev) => ({
        ...prev,
        [formatType]: { file, fileName: file.name, fileSize: file.size },
      }));

      setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'validating' } }));
      setErrorMessages((prev) => ({ ...prev, [formatType]: null }));
      setUploadStates((prev) => ({
        ...prev,
        [formatType]: { status: 'uploading', progress: 0, currentFile: 1, totalFiles: 1 },
      }));

      // Extract metadata from MP3_320KBPS before uploading
      const extractedMetadata: {
        album?: string;
        artist?: string;
        albumArtist?: string;
        year?: number;
        label?: string;
        coverArt?: string;
      } = {};
      if (formatType === 'MP3_320KBPS') {
        try {
          const { parseBlob } = await import('music-metadata');
          const parsedMeta = await parseBlob(file);
          const { common } = parsedMeta;
          if (common.album) extractedMetadata.album = common.album;
          if (common.artist) extractedMetadata.artist = common.artist;
          if (common.albumartist) extractedMetadata.albumArtist = common.albumartist;
          if (common.year) extractedMetadata.year = common.year;
          if (common.label?.[0]) extractedMetadata.label = common.label[0];
          // Extract embedded cover art from ID3 tags
          if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            const base64 = btoa(
              pic.data.reduce((acc: string, byte: number) => acc + String.fromCharCode(byte), '')
            );
            extractedMetadata.coverArt = `data:${pic.format};base64,${base64}`;
          }
          if (Object.keys(extractedMetadata).length > 0) {
            onMetadataExtracted?.(extractedMetadata);
            console.info('[upload] MP3_320KBPS: extracted metadata', {
              ...extractedMetadata,
              coverArt: extractedMetadata.coverArt ? '(base64 data URL)' : undefined,
            });
          }
        } catch {
          console.info('[upload] MP3_320KBPS: could not extract metadata');
        }
      }

      const result = await uploadSingleFile(formatType, file);

      if (!result.success) {
        const message = result.error ?? 'Upload failed';
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: { status: 'error', message },
        }));
        setErrorMessages((prev) => ({ ...prev, [formatType]: message }));
        const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
        toast.error(`${config?.label ?? formatType} upload failed`, { description: message });
        return;
      }

      const { s3Key } = result;
      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);

      // In create mode, auto-create the release on the first MP3_320KBPS upload
      if (onReleaseAutoCreated && formatType === 'MP3_320KBPS') {
        setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'confirming' } }));

        const autoCreateResult = await findOrCreateReleaseAction({
          ...extractedMetadata,
          album: extractedMetadata.album ?? 'Untitled Release',
          id: releaseId,
        });

        if (!autoCreateResult.success) {
          const errMsg = autoCreateResult.error ?? 'Failed to create release';
          setUploadStates((prev) => ({
            ...prev,
            [formatType]: { status: 'error', message: errMsg },
          }));
          setErrorMessages((prev) => ({ ...prev, [formatType]: errMsg }));
          toast.error('Failed to create release', { description: errMsg });
          return;
        }

        const confirmResult = await confirmDigitalFormatUploadAction({
          releaseId: releaseId!,
          formatType,
          s3Key: s3Key!,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });

        if (!confirmResult.success) {
          const errMsg = confirmResult.error ?? 'Failed to confirm upload';
          setUploadStates((prev) => ({
            ...prev,
            [formatType]: { status: 'error', message: errMsg },
          }));
          setErrorMessages((prev) => ({ ...prev, [formatType]: errMsg }));
          toast.error(`${config?.label ?? formatType} upload failed`, { description: errMsg });
          return;
        }

        setUploadStates((prev) => ({
          ...prev,
          [formatType]: { status: 'success', s3Keys: [s3Key!] },
        }));
        setUploadedFormats((prev) => new Set([...prev, formatType]));
        setUploadedFilesList((prev) => ({
          ...prev,
          [formatType]: [{ fileName: file.name, fileSize: file.size, s3Key: s3Key! }],
        }));

        onReleaseAutoCreated({
          releaseId: autoCreateResult.releaseId!,
          releaseTitle: autoCreateResult.releaseTitle!,
          metadata: extractedMetadata,
        });

        toast.success(`Release "${autoCreateResult.releaseTitle}" created`);
        return;
      }

      // Edit mode (or create mode non-MP3_320 after release exists): confirm directly
      setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'confirming' } }));
      try {
        const confirmResult = await confirmDigitalFormatUploadAction({
          releaseId: releaseId!,
          formatType,
          s3Key: s3Key!,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
        if (!confirmResult.success) {
          throw new Error(confirmResult.error || 'Failed to confirm upload');
        }
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: { status: 'success', s3Keys: [s3Key!] },
        }));
        setUploadedFormats((prev) => new Set([...prev, formatType]));
        setUploadedFilesList((prev) => ({
          ...prev,
          [formatType]: [{ fileName: file.name, fileSize: file.size, s3Key: s3Key! }],
        }));
        toast.success(`${config?.label ?? formatType} uploaded successfully`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: { status: 'error', message },
        }));
        setErrorMessages((prev) => ({ ...prev, [formatType]: message }));
        toast.error(`${config?.label ?? formatType} upload failed`, { description: message });
      }
    },
    [releaseId, onReleaseAutoCreated, onMetadataExtracted, uploadSingleFile]
  );

  /**
   * Handle batch upload of multiple files for a single format type.
   * Uploads files sequentially, tracks progress, extracts album metadata from first MP3_320KBPS file,
   * then sets terminal state and pending confirms after all files complete.
   */
  const handleBatchUpload = useCallback(
    async (formatType: DigitalFormatType, files: File[]) => {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);

      // Pre-set selected files info to show batch count in the UI
      setSelectedFiles((prev) => ({
        ...prev,
        [formatType]: {
          file: files[0],
          fileName: `${files.length} files`,
          fileSize: totalSize,
          fileCount: files.length,
        },
      }));
      setErrorMessages((prev) => ({ ...prev, [formatType]: null }));
      setUploadStates((prev) => ({
        ...prev,
        [formatType]: {
          status: 'uploading',
          progress: 0,
          currentFile: 1,
          totalFiles: files.length,
        },
      }));

      // Extract metadata from the first MP3_320KBPS file
      const extractedMetadata: {
        album?: string;
        artist?: string;
        albumArtist?: string;
        year?: number;
        label?: string;
        coverArt?: string;
      } = {};
      if (formatType === 'MP3_320KBPS') {
        try {
          const { parseBlob } = await import('music-metadata');
          const parsedMeta = await parseBlob(files[0]);
          const { common } = parsedMeta;
          if (common.album) {
            setAlbumTitle(common.album);
            extractedMetadata.album = common.album;
          }
          if (common.artist) extractedMetadata.artist = common.artist;
          if (common.albumartist) extractedMetadata.albumArtist = common.albumartist;
          if (common.year) extractedMetadata.year = common.year;
          if (common.label?.[0]) extractedMetadata.label = common.label[0];
          // Extract embedded cover art from ID3 tags
          if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            const base64 = btoa(
              pic.data.reduce((acc: string, byte: number) => acc + String.fromCharCode(byte), '')
            );
            extractedMetadata.coverArt = `data:${pic.format};base64,${base64}`;
          }
          if (Object.keys(extractedMetadata).length > 0) {
            onMetadataExtracted?.(extractedMetadata);
            console.info(`[batch-upload] Extracted album metadata:`, {
              ...extractedMetadata,
              coverArt: extractedMetadata.coverArt ? '(base64 data URL)' : undefined,
            });
          }
        } catch {
          // Metadata extraction is best-effort — not all formats support it
          console.info('[batch-upload] Could not extract metadata from first file');
        }
      }

      const successFiles: UploadedFileInfo[] = [];
      const s3Keys: string[] = [];
      let failCount = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.info(
          `[batch-upload] Uploading ${i + 1}/${files.length}: ${formatType} → ${file.name}`
        );
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: {
            status: 'uploading',
            progress: Math.round((i / files.length) * 100),
            currentFile: i + 1,
            totalFiles: files.length,
          },
        }));

        const result = await uploadSingleFile(formatType, file);

        if (result.success && result.s3Key) {
          // Extract per-track metadata (title, duration) from the audio file
          let trackTitle: string | undefined;
          let trackDuration: number | undefined;
          try {
            const { parseBlob } = await import('music-metadata');
            const parsedTrack = await parseBlob(file);
            trackTitle = parsedTrack.common.title;
            trackDuration = parsedTrack.format.duration
              ? Math.round(parsedTrack.format.duration)
              : undefined;
          } catch {
            // Metadata extraction is best-effort
          }

          successFiles.push({
            fileName: file.name,
            fileSize: file.size,
            s3Key: result.s3Key,
            title: trackTitle,
            duration: trackDuration,
          });
          s3Keys.push(result.s3Key);
          console.info(`[batch-upload] Finished ${i + 1}/${files.length}: ${formatType} (success)`);
        } else {
          failCount++;
          console.warn(
            `[batch-upload] Finished ${i + 1}/${files.length}: ${formatType} (failed: ${result.error})`
          );
        }

        // Update progress after each file completes (whether success or failure)
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: {
            status: 'uploading',
            progress: Math.round(((i + 1) / files.length) * 100),
            currentFile: i + 1,
            totalFiles: files.length,
          },
        }));
      }

      // Set terminal state
      if (successFiles.length > 0) {
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: { status: 'confirming' },
        }));

        // In create mode, auto-create the release on first MP3_320KBPS batch upload
        if (onReleaseAutoCreated && formatType === 'MP3_320KBPS') {
          const autoCreateResult = await findOrCreateReleaseAction({
            ...extractedMetadata,
            album: extractedMetadata.album ?? 'Untitled Release',
            id: releaseId,
          });

          if (!autoCreateResult.success) {
            const errMsg = autoCreateResult.error ?? 'Failed to create release';
            setUploadStates((prev) => ({
              ...prev,
              [formatType]: { status: 'error', message: errMsg },
            }));
            setErrorMessages((prev) => ({ ...prev, [formatType]: errMsg }));
            toast.error('Failed to create release', { description: errMsg });
            return;
          }

          // Confirm all successful files via multi-track or single action
          let confirmOk = false;
          if (successFiles.length === 1) {
            const cr = await confirmDigitalFormatUploadAction({
              releaseId: releaseId!,
              formatType,
              s3Key: successFiles[0].s3Key,
              fileName: successFiles[0].fileName,
              fileSize: successFiles[0].fileSize,
              mimeType: files[0].type,
            });
            confirmOk = cr.success;
          } else {
            const cr = await confirmMultiTrackUploadAction({
              releaseId: releaseId!,
              formatType,
              files: successFiles.map((f, idx) => ({
                trackNumber: idx + 1,
                s3Key: f.s3Key,
                fileName: f.fileName,
                fileSize: f.fileSize,
                mimeType:
                  files[successFiles.indexOf(f)]?.type ||
                  files.find((orig) => orig.name === f.fileName)?.type ||
                  '',
                title: f.title,
                duration: f.duration,
              })),
            });
            confirmOk = cr.success;
          }

          if (!confirmOk) {
            const errMsg = 'Failed to confirm upload';
            setUploadStates((prev) => ({
              ...prev,
              [formatType]: { status: 'error', message: errMsg },
            }));
            setErrorMessages((prev) => ({ ...prev, [formatType]: errMsg }));
            toast.error(`${config?.label ?? formatType} upload failed`, {
              description: errMsg,
            });
            return;
          }

          setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'success', s3Keys } }));
          setUploadedFormats((prev) => new Set([...prev, formatType]));
          setUploadedFilesList((prev) => ({ ...prev, [formatType]: successFiles }));
          setSelectedFiles((prev) => ({
            ...prev,
            [formatType]: {
              file: files[0],
              fileName: `${successFiles.length} files`,
              fileSize: successFiles.reduce((sum, f) => sum + f.fileSize, 0),
              fileCount: successFiles.length,
            },
          }));

          onReleaseAutoCreated({
            releaseId: autoCreateResult.releaseId!,
            releaseTitle: autoCreateResult.releaseTitle!,
            metadata: extractedMetadata,
          });

          if (failCount > 0) {
            toast.warning(
              `${config?.label ?? formatType}: ${successFiles.length} of ${files.length} files uploaded — release "${autoCreateResult.releaseTitle}" created`
            );
          } else {
            toast.success(
              `Release "${autoCreateResult.releaseTitle}" created with ${successFiles.length} files`
            );
          }
          console.info(
            `[batch-upload] Complete: ${successFiles.length} success, ${failCount} failed`
          );
          return;
        }

        // Edit mode (or create mode non-MP3_320 after release exists): confirm directly
        let confirmOk = false;
        if (successFiles.length === 1) {
          const cr = await confirmDigitalFormatUploadAction({
            releaseId: releaseId!,
            formatType,
            s3Key: successFiles[0].s3Key,
            fileName: successFiles[0].fileName,
            fileSize: successFiles[0].fileSize,
            mimeType: files[0].type,
          });
          confirmOk = cr.success;
        } else {
          const cr = await confirmMultiTrackUploadAction({
            releaseId: releaseId!,
            formatType,
            files: successFiles.map((f, idx) => ({
              trackNumber: idx + 1,
              s3Key: f.s3Key,
              fileName: f.fileName,
              fileSize: f.fileSize,
              mimeType: files.find((orig) => orig.name === f.fileName)?.type || '',
              title: f.title,
              duration: f.duration,
            })),
          });
          confirmOk = cr.success;
        }

        if (!confirmOk) {
          const errMsg = 'Failed to confirm upload';
          setUploadStates((prev) => ({
            ...prev,
            [formatType]: { status: 'error', message: errMsg },
          }));
          setErrorMessages((prev) => ({ ...prev, [formatType]: errMsg }));
          toast.error(`${config?.label ?? formatType} upload failed`, { description: errMsg });
          console.info(
            `[batch-upload] Complete: ${successFiles.length} success, ${failCount} failed`
          );
          return;
        }

        setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'success', s3Keys } }));
        setUploadedFormats((prev) => new Set([...prev, formatType]));
        setUploadedFilesList((prev) => ({ ...prev, [formatType]: successFiles }));
        setSelectedFiles((prev) => ({
          ...prev,
          [formatType]: {
            file: files[0],
            fileName: `${successFiles.length} files`,
            fileSize: successFiles.reduce((sum, f) => sum + f.fileSize, 0),
            fileCount: successFiles.length,
          },
        }));

        if (failCount > 0) {
          toast.warning(
            `${config?.label ?? formatType}: ${successFiles.length} of ${files.length} files uploaded (${failCount} failed)`
          );
        } else {
          toast.success(
            `${config?.label ?? formatType}: ${successFiles.length} files uploaded successfully`
          );
        }
      } else {
        setUploadStates((prev) => ({
          ...prev,
          [formatType]: { status: 'error', message: 'All files failed to upload' },
        }));
        toast.error(`${config?.label ?? formatType}: all files failed to upload`);
      }

      console.info(`[batch-upload] Complete: ${successFiles.length} success, ${failCount} failed`);
    },
    [releaseId, onReleaseAutoCreated, onMetadataExtracted, uploadSingleFile]
  );

  const handleFileInputChange = useCallback(
    async (_formatType: DigitalFormatType, event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;

      if (files.length === 1) {
        // Validate file extension matches the target format before uploading
        const file = files[0];
        const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const expectedExtension = getFileExtensionForFormat(_formatType);
        const validExtensions = MULTI_EXT_MAP[expectedExtension] ?? [expectedExtension];
        if (!validExtensions.includes(fileExtension)) {
          const config = FORMAT_CONFIGS.find((c) => c.type === _formatType);
          toast.error(`Wrong file type for ${config?.label ?? _formatType}`, {
            description: `Expected a .${expectedExtension} file, got .${fileExtension || 'unknown'}`,
          });
          return;
        }
        handleFileUpload(_formatType, file);
        return;
      }

      // Folder selected — upload all files matching the selected format type
      const allFiles = Array.from(files);
      const matchingFiles = findMatchingFilesForFormat(allFiles, _formatType);

      if (matchingFiles.length === 0) {
        const ext = getFileExtensionForFormat(_formatType);
        const config = FORMAT_CONFIGS.find((c) => c.type === _formatType);
        toast.error(`No matching ${config?.label ?? _formatType} files found in folder`, {
          description: `Expected .${ext} files but none were found.`,
        });
        return;
      }

      // Sort by filename so track order is predictable (e.g. 01-song.mp3, 02-song.mp3)
      matchingFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      console.info(
        `[batch-upload] Matched ${matchingFiles.length} ${_formatType} files from folder:`,
        matchingFiles.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
      );

      await handleBatchUpload(_formatType, matchingFiles);
    },
    [handleFileUpload, handleBatchUpload]
  );

  const handleDrop = useCallback(
    async (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverFormat(null);

      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
      if (!config) return;

      // Check if a folder was dropped using the FileSystem API
      const items = event.dataTransfer.items;
      if (items?.length) {
        const entry = items[0].webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          try {
            const allFiles = await collectFilesFromEntry(entry);
            const matchingFiles = findMatchingFilesForFormat(allFiles, formatType);

            if (matchingFiles.length === 0) {
              const ext = getFileExtensionForFormat(formatType);
              toast.error(`No matching ${config.label} files found in folder`, {
                description: `Expected .${ext} files but none were found.`,
              });
            } else {
              // Sort by filename so track order is predictable
              matchingFiles.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true })
              );

              console.info(
                `[batch-upload] (drop) Matched ${matchingFiles.length} ${formatType} files:`,
                matchingFiles.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
              );

              await handleBatchUpload(formatType, matchingFiles);
            }
          } catch {
            toast.error('Failed to read folder contents');
          }
          return;
        }
      }

      // Single file drop (existing behavior)
      const file = event.dataTransfer.files[0];
      if (!file) return;

      // Validate file extension matches the target format
      const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const expectedExtension = getFileExtensionForFormat(formatType);
      const validExtensions = MULTI_EXT_MAP[expectedExtension] ?? [expectedExtension];
      if (!validExtensions.includes(fileExtension)) {
        toast.error(`Wrong file type for ${config.label}`, {
          description: `Expected a .${expectedExtension} file, got .${fileExtension || 'unknown'}`,
        });
        return;
      }

      // Validate MIME type matches the target format (skip if browser reports empty type)
      if (file.type !== '' && !config.mimeTypes.includes(file.type)) {
        toast.error(`Invalid file type for ${config.label}`, {
          description: `Expected ${config.acceptTypes}, got ${file.type}`,
        });
        return;
      }

      handleFileUpload(formatType, file);
    },
    [handleFileUpload, handleBatchUpload]
  );

  const handleDragOver = useCallback(
    (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverFormat(formatType);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverFormat(null);
  }, []);

  const handleRemoveFile = useCallback((formatType: DigitalFormatType) => {
    setSelectedFiles((prev) => {
      const next = { ...prev };
      delete next[formatType];
      return next;
    });
    setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'idle' } }));
    setUploadedFormats((prev) => {
      const next = new Set(prev);
      next.delete(formatType);
      return next;
    });
    setErrorMessages((prev) => ({ ...prev, [formatType]: null }));
    setUploadedFilesList((prev) => {
      const next = { ...prev };
      delete next[formatType];
      return next;
    });

    // Reset file input
    const input = fileInputRefs.current[formatType];
    if (input) {
      input.value = '';
    }
  }, []);

  const getUploadState = useCallback(
    (formatType: DigitalFormatType): UploadState => {
      return uploadStates[formatType] ?? { status: 'idle' };
    },
    [uploadStates]
  );

  const isUploading = useCallback(
    (formatType: DigitalFormatType): boolean => {
      const state = getUploadState(formatType);
      return ['validating', 'uploading', 'confirming'].includes(state.status);
    },
    [getUploadState]
  );

  const isUploaded = useCallback(
    (formatType: DigitalFormatType): boolean => {
      return uploadedFormats.has(formatType);
    },
    [uploadedFormats]
  );

  /**
   * Handle upload button click — show confirmation dialog if format already has files
   */
  const handleUploadButtonClick = useCallback(
    (formatType: DigitalFormatType) => {
      if (isUploaded(formatType)) {
        setConfirmReuploadFormat(formatType);
        return;
      }
      fileInputRefs.current[formatType]?.click();
    },
    [isUploaded]
  );

  /**
   * Handle confirmed re-upload: delete existing files then open the file picker
   */
  const handleConfirmReupload = useCallback(async () => {
    const formatType = confirmReuploadFormat;
    if (!formatType || !releaseId) {
      /* v8 ignore next 2 -- defensive guard: dialog is never open when formatType/releaseId are falsy */
      setConfirmReuploadFormat(null);
      return;
    }

    setIsDeletingFiles(true);
    try {
      const result = await deleteFormatFilesAction({ releaseId, formatType });
      if (!result.success) {
        toast.error('Failed to delete existing files', { description: result.error });
        return;
      }

      // Clear local state for this format
      setUploadedFormats((prev) => {
        const next = new Set(prev);
        next.delete(formatType);
        return next;
      });
      setUploadedFilesList((prev) => {
        const next = { ...prev };
        delete next[formatType];
        return next;
      });
      setSelectedFiles((prev) => {
        const next = { ...prev };
        delete next[formatType];
        return next;
      });
      setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'idle' } }));
      setErrorMessages((prev) => ({ ...prev, [formatType]: null }));

      // Reset file input
      const input = fileInputRefs.current[formatType];
      if (input) {
        input.value = '';
      }

      // Open file picker
      fileInputRefs.current[formatType]?.click();
    } catch {
      toast.error('Failed to delete existing files');
    } finally {
      setIsDeletingFiles(false);
      setConfirmReuploadFormat(null);
    }
  }, [confirmReuploadFormat, releaseId]);

  const getStatusIcon = useCallback(
    (formatType: DigitalFormatType) => {
      const state = getUploadState(formatType);
      if (isUploaded(formatType) || state.status === 'success') {
        return (
          <CheckCircle2
            className="h-5 w-5 text-green-600"
            data-testid="format-uploaded-checkmark"
            aria-label="Format uploaded"
          />
        );
      }
      if (isUploading(formatType)) {
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-label="Uploading" />;
      }
      if (state.status === 'error') {
        return <AlertCircle className="h-5 w-5 text-destructive" aria-label="Upload failed" />;
      }
      return <FileAudio className="h-5 w-5 text-muted-foreground" />;
    },
    [getUploadState, isUploaded, isUploading]
  );

  const getStatusText = useCallback(
    (formatType: DigitalFormatType): string => {
      const state = getUploadState(formatType);
      switch (state.status) {
        case 'validating':
          /* v8 ignore next -- state is synchronously overwritten by 'uploading' before render */
          return 'Validating file...';
        case 'uploading': {
          const { currentFile, totalFiles } = state;
          if (totalFiles > 1) {
            return `Uploading file ${currentFile} of ${totalFiles}...`;
          }
          return 'Uploading to cloud storage...';
        }
        case 'confirming':
          return 'Finalizing upload...';
        case 'success':
          return 'Upload successful!';
        case 'error':
          return state.message;
        default:
          return isUploaded(formatType) ? 'Uploaded' : 'No file uploaded';
      }
    },
    [getUploadState, isUploaded]
  );

  // Computed counts for badges
  const successCount = FORMAT_CONFIGS.filter((c) => isUploaded(c.type)).length;
  const errorCount = FORMAT_CONFIGS.filter((c) => getUploadState(c.type).status === 'error').length;
  const uploadingCount = FORMAT_CONFIGS.filter((c) => isUploading(c.type)).length;
  const pendingCount = FORMAT_CONFIGS.length - successCount - errorCount - uploadingCount;
  const isAnyUploading = uploadingCount > 0;
  const isDisabled = !releaseId;

  // In create mode (onReleaseAutoCreated provided), lock other formats until MP3_320KBPS is uploaded first
  const isLockedForOtherFormats = !!onReleaseAutoCreated && !uploadedFormats.has('MP3_320KBPS');

  // Total files uploaded across all formats (for badge display)
  const totalFilesUploaded = Object.values(uploadedFilesList).reduce(
    (sum, files) => sum + files.length,
    0
  );

  if (isDisabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Digital Formats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {FORMAT_CONFIGS.map((config) => (
              <AccordionItem key={config.type} value={config.type}>
                <AccordionTrigger className="hover:no-underline" disabled>
                  <div className="flex items-center gap-3 w-full opacity-50">
                    <FileAudio className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{config.label}</span>
                  </div>
                </AccordionTrigger>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Digital Formats
          {albumTitle && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              &mdash; {albumTitle}
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-sm">
          {isLockedForOtherFormats
            ? 'Upload MP3 320kbps first — the release will be created automatically from the audio metadata.'
            : 'Upload audio files in various formats for user downloads. Expand each format to upload or replace files.'}
        </CardDescription>
        {(successCount > 0 || errorCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {successCount > 0 && (
              <Badge variant="default" className="bg-green-500">
                {successCount} {successCount === 1 ? 'format' : 'formats'} uploaded
                {totalFilesUploaded > successCount && ` (${totalFilesUploaded} files)`}
              </Badge>
            )}
            {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
            {pendingCount > 0 && <Badge variant="secondary">{pendingCount} remaining</Badge>}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress bar during active uploads — shows file-level batch progress */}
        {isAnyUploading &&
          (() => {
            const activeFormat = FORMAT_CONFIGS.find((c) => {
              const s = getUploadState(c.type);
              return s.status === 'uploading';
            });
            const activeState = activeFormat ? getUploadState(activeFormat.type) : undefined;
            const currentFile = activeState?.status === 'uploading' ? activeState.currentFile : 0;
            const totalFiles = activeState?.status === 'uploading' ? activeState.totalFiles : 1;
            const label = activeFormat?.label ?? 'format';
            const progressValue = totalFiles > 0 ? Math.round((currentFile / totalFiles) * 100) : 0;

            return (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading {label}...</span>
                    <span>
                      {currentFile} / {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
                    </span>
                  </div>
                  <Progress value={progressValue} />
                </div>
                <Separator />
              </>
            );
          })()}

        <Accordion type="multiple" className="w-full">
          {FORMAT_CONFIGS.map((config) => {
            const state = getUploadState(config.type);
            const error = errorMessages[config.type];
            const selected = selectedFiles[config.type];
            const uploaded = isUploaded(config.type);
            const uploading = isUploading(config.type);
            const isLocked = isLockedForOtherFormats && config.type !== 'MP3_320KBPS';

            return (
              <AccordionItem key={config.type} value={config.type}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 w-full">
                    {getStatusIcon(config.type)}
                    <span className="font-medium">{config.label}</span>
                    {selected && (
                      <span className="ml-auto mr-4 text-xs text-muted-foreground">
                        {selected.fileName}
                        {selected.fileSize > 0 && ` (${formatFileSize(selected.fileSize)})`}
                      </span>
                    )}
                  </div>
                </AccordionTrigger>

                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <p className="text-sm text-muted-foreground">{config.description}</p>

                    {/* Drag and drop zone */}
                    <div
                      onDrop={(e) => handleDrop(config.type, e)}
                      onDragOver={(e) => handleDragOver(config.type, e)}
                      onDragLeave={handleDragLeave}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6',
                        'transition-colors hover:border-primary/50',
                        dragOverFormat === config.type && 'border-primary bg-primary/5',
                        (uploading || isLocked) && 'pointer-events-none opacity-50'
                      )}
                    >
                      <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                      {isLocked ? (
                        <p className="mb-1 text-sm text-muted-foreground">
                          Upload MP3 320kbps first
                        </p>
                      ) : (
                        <p className="mb-1 text-sm text-muted-foreground">
                          Drag and drop a {config.label} file or folder here, or choose a folder
                          below
                        </p>
                      )}
                      <p className="mb-3 text-xs text-muted-foreground">
                        Accepts: {config.acceptTypes}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor={`upload-${config.type}`} className="sr-only">
                          Upload {config.label} folder
                        </Label>
                        <input
                          ref={(el) => {
                            fileInputRefs.current[config.type] = el;
                          }}
                          id={`upload-${config.type}`}
                          type="file"
                          // @ts-expect-error -- webkitdirectory is a non-standard HTML attribute for folder selection
                          webkitdirectory=""
                          directory=""
                          onChange={(e) => handleFileInputChange(config.type, e)}
                          disabled={uploading || isLocked}
                          aria-label={`Upload ${config.label} folder`}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploading || isLocked || isDeletingFiles}
                          onClick={() => handleUploadButtonClick(config.type)}
                        >
                          {uploaded ? (
                            <>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Re-upload files
                            </>
                          ) : (
                            <>
                              <Upload className="mr-2 h-4 w-4" />
                              Upload files
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Status row with file info and actions */}
                    {(selected || state.status !== 'idle') && (
                      <div
                        className={cn(
                          'rounded-md border p-3',
                          state.status === 'error' && 'border-destructive bg-destructive/10',
                          (uploaded || state.status === 'success') &&
                            'border-green-500 bg-green-500/10'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            {getStatusIcon(config.type)}
                            <div className="min-w-0">
                              {selected && (
                                <p className="truncate text-sm font-medium">{selected.fileName}</p>
                              )}
                              <p
                                className={cn(
                                  'text-xs',
                                  state.status === 'error' && 'text-destructive',
                                  state.status === 'success' && 'text-green-600',
                                  !['error', 'success'].includes(state.status) &&
                                    'text-muted-foreground'
                                )}
                              >
                                {getStatusText(config.type)}
                              </p>
                              {selected && selected.fileSize > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(selected.fileSize)}
                                </p>
                              )}
                            </div>
                          </div>
                          {(uploaded || state.status === 'error') && !uploading && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveFile(config.type)}
                              aria-label={`Remove ${config.label} file`}
                              className="h-8 w-8 shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {/* Uploaded files list */}
                        {uploadedFilesList[config.type]?.length >= 1 && (
                          <ul className="mt-2 space-y-1 border-t pt-2">
                            {uploadedFilesList[config.type].map((fileInfo, idx) => (
                              <li
                                key={fileInfo.s3Key}
                                className="flex items-center gap-2 text-xs text-muted-foreground"
                              >
                                <FileAudio className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {idx + 1}.{' '}
                                  {getTrackDisplayTitle(fileInfo.title ?? null, fileInfo.fileName)}
                                </span>
                                <span className="ml-auto shrink-0">
                                  {formatFileSize(fileInfo.fileSize)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Error message with accessibility */}
                    {error && (
                      <div
                        role="alert"
                        className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3"
                      >
                        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                        <p className="text-sm text-destructive">{error}</p>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>

      {/* Re-upload confirmation dialog */}
      <AlertDialog
        open={confirmReuploadFormat !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmReuploadFormat(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-upload files?</AlertDialogTitle>
            <AlertDialogDescription>
              This format already has files uploaded. Re-uploading will permanently delete the
              existing files and replace them with the new ones. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingFiles}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReupload} disabled={isDeletingFiles}>
              {isDeletingFiles ? 'Deleting...' : 'Delete & Re-upload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
