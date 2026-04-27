/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useCallback, useRef, useState } from 'react';

import { toast } from 'sonner';

import {
  confirmDigitalFormatUploadAction,
  confirmMultiTrackUploadAction,
} from '@/lib/actions/confirm-upload-action';
import { deleteFormatFilesAction } from '@/lib/actions/delete-format-files-action';
import { findOrCreateReleaseAction } from '@/lib/actions/find-or-create-release-action';
import { getFileExtensionForFormat, getDefaultMimeType } from '@/lib/constants/digital-formats';
import { FORMAT_CONFIGS } from '@/lib/constants/format-configs';
import type { DigitalFormatType, UploadState } from '@/types/digital-format';

import { extractAudioMetadata, extractTrackMetadata } from './audio-metadata';
import { findMatchingFilesForFormat, getValidExtensionsForFormat } from './file-helpers';

import type {
  ExistingFormat,
  ExtractedAudioMetadata,
  ReleaseAutoCreatedPayload,
  SelectedFile,
  SingleUploadResult,
  UploadedFileInfo,
} from './types';

interface UseDigitalFormatUploadsOptions {
  releaseId?: string;
  existingFormats: ExistingFormat[];
  onReleaseAutoCreated?: (result: ReleaseAutoCreatedPayload) => void;
  onMetadataExtracted?: (metadata: ExtractedAudioMetadata) => void;
}

export function useDigitalFormatUploads({
  releaseId,
  existingFormats,
  onReleaseAutoCreated,
  onMetadataExtracted,
}: UseDigitalFormatUploadsOptions) {
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
          s3Key: '',
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

  // Upload button refs per format for scroll-into-view on expand
  const uploadButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
      if (config) {
        const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const validExtensions = getValidExtensionsForFormat(formatType);
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

      let extractedMetadata: ExtractedAudioMetadata = {};
      if (formatType === 'MP3_320KBPS') {
        extractedMetadata = await extractAudioMetadata(file);
        if (Object.keys(extractedMetadata).length > 0) {
          onMetadataExtracted?.(extractedMetadata);
          console.info('[upload] MP3_320KBPS: extracted metadata', {
            ...extractedMetadata,
            coverArt: extractedMetadata.coverArt ? '(base64 data URL)' : undefined,
          });
        } else {
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
   * Uploads files sequentially, tracks progress, extracts album metadata from
   * first MP3_320KBPS file, then sets terminal state and pending confirms after
   * all files complete.
   */
  const handleBatchUpload = useCallback(
    async (formatType: DigitalFormatType, files: File[]) => {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);

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

      let extractedMetadata: ExtractedAudioMetadata = {};
      if (formatType === 'MP3_320KBPS') {
        extractedMetadata = await extractAudioMetadata(files[0]);
        if (extractedMetadata.album) {
          setAlbumTitle(extractedMetadata.album);
        }
        if (Object.keys(extractedMetadata).length > 0) {
          onMetadataExtracted?.(extractedMetadata);
          console.info(`[batch-upload] Extracted album metadata:`, {
            ...extractedMetadata,
            coverArt: extractedMetadata.coverArt ? '(base64 data URL)' : undefined,
          });
        } else {
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
          const trackMeta = await extractTrackMetadata(file);
          successFiles.push({
            fileName: file.name,
            fileSize: file.size,
            s3Key: result.s3Key,
            title: trackMeta.title,
            duration: trackMeta.duration,
          });
          s3Keys.push(result.s3Key);
          console.info(`[batch-upload] Finished ${i + 1}/${files.length}: ${formatType} (success)`);
        } else {
          failCount++;
          console.warn(
            `[batch-upload] Finished ${i + 1}/${files.length}: ${formatType} (failed: ${result.error})`
          );
        }

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
            const fileByName = new Map(files.map((f) => [f.name, f]));
            const cr = await confirmMultiTrackUploadAction({
              releaseId: releaseId!,
              formatType,
              files: successFiles.map((f, idx) => ({
                trackNumber: idx + 1,
                s3Key: f.s3Key,
                fileName: f.fileName,
                fileSize: f.fileSize,
                mimeType: fileByName.get(f.fileName)?.type || '',
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

          setUploadStates((prev) => ({
            ...prev,
            [formatType]: { status: 'success', s3Keys },
          }));
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
    async (formatType: DigitalFormatType, event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files?.length) return;

      if (files.length === 1) {
        const file = files[0];
        const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const validExtensions = getValidExtensionsForFormat(formatType);
        if (!validExtensions.includes(fileExtension)) {
          const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
          const expectedExtension = getFileExtensionForFormat(formatType);
          toast.error(`Wrong file type for ${config?.label ?? formatType}`, {
            description: `Expected a .${expectedExtension} file, got .${fileExtension || 'unknown'}`,
          });
          return;
        }
        handleFileUpload(formatType, file);
        return;
      }

      const allFiles = Array.from(files);
      const matchingFiles = findMatchingFilesForFormat(allFiles, formatType);

      if (matchingFiles.length === 0) {
        const ext = getFileExtensionForFormat(formatType);
        const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
        toast.error(`No matching ${config?.label ?? formatType} files found in folder`, {
          description: `Expected .${ext} files but none were found.`,
        });
        return;
      }

      matchingFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      console.info(
        `[batch-upload] Matched ${matchingFiles.length} ${formatType} files from folder:`,
        matchingFiles.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
      );

      await handleBatchUpload(formatType, matchingFiles);
    },
    [handleFileUpload, handleBatchUpload]
  );

  const handleDrop = useCallback(
    async (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverFormat(null);

      const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
      if (!config) return;

      const items = event.dataTransfer.items;
      if (items?.length) {
        const entry = items[0].webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          try {
            const { collectFilesFromEntry } = await import('./file-helpers');
            const allFiles = await collectFilesFromEntry(entry);
            const matchingFiles = findMatchingFilesForFormat(allFiles, formatType);

            if (matchingFiles.length === 0) {
              const ext = getFileExtensionForFormat(formatType);
              toast.error(`No matching ${config.label} files found in folder`, {
                description: `Expected .${ext} files but none were found.`,
              });
            } else {
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

      const file = event.dataTransfer.files[0];
      if (!file) return;

      const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const expectedExtension = getFileExtensionForFormat(formatType);
      const validExtensions = getValidExtensionsForFormat(formatType);
      if (!validExtensions.includes(fileExtension)) {
        toast.error(`Wrong file type for ${config.label}`, {
          description: `Expected a .${expectedExtension} file, got .${fileExtension || 'unknown'}`,
        });
        return;
      }

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

  /** Show confirmation dialog if format already has files; otherwise open file picker. */
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

  /** Handle confirmed re-upload: delete existing files then open the file picker. */
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

      const input = fileInputRefs.current[formatType];
      if (input) {
        input.value = '';
      }

      fileInputRefs.current[formatType]?.click();
    } catch {
      toast.error('Failed to delete existing files');
    } finally {
      setIsDeletingFiles(false);
      setConfirmReuploadFormat(null);
    }
  }, [confirmReuploadFormat, releaseId]);

  return {
    // state
    selectedFiles,
    errorMessages,
    uploadedFilesList,
    dragOverFormat,
    albumTitle,
    confirmReuploadFormat,
    isDeletingFiles,
    // refs
    fileInputRefs,
    uploadButtonRefs,
    // queries
    getUploadState,
    isUploading,
    isUploaded,
    // event handlers
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleRemoveFile,
    handleUploadButtonClick,
    handleConfirmReupload,
    setConfirmReuploadFormat,
  };
}
