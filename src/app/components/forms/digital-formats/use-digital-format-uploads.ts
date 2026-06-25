/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use client';

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { toast } from 'sonner';

import {
  confirmDigitalFormatUploadAction,
  confirmMultiTrackUploadAction,
} from '@/lib/actions/confirm-upload-action';
import { deleteFormatFilesAction } from '@/lib/actions/delete-format-files-action';
import { findOrCreateReleaseAction } from '@/lib/actions/find-or-create-release-action';
import type { FindOrCreateReleaseResult } from '@/lib/actions/find-or-create-release-action';
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

/** Callback hooks supplied by the caller, bundled for context passing. */
interface UploadCallbacks {
  onReleaseAutoCreated?: (result: ReleaseAutoCreatedPayload) => void;
  onMetadataExtracted?: (metadata: ExtractedAudioMetadata) => void;
}

/**
 * State values, setters, and refs owned by {@link useUploadState}. Module-scope
 * upload helpers receive this bundle (instead of many params) so they can drive
 * the hook's state while keeping `max-params` satisfied.
 */
interface UploadStateBundle {
  selectedFiles: Record<DigitalFormatType, SelectedFile>;
  setSelectedFiles: Dispatch<SetStateAction<Record<DigitalFormatType, SelectedFile>>>;
  uploadStates: Record<DigitalFormatType, UploadState>;
  setUploadStates: Dispatch<SetStateAction<Record<DigitalFormatType, UploadState>>>;
  uploadedFormats: Set<DigitalFormatType>;
  setUploadedFormats: Dispatch<SetStateAction<Set<DigitalFormatType>>>;
  errorMessages: Record<DigitalFormatType, string | null>;
  setErrorMessages: Dispatch<SetStateAction<Record<DigitalFormatType, string | null>>>;
  uploadedFilesList: Record<DigitalFormatType, UploadedFileInfo[]>;
  setUploadedFilesList: Dispatch<SetStateAction<Record<DigitalFormatType, UploadedFileInfo[]>>>;
  dragOverFormat: DigitalFormatType | null;
  setDragOverFormat: Dispatch<SetStateAction<DigitalFormatType | null>>;
  albumTitle: string | null;
  setAlbumTitle: Dispatch<SetStateAction<string | null>>;
  confirmReuploadFormat: DigitalFormatType | null;
  setConfirmReuploadFormat: Dispatch<SetStateAction<DigitalFormatType | null>>;
  isDeletingFiles: boolean;
  setIsDeletingFiles: Dispatch<SetStateAction<boolean>>;
  fileInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>;
  uploadButtonRefs: React.RefObject<Record<string, HTMLButtonElement | null>>;
}

/** Shared dependency bundle for the heavy upload helpers. */
interface UploadContext {
  state: UploadStateBundle;
  releaseId: string | undefined;
  callbacks: UploadCallbacks;
}

/**
 * Returns a shallow copy of `record` with `key` removed. Implemented via
 * `Object.entries` to avoid object-injection on the dynamic `key`. The record
 * shape (and its key union) is preserved for callers.
 */
const omitKey = <T extends object>(record: T, key: keyof T): T =>
  Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key)) as T;

/**
 * Reads `record[key]` for a dynamic `key` without object-injection risk by
 * routing the lookup through a `Map`. Returns `undefined` when absent.
 */
const readByKey = <T extends object>(record: T, key: keyof T): T[keyof T] | undefined =>
  new Map(Object.entries(record)).get(String(key)) as T[keyof T] | undefined;

/** Set a format's terminal error state + error message (shared failure path). */
const setFormatError = (
  state: UploadStateBundle,
  formatType: DigitalFormatType,
  message: string
): void => {
  state.setUploadStates((prev) => ({
    ...prev,
    [formatType]: { status: 'error', message },
  }));
  state.setErrorMessages((prev) => ({ ...prev, [formatType]: message }));
};

/** Resolve a format's display label, falling back to the raw type when absent. */
const formatLabel = (formatType: DigitalFormatType): string => {
  const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
  return config?.label ?? formatType;
};

/**
 * Shared failure path for a format: set terminal error state and show the
 * standard "<label> upload failed" toast with the message as the description.
 */
const failFormat = (ctx: UploadContext, formatType: DigitalFormatType, message: string): void => {
  setFormatError(ctx.state, formatType, message);
  toast.error(`${formatLabel(formatType)} upload failed`, { description: message });
};

/** A find-or-create result with its release id + title resolved to strings. */
interface ResolvedAutoCreate extends FindOrCreateReleaseResult {
  releaseId: string;
  releaseTitle: string;
}

/**
 * Type guard: a find-or-create result succeeded and carries both a release id and
 * title. Used so the auto-create branches can narrow without inline `||` chains.
 */
const isAutoCreateResolved = (result: FindOrCreateReleaseResult): result is ResolvedAutoCreate =>
  result.success && !!result.releaseId && !!result.releaseTitle;

/** Per-format batch operation inputs, bundled to keep helper arity ≤ 4. */
interface BatchOperation {
  formatType: DigitalFormatType;
  files: File[];
  upload: SequentialUploadResult;
  extractedMetadata: ExtractedAudioMetadata;
}

/** Per-format single-file operation inputs, bundled to keep helper arity ≤ 4. */
interface SingleOperation {
  formatType: DigitalFormatType;
  file: File;
  s3Key: string;
  extractedMetadata: ExtractedAudioMetadata;
}

/**
 * Validate a file against its format config (extension + mime). Returns an error
 * message when the file is rejected, or `undefined` when it passes.
 */
const validateFileForFormat = (formatType: DigitalFormatType, file: File): string | undefined => {
  const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
  if (!config) return undefined;

  const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const validExtensions = getValidExtensionsForFormat(formatType);
  const extensionMatch = validExtensions.includes(fileExtension);
  const mimeMatch = file.type === '' || config.mimeTypes.includes(file.type);

  if (!extensionMatch || (!mimeMatch && file.type !== '')) {
    return `Wrong file type for ${config.label}. Expected a ${config.acceptTypes.split(',')[0]} file.`;
  }
  return undefined;
};

/** Build a failed {@link SingleUploadResult} for `file` with the given error. */
const failedUpload = (file: File, error: string): SingleUploadResult => ({
  success: false,
  fileName: file.name,
  fileSize: file.size,
  mimeType: file.type,
  error,
});

/**
 * Upload a single file to the server proxy and return the result. Does NOT set
 * terminal upload state or show toasts — callers handle that.
 */
const uploadSingleFileToS3 = async (
  releaseId: string | undefined,
  formatType: DigitalFormatType,
  file: File
): Promise<SingleUploadResult> => {
  const uploadStartTime = performance.now();
  console.info(
    `[upload] ${formatType}: START file="${file.name}" size=${(file.size / 1024 / 1024).toFixed(1)}MB type="${file.type}"`
  );

  if (!releaseId) {
    console.warn(`[upload] ${formatType}: SKIPPED — no releaseId`);
    return failedUpload(file, 'No release ID');
  }

  const validationError = validateFileForFormat(formatType, file);
  if (validationError) {
    return failedUpload(file, validationError);
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
      return failedUpload(file, uploadResult.message ?? 'Upload failed');
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
    return failedUpload(
      file,
      error instanceof Error ? error.message : 'Upload failed. Please try again.'
    );
  }
};

/**
 * Extract album-level metadata from the first MP3_320KBPS file, record the album
 * title, and forward any extracted metadata to the caller. Returns the metadata.
 */
const extractBatchMetadata = async (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  firstFile: File
): Promise<ExtractedAudioMetadata> => {
  if (formatType !== 'MP3_320KBPS') return {};

  const extractedMetadata = await extractAudioMetadata(firstFile);
  if (extractedMetadata.album) {
    ctx.state.setAlbumTitle(extractedMetadata.album);
  }
  if (Object.keys(extractedMetadata).length > 0) {
    ctx.callbacks.onMetadataExtracted?.(extractedMetadata);
    console.info(`[batch-upload] Extracted album metadata:`, {
      ...extractedMetadata,
      coverArt: extractedMetadata.coverArt ? '(base64 data URL)' : undefined,
    });
  } else {
    console.info('[batch-upload] Could not extract metadata from first file');
  }
  return extractedMetadata;
};

/** Aggregate result of uploading a batch of files sequentially. */
interface SequentialUploadResult {
  successFiles: UploadedFileInfo[];
  s3Keys: string[];
  failCount: number;
}

/**
 * Upload `files` one at a time, updating per-file progress state and collecting
 * the successful results, their s3 keys, and the failure count.
 */
const uploadFilesSequentially = async (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  files: File[]
): Promise<SequentialUploadResult> => {
  const successFiles: UploadedFileInfo[] = [];
  const s3Keys: string[] = [];
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files.at(i);
    if (!file) continue;
    console.info(`[batch-upload] Uploading ${i + 1}/${files.length}: ${formatType} → ${file.name}`);
    ctx.state.setUploadStates((prev) => ({
      ...prev,
      [formatType]: {
        status: 'uploading',
        progress: Math.round((i / files.length) * 100),
        currentFile: i + 1,
        totalFiles: files.length,
      },
    }));

    const result = await uploadSingleFileToS3(ctx.releaseId, formatType, file);

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

    ctx.state.setUploadStates((prev) => ({
      ...prev,
      [formatType]: {
        status: 'uploading',
        progress: Math.round(((i + 1) / files.length) * 100),
        currentFile: i + 1,
        totalFiles: files.length,
      },
    }));
  }

  return { successFiles, s3Keys, failCount };
};

/**
 * Confirm a set of uploaded files against an existing release: single-file action
 * for one file, multi-track action for several. Returns the confirm success flag.
 */
const confirmUploadedFiles = async (
  releaseId: string,
  formatType: DigitalFormatType,
  successFiles: UploadedFileInfo[],
  files: File[]
): Promise<boolean> => {
  if (successFiles.length === 1) {
    const cr = await confirmDigitalFormatUploadAction({
      releaseId,
      formatType,
      s3Key: successFiles[0].s3Key,
      fileName: successFiles[0].fileName,
      fileSize: successFiles[0].fileSize,
      mimeType: files[0].type,
    });
    return cr.success;
  }

  const fileByName = new Map(files.map((f) => [f.name, f]));
  const cr = await confirmMultiTrackUploadAction({
    releaseId,
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
  return cr.success;
};

/** Apply the shared success state (terminal status, file lists, selection) for a batch. */
const applyBatchSuccessState = (ctx: UploadContext, op: BatchOperation): void => {
  const { formatType, files } = op;
  const { successFiles, s3Keys } = op.upload;
  ctx.state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'success', s3Keys } }));
  ctx.state.setUploadedFormats((prev) => new Set([...prev, formatType]));
  ctx.state.setUploadedFilesList((prev) => ({ ...prev, [formatType]: successFiles }));
  ctx.state.setSelectedFiles((prev) => ({
    ...prev,
    [formatType]: {
      file: files[0],
      fileName: `${successFiles.length} files`,
      fileSize: successFiles.reduce((sum, f) => sum + f.fileSize, 0),
      fileCount: successFiles.length,
    },
  }));
};

/**
 * Create-mode batch branch: auto-create the release on the first MP3_320KBPS
 * batch, confirm the uploads, then set success state and toast.
 */
const runBatchAutoCreateConfirm = async (ctx: UploadContext, op: BatchOperation): Promise<void> => {
  const { formatType, files, extractedMetadata } = op;
  const { successFiles, failCount } = op.upload;

  const autoCreateResult = await findOrCreateReleaseAction({
    ...extractedMetadata,
    album: extractedMetadata.album ?? 'Untitled Release',
    id: ctx.releaseId,
  });

  if (!isAutoCreateResolved(autoCreateResult)) {
    const errMsg = autoCreateResult.error ?? 'Failed to create release';
    setFormatError(ctx.state, formatType, errMsg);
    toast.error('Failed to create release', { description: errMsg });
    return;
  }

  const resolvedReleaseId = autoCreateResult.releaseId;
  const resolvedReleaseTitle = autoCreateResult.releaseTitle;

  const confirmOk = await confirmUploadedFiles(resolvedReleaseId, formatType, successFiles, files);

  if (!confirmOk) {
    failFormat(ctx, formatType, 'Failed to confirm upload');
    return;
  }

  applyBatchSuccessState(ctx, op);

  ctx.callbacks.onReleaseAutoCreated?.({
    releaseId: resolvedReleaseId,
    releaseTitle: resolvedReleaseTitle,
    metadata: extractedMetadata,
  });

  if (failCount > 0) {
    toast.warning(
      `${formatLabel(formatType)}: ${successFiles.length} of ${files.length} files uploaded — release "${resolvedReleaseTitle}" created`
    );
  } else {
    toast.success(`Release "${resolvedReleaseTitle}" created with ${successFiles.length} files`);
  }
  console.info(`[batch-upload] Complete: ${successFiles.length} success, ${failCount} failed`);
};

/**
 * Edit-mode batch branch: confirm against the existing release, then set success
 * state and toast. Returns `true` when it returned early (caller skips final log).
 */
const runBatchEditConfirm = async (ctx: UploadContext, op: BatchOperation): Promise<boolean> => {
  const { formatType, files } = op;
  const { successFiles, failCount } = op.upload;

  /* v8 ignore start -- defensive guard: successFiles is non-empty here, which
     is impossible without a releaseId, since uploadSingleFile returns
     { success: false } when releaseId is falsy. */
  if (!ctx.releaseId) {
    failFormat(ctx, formatType, 'Cannot confirm upload: missing release ID');
    return true;
  }
  /* v8 ignore stop */

  const confirmOk = await confirmUploadedFiles(ctx.releaseId, formatType, successFiles, files);

  if (!confirmOk) {
    failFormat(ctx, formatType, 'Failed to confirm upload');
    console.info(`[batch-upload] Complete: ${successFiles.length} success, ${failCount} failed`);
    return true;
  }

  applyBatchSuccessState(ctx, op);

  if (failCount > 0) {
    toast.warning(
      `${formatLabel(formatType)}: ${successFiles.length} of ${files.length} files uploaded (${failCount} failed)`
    );
  } else {
    toast.success(`${formatLabel(formatType)}: ${successFiles.length} files uploaded successfully`);
  }
  return false;
};

/**
 * Orchestrate a batch upload for a single format: seed selection/state, extract
 * MP3 metadata, upload sequentially, dispatch to the create- or edit-mode branch,
 * then emit the final completion log.
 */
const runBatchUpload = async (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  files: File[]
): Promise<void> => {
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  ctx.state.setSelectedFiles((prev) => ({
    ...prev,
    [formatType]: {
      file: files[0],
      fileName: `${files.length} files`,
      fileSize: totalSize,
      fileCount: files.length,
    },
  }));
  ctx.state.setErrorMessages((prev) => ({ ...prev, [formatType]: null }));
  ctx.state.setUploadStates((prev) => ({
    ...prev,
    [formatType]: { status: 'uploading', progress: 0, currentFile: 1, totalFiles: files.length },
  }));

  const extractedMetadata = await extractBatchMetadata(ctx, formatType, files[0]);
  const upload = await uploadFilesSequentially(ctx, formatType, files);
  const op: BatchOperation = { formatType, files, upload, extractedMetadata };

  if (upload.successFiles.length > 0) {
    ctx.state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'confirming' } }));

    if (ctx.callbacks.onReleaseAutoCreated && formatType === 'MP3_320KBPS') {
      await runBatchAutoCreateConfirm(ctx, op);
      return;
    }

    const returnedEarly = await runBatchEditConfirm(ctx, op);
    if (returnedEarly) return;
  } else {
    ctx.state.setUploadStates((prev) => ({
      ...prev,
      [formatType]: { status: 'error', message: 'All files failed to upload' },
    }));
    toast.error(`${formatLabel(formatType)}: all files failed to upload`);
  }

  console.info(
    `[batch-upload] Complete: ${upload.successFiles.length} success, ${upload.failCount} failed`
  );
};

/**
 * Extract MP3 metadata for a single-file upload, forward it to the caller, and
 * return it. No-op (empty) for non-MP3 formats.
 */
const extractSingleFileMetadata = async (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  file: File
): Promise<ExtractedAudioMetadata> => {
  if (formatType !== 'MP3_320KBPS') return {};

  const extractedMetadata = await extractAudioMetadata(file);
  if (Object.keys(extractedMetadata).length > 0) {
    ctx.callbacks.onMetadataExtracted?.(extractedMetadata);
    console.info('[upload] MP3_320KBPS: extracted metadata', {
      ...extractedMetadata,
      coverArt: extractedMetadata.coverArt ? '(base64 data URL)' : undefined,
    });
  } else {
    console.info('[upload] MP3_320KBPS: could not extract metadata');
  }
  return extractedMetadata;
};

/** Apply the shared single-file success state (terminal status + file list). */
const applySingleFileSuccessState = (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  file: File,
  s3Key: string
): void => {
  ctx.state.setUploadStates((prev) => ({
    ...prev,
    [formatType]: { status: 'success', s3Keys: [s3Key] },
  }));
  ctx.state.setUploadedFormats((prev) => new Set([...prev, formatType]));
  ctx.state.setUploadedFilesList((prev) => ({
    ...prev,
    [formatType]: [{ fileName: file.name, fileSize: file.size, s3Key }],
  }));
};

/**
 * Create-mode single-file branch: auto-create the release on the first
 * MP3_320KBPS upload, confirm it, then set success state and toast.
 */
const runSingleAutoCreateConfirm = async (
  ctx: UploadContext,
  op: SingleOperation
): Promise<void> => {
  const { formatType, file, s3Key, extractedMetadata } = op;
  ctx.state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'confirming' } }));

  const autoCreateResult = await findOrCreateReleaseAction({
    ...extractedMetadata,
    album: extractedMetadata.album ?? 'Untitled Release',
    id: ctx.releaseId,
  });

  if (!isAutoCreateResolved(autoCreateResult)) {
    const errMsg = autoCreateResult.error ?? 'Failed to create release';
    setFormatError(ctx.state, formatType, errMsg);
    toast.error('Failed to create release', { description: errMsg });
    return;
  }

  const resolvedReleaseId = autoCreateResult.releaseId;
  const resolvedReleaseTitle = autoCreateResult.releaseTitle;

  const confirmResult = await confirmDigitalFormatUploadAction({
    releaseId: resolvedReleaseId,
    formatType,
    s3Key,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
  });

  if (!confirmResult.success) {
    failFormat(ctx, formatType, confirmResult.error ?? 'Failed to confirm upload');
    return;
  }

  applySingleFileSuccessState(ctx, formatType, file, s3Key);

  ctx.callbacks.onReleaseAutoCreated?.({
    releaseId: resolvedReleaseId,
    releaseTitle: resolvedReleaseTitle,
    metadata: extractedMetadata,
  });

  toast.success(`Release "${resolvedReleaseTitle}" created`);
};

/**
 * Edit-mode single-file branch: confirm against the existing release, then set
 * success state and toast.
 */
const runSingleEditConfirm = async (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  file: File,
  s3Key: string
): Promise<void> => {
  // Edit mode (or create mode non-MP3_320 after release exists): confirm directly
  /* v8 ignore start -- defensive guard: a successful uploadSingleFile result
     (asserted above) is impossible without a releaseId, since uploadSingleFile
     returns { success: false } when releaseId is falsy. */
  if (!ctx.releaseId) {
    failFormat(ctx, formatType, 'Cannot confirm upload: missing release ID');
    return;
  }
  /* v8 ignore stop */
  ctx.state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'confirming' } }));
  try {
    const confirmResult = await confirmDigitalFormatUploadAction({
      releaseId: ctx.releaseId,
      formatType,
      s3Key,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
    if (!confirmResult.success) {
      throw new Error(confirmResult.error || 'Failed to confirm upload');
    }
    applySingleFileSuccessState(ctx, formatType, file, s3Key);
    toast.success(`${formatLabel(formatType)} uploaded successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    failFormat(ctx, formatType, message);
  }
};

/**
 * Handle a single-file upload with full state management (for non-batch uploads):
 * seed selection/state, extract MP3 metadata, upload, then dispatch to the
 * create- or edit-mode confirm branch.
 */
const runFileUpload = async (
  ctx: UploadContext,
  formatType: DigitalFormatType,
  file: File
): Promise<void> => {
  ctx.state.setSelectedFiles((prev) => ({
    ...prev,
    [formatType]: { file, fileName: file.name, fileSize: file.size },
  }));

  ctx.state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'validating' } }));
  ctx.state.setErrorMessages((prev) => ({ ...prev, [formatType]: null }));
  ctx.state.setUploadStates((prev) => ({
    ...prev,
    [formatType]: { status: 'uploading', progress: 0, currentFile: 1, totalFiles: 1 },
  }));

  const extractedMetadata = await extractSingleFileMetadata(ctx, formatType, file);

  const result = await uploadSingleFileToS3(ctx.releaseId, formatType, file);

  if (!result.success || !result.s3Key) {
    failFormat(ctx, formatType, result.error ?? 'Upload failed');
    return;
  }

  const s3Key: string = result.s3Key;

  // In create mode, auto-create the release on the first MP3_320KBPS upload
  if (ctx.callbacks.onReleaseAutoCreated && formatType === 'MP3_320KBPS') {
    await runSingleAutoCreateConfirm(ctx, { formatType, file, s3Key, extractedMetadata });
    return;
  }

  await runSingleEditConfirm(ctx, formatType, file, s3Key);
};

/**
 * Read selected files from a file-input change event and route them to the
 * single-file or batch handler, toasting validation errors. Mirrors the original
 * `handleFileInputChange` body.
 */
const runFileInputChange = async (
  formatType: DigitalFormatType,
  files: FileList,
  handleFileUpload: (formatType: DigitalFormatType, file: File) => void,
  handleBatchUpload: (formatType: DigitalFormatType, files: File[]) => Promise<void>
): Promise<void> => {
  if (files.length === 1) {
    const file = files[0];
    const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
    const validExtensions = getValidExtensionsForFormat(formatType);
    if (!validExtensions.includes(fileExtension)) {
      const expectedExtension = getFileExtensionForFormat(formatType);
      toast.error(`Wrong file type for ${formatLabel(formatType)}`, {
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
    toast.error(`No matching ${formatLabel(formatType)} files found in folder`, {
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
};

/**
 * Handle a dropped directory entry: collect matching files and batch-upload them,
 * or toast when none match / reading fails. Extracted to keep `handleDrop` flat.
 */
const runDirectoryDrop = async (
  formatType: DigitalFormatType,
  config: (typeof FORMAT_CONFIGS)[number],
  entry: FileSystemEntry,
  handleBatchUpload: (formatType: DigitalFormatType, files: File[]) => Promise<void>
): Promise<void> => {
  try {
    const { collectFilesFromEntry } = await import('./file-helpers');
    const allFiles = await collectFilesFromEntry(entry);
    const matchingFiles = findMatchingFilesForFormat(allFiles, formatType);

    if (matchingFiles.length === 0) {
      const ext = getFileExtensionForFormat(formatType);
      toast.error(`No matching ${config.label} files found in folder`, {
        description: `Expected .${ext} files but none were found.`,
      });
      return;
    }

    matchingFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    console.info(
      `[batch-upload] (drop) Matched ${matchingFiles.length} ${formatType} files:`,
      matchingFiles.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
    );

    await handleBatchUpload(formatType, matchingFiles);
  } catch {
    toast.error('Failed to read folder contents');
  }
};

/**
 * Validate and route a dropped single file to the single-file handler, toasting
 * extension/mime errors. Mirrors the tail of the original `handleDrop`.
 */
const runSingleFileDrop = (
  formatType: DigitalFormatType,
  config: (typeof FORMAT_CONFIGS)[number],
  file: File,
  handleFileUpload: (formatType: DigitalFormatType, file: File) => void
): void => {
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
};

/** Handlers a drop needs to route its files once parsed. */
interface DropHandlers {
  setDragOverFormat: Dispatch<SetStateAction<DigitalFormatType | null>>;
  handleFileUpload: (formatType: DigitalFormatType, file: File) => void;
  handleBatchUpload: (formatType: DigitalFormatType, files: File[]) => Promise<void>;
}

/**
 * Full drop handling: clear drag state, then route a dropped directory to the
 * batch flow or a dropped single file to the single-file flow. Mirrors the
 * original `handleDrop` body so its callback stays thin.
 */
const processDrop = async (
  formatType: DigitalFormatType,
  event: React.DragEvent<HTMLDivElement>,
  handlers: DropHandlers
): Promise<void> => {
  event.preventDefault();
  handlers.setDragOverFormat(null);

  const config = FORMAT_CONFIGS.find((c) => c.type === formatType);
  if (!config) return;

  const items = event.dataTransfer.items;
  if (items?.length) {
    const entry = items[0].webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      await runDirectoryDrop(formatType, config, entry, handlers.handleBatchUpload);
      return;
    }
  }

  const file = event.dataTransfer.files[0];
  if (!file) return;

  runSingleFileDrop(formatType, config, file, handlers.handleFileUpload);
};

/** Reset all per-format state for `formatType` and clear its file input value. */
const removeFile = (state: UploadStateBundle, formatType: DigitalFormatType): void => {
  state.setSelectedFiles((prev) => omitKey(prev, formatType));
  state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'idle' } }));
  state.setUploadedFormats((prev) => {
    const next = new Set(prev);
    next.delete(formatType);
    return next;
  });
  state.setErrorMessages((prev) => ({ ...prev, [formatType]: null }));
  state.setUploadedFilesList((prev) => omitKey(prev, formatType));

  const input = readByKey(state.fileInputRefs.current, formatType);
  if (input) {
    input.value = '';
  }
};

/**
 * Confirmed re-upload flow: delete a format's existing files, reset its state, and
 * re-open the file picker. Mirrors the original `handleConfirmReupload` body,
 * including its defensive guard and `finally` cleanup.
 */
const confirmReupload = async (
  state: UploadStateBundle,
  releaseId: string | undefined,
  confirmReuploadFormat: DigitalFormatType | null
): Promise<void> => {
  const formatType = confirmReuploadFormat;
  if (!formatType || !releaseId) {
    /* v8 ignore next 2 -- defensive guard: dialog is never open when formatType/releaseId are falsy */
    state.setConfirmReuploadFormat(null);
    return;
  }

  state.setIsDeletingFiles(true);
  try {
    const result = await deleteFormatFilesAction({ releaseId, formatType });
    if (!result.success) {
      toast.error('Failed to delete existing files', { description: result.error });
      return;
    }

    state.setUploadedFormats((prev) => {
      const next = new Set(prev);
      next.delete(formatType);
      return next;
    });
    state.setUploadedFilesList((prev) => omitKey(prev, formatType));
    state.setSelectedFiles((prev) => omitKey(prev, formatType));
    state.setUploadStates((prev) => ({ ...prev, [formatType]: { status: 'idle' } }));
    state.setErrorMessages((prev) => ({ ...prev, [formatType]: null }));

    const input = readByKey(state.fileInputRefs.current, formatType);
    if (input) {
      input.value = '';
    }

    readByKey(state.fileInputRefs.current, formatType)?.click();
  } catch {
    toast.error('Failed to delete existing files');
  } finally {
    state.setIsDeletingFiles(false);
    state.setConfirmReuploadFormat(null);
  }
};

/**
 * Owns every piece of upload state (11 `useState` + 2 `useRef`), including the
 * initial-state derivation from `existingFormats`, and returns them bundled for
 * the hook and its module-scope helpers.
 */
const useUploadState = (existingFormats: ExistingFormat[]): UploadStateBundle => {
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

  return {
    selectedFiles,
    setSelectedFiles,
    uploadStates,
    setUploadStates,
    uploadedFormats,
    setUploadedFormats,
    errorMessages,
    setErrorMessages,
    uploadedFilesList,
    setUploadedFilesList,
    dragOverFormat,
    setDragOverFormat,
    albumTitle,
    setAlbumTitle,
    confirmReuploadFormat,
    setConfirmReuploadFormat,
    isDeletingFiles,
    setIsDeletingFiles,
    fileInputRefs,
    uploadButtonRefs,
  };
};

/** Read-only derivations over the current upload state. */
interface UploadQueries {
  getUploadState: (formatType: DigitalFormatType) => UploadState;
  isUploading: (formatType: DigitalFormatType) => boolean;
  isUploaded: (formatType: DigitalFormatType) => boolean;
}

/** Memoized query callbacks derived from the current upload state. */
const useUploadQueries = (state: UploadStateBundle): UploadQueries => {
  const { uploadStates, uploadedFormats } = state;

  const getUploadState = useCallback(
    (formatType: DigitalFormatType): UploadState => {
      return readByKey(uploadStates, formatType) ?? { status: 'idle' };
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

  return { getUploadState, isUploading, isUploaded };
};

/** Drag/drop + file-input handlers that drive the upload flows. */
interface UploadActionHandlers {
  handleFileUpload: (formatType: DigitalFormatType, file: File) => Promise<void>;
  handleBatchUpload: (formatType: DigitalFormatType, files: File[]) => Promise<void>;
  handleFileInputChange: (
    formatType: DigitalFormatType,
    event: React.ChangeEvent<HTMLInputElement>
  ) => Promise<void>;
  handleDrop: (
    formatType: DigitalFormatType,
    event: React.DragEvent<HTMLDivElement>
  ) => Promise<void>;
  handleDragOver: (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: () => void;
}

/**
 * Thin upload/drag handlers that assemble an {@link UploadContext} from current
 * closure values and delegate the heavy logic to module-scope helpers.
 */
const useUploadActionHandlers = (
  state: UploadStateBundle,
  releaseId: string | undefined,
  callbacks: UploadCallbacks
): UploadActionHandlers => {
  const { setDragOverFormat } = state;
  const { onReleaseAutoCreated, onMetadataExtracted } = callbacks;

  const buildContext = useCallback(
    (): UploadContext => ({
      state,
      releaseId,
      callbacks: { onReleaseAutoCreated, onMetadataExtracted },
    }),
    [state, releaseId, onReleaseAutoCreated, onMetadataExtracted]
  );

  const handleFileUpload = useCallback(
    async (formatType: DigitalFormatType, file: File): Promise<void> => {
      await runFileUpload(buildContext(), formatType, file);
    },
    [buildContext]
  );

  const handleBatchUpload = useCallback(
    async (formatType: DigitalFormatType, files: File[]): Promise<void> => {
      await runBatchUpload(buildContext(), formatType, files);
    },
    [buildContext]
  );

  const handleFileInputChange = useCallback(
    async (
      formatType: DigitalFormatType,
      event: React.ChangeEvent<HTMLInputElement>
    ): Promise<void> => {
      const files = event.target.files;
      if (!files?.length) return;
      await runFileInputChange(formatType, files, handleFileUpload, handleBatchUpload);
    },
    [handleFileUpload, handleBatchUpload]
  );

  const handleDrop = useCallback(
    async (
      formatType: DigitalFormatType,
      event: React.DragEvent<HTMLDivElement>
    ): Promise<void> => {
      await processDrop(formatType, event, {
        setDragOverFormat,
        handleFileUpload,
        handleBatchUpload,
      });
    },
    [handleFileUpload, handleBatchUpload, setDragOverFormat]
  );

  const handleDragOver = useCallback(
    (formatType: DigitalFormatType, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverFormat(formatType);
    },
    [setDragOverFormat]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverFormat(null);
  }, [setDragOverFormat]);

  return {
    handleFileUpload,
    handleBatchUpload,
    handleFileInputChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
  };
};

/** File-list management handlers (remove, re-upload button, confirm re-upload). */
interface FileManagementHandlers {
  handleRemoveFile: (formatType: DigitalFormatType) => void;
  handleUploadButtonClick: (formatType: DigitalFormatType) => void;
  handleConfirmReupload: () => Promise<void>;
}

/**
 * Thin file-management handlers delegating their heavy state logic to module-scope
 * helpers. `isUploaded` decides whether the upload button re-confirms or opens the
 * picker.
 */
const useFileManagementHandlers = (
  state: UploadStateBundle,
  releaseId: string | undefined,
  isUploaded: (formatType: DigitalFormatType) => boolean
): FileManagementHandlers => {
  const { confirmReuploadFormat, setConfirmReuploadFormat, fileInputRefs } = state;

  const handleRemoveFile = useCallback(
    (formatType: DigitalFormatType) => {
      removeFile(state, formatType);
    },
    [state]
  );

  /** Show confirmation dialog if format already has files; otherwise open file picker. */
  const handleUploadButtonClick = useCallback(
    (formatType: DigitalFormatType) => {
      if (isUploaded(formatType)) {
        setConfirmReuploadFormat(formatType);
        return;
      }
      readByKey(fileInputRefs.current, formatType)?.click();
    },
    [isUploaded, setConfirmReuploadFormat, fileInputRefs]
  );

  /** Handle confirmed re-upload: delete existing files then open the file picker. */
  const handleConfirmReupload = useCallback(async (): Promise<void> => {
    await confirmReupload(state, releaseId, confirmReuploadFormat);
  }, [state, releaseId, confirmReuploadFormat]);

  return { handleRemoveFile, handleUploadButtonClick, handleConfirmReupload };
};

export const useDigitalFormatUploads = ({
  releaseId,
  existingFormats,
  onReleaseAutoCreated,
  onMetadataExtracted,
}: UseDigitalFormatUploadsOptions) => {
  const state = useUploadState(existingFormats);
  const queries = useUploadQueries(state);
  const actions = useUploadActionHandlers(state, releaseId, {
    onReleaseAutoCreated,
    onMetadataExtracted,
  });
  const management = useFileManagementHandlers(state, releaseId, queries.isUploaded);

  return {
    // state
    selectedFiles: state.selectedFiles,
    errorMessages: state.errorMessages,
    uploadedFilesList: state.uploadedFilesList,
    dragOverFormat: state.dragOverFormat,
    albumTitle: state.albumTitle,
    confirmReuploadFormat: state.confirmReuploadFormat,
    isDeletingFiles: state.isDeletingFiles,
    // refs
    fileInputRefs: state.fileInputRefs,
    uploadButtonRefs: state.uploadButtonRefs,
    // queries
    getUploadState: queries.getUploadState,
    isUploading: queries.isUploading,
    isUploaded: queries.isUploaded,
    // event handlers
    handleFileInputChange: actions.handleFileInputChange,
    handleDrop: actions.handleDrop,
    handleDragOver: actions.handleDragOver,
    handleDragLeave: actions.handleDragLeave,
    handleRemoveFile: management.handleRemoveFile,
    handleUploadButtonClick: management.handleUploadButtonClick,
    handleConfirmReupload: management.handleConfirmReupload,
    setConfirmReuploadFormat: state.setConfirmReuploadFormat,
  };
};
