/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Supported audio file types
 */
export const AUDIO_FILE_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/m4a',
  'audio/x-m4a',
] as const;

/**
 * Supported video file types
 */
export const VIDEO_FILE_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/mpeg',
  'video/3gpp',
  'video/x-matroska',
] as const;

/**
 * All supported media file types
 */
export const ALL_MEDIA_FILE_TYPES = [...AUDIO_FILE_TYPES, ...VIDEO_FILE_TYPES] as const;

export type MediaType = 'audio' | 'video' | 'all';

/**
 * Represents a media item in the uploader
 */
export interface MediaItem {
  id: string;
  file?: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  mediaType: 'audio' | 'video';
  duration?: number;
  isUploading?: boolean;
  uploadProgress?: number;
  error?: string;
  uploadedUrl?: string;
}

export interface MediaUploaderProps {
  /** Current media items */
  mediaItems: MediaItem[];
  /** Called when media items change (add, remove) */
  onMediaChange: (items: MediaItem[]) => void;
  /** Called when media should be uploaded */
  onUpload?: (items: MediaItem[]) => Promise<void>;
  /** Called when an uploaded media should be deleted */
  onDelete?: (itemId: string) => Promise<{ success: boolean; error?: string }>;
  /** Type of media to accept ('audio', 'video', or 'all') */
  mediaType?: MediaType;
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Maximum file size in bytes (default 100MB) */
  maxFileSize?: number;
  /** Whether multiple files can be selected */
  multiple?: boolean;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
  /** Label for accessibility */
  label?: string;
}
