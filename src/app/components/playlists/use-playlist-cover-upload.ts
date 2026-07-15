/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { generatePlaylistCoverUploadUrlsAction } from '@/lib/actions/playlist-actions';
import {
  MAX_PLAYLIST_COVER_IMAGE_BYTES,
  MAX_PLAYLIST_COVER_IMAGES,
} from '@/lib/constants/playlists';
import { playlistCoverUploadInputSchema } from '@/lib/validation/playlist-schema';

/**
 * MIME types accepted for playlist cover uploads — derived from the server
 * upload schema's `contentType` enum so client and server never drift.
 */
export const PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES: readonly string[] =
  playlistCoverUploadInputSchema.shape.files.element.shape.contentType.options;

const MAX_COVER_IMAGE_MEGABYTES = Math.round(MAX_PLAYLIST_COVER_IMAGE_BYTES / 1024 / 1024);

const RATE_LIMITED_ERROR = 'RATE_LIMITED';
const RATE_LIMITED_MESSAGE = 'Too many upload requests — try again in a minute.';
const GENERIC_UPLOAD_ERROR = 'Upload failed';

interface UsePlaylistCoverUpload {
  /**
   * Validate and upload `files` as covers for `playlistId`; resolves with the
   * CDN public URLs in file order, or an empty array when anything failed
   * (the failure message lands in `error`).
   */
  uploadFiles: (playlistId: string, files: File[]) => Promise<string[]>;
  isUploading: boolean;
  error: string | null;
}

/**
 * Client-side pre-validation for a batch of cover files against the shared
 * playlist constants. Returns a human-readable error, or `null` when valid.
 */
export const validatePlaylistCoverFiles = (files: File[]): string | null => {
  if (files.length > MAX_PLAYLIST_COVER_IMAGES) {
    return `You can upload at most ${MAX_PLAYLIST_COVER_IMAGES} images at a time.`;
  }
  const unsupported = files.find(
    (file) => !PLAYLIST_COVER_ACCEPTED_IMAGE_TYPES.includes(file.type)
  );
  if (unsupported) {
    return `"${unsupported.name}" is not a supported image type.`;
  }
  const oversize = files.find((file) => file.size > MAX_PLAYLIST_COVER_IMAGE_BYTES);
  if (oversize) {
    return `"${oversize.name}" is larger than ${MAX_COVER_IMAGE_MEGABYTES} MB.`;
  }
  return null;
};

/** PUT one file to its presigned S3 URL; throws on a non-2xx response. */
const putFileToUrl = async (uploadUrl: string, file: File): Promise<void> => {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!response.ok) {
    throw new Error(`Upload failed for "${file.name}" (${response.status})`);
  }
};

/**
 * Presigned-URL cover upload flow for playlists: pre-validate the batch,
 * request presigned PUT targets from the server action, PUT each file, and
 * resolve with the CDN public URLs (in file order). `playlistId` is a call
 * argument — not hook config — so the save dialog can upload immediately
 * after create returns the new id.
 */
export const usePlaylistCoverUpload = (): UsePlaylistCoverUpload => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (playlistId: string, files: File[]): Promise<string[]> => {
    if (files.length === 0) return [];
    const validationError = validatePlaylistCoverFiles(files);
    if (validationError) {
      setError(validationError);
      return [];
    }
    setError(null);
    setIsUploading(true);
    try {
      const result = await generatePlaylistCoverUploadUrlsAction({
        playlistId,
        files: files.map(({ name, size, type }) => ({
          fileName: name,
          contentType: type,
          fileSize: size,
        })),
      });
      if (!result.success) {
        setError(result.error === RATE_LIMITED_ERROR ? RATE_LIMITED_MESSAGE : result.error);
        return [];
      }
      await Promise.all(
        files.map((file, index) => {
          const target = result.data.at(index);
          if (!target) throw new Error(GENERIC_UPLOAD_ERROR);
          return putFileToUrl(target.uploadUrl, file);
        })
      );
      return result.data.map(({ publicUrl }) => publicUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_UPLOAD_ERROR);
      return [];
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { uploadFiles, isUploading, error };
};
