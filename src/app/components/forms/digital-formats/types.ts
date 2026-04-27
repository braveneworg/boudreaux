/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { DigitalFormatType } from '@/types/digital-format';

/** Existing format file passed in via props (already uploaded). */
export interface ExistingFormatFile {
  trackNumber: number;
  title: string | null;
  fileName: string;
  fileSize: number;
  duration: number | null;
}

/** Existing format aggregate passed in via props. */
export interface ExistingFormat {
  formatType: DigitalFormatType;
  trackCount: number;
  totalFileSize: number;
  files: ExistingFormatFile[];
}

/** File metadata stored per format after selection (pre/post upload display). */
export interface SelectedFile {
  file: File;
  fileName: string;
  fileSize: number;
  /** Number of files in a batch upload (displayed as "N files"). */
  fileCount?: number;
}

/** Info for a single uploaded file within a format's batch. */
export interface UploadedFileInfo {
  fileName: string;
  fileSize: number;
  s3Key: string;
  title?: string;
  duration?: number;
}

/** Result of uploading a single file via the proxy route. */
export interface SingleUploadResult {
  success: boolean;
  s3Key?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  error?: string;
}

/** Audio metadata extracted from an MP3_320KBPS file. */
export interface ExtractedAudioMetadata {
  album?: string;
  artist?: string;
  albumArtist?: string;
  year?: number;
  label?: string;
  coverArt?: string;
}

/** Per-track audio metadata extracted from a single audio file. */
export interface ExtractedTrackMetadata {
  title?: string;
  duration?: number;
}

export interface ReleaseAutoCreatedPayload {
  releaseId: string;
  releaseTitle: string;
  metadata: { album?: string; artist?: string; year?: number; label?: string };
}

export interface DigitalFormatsAccordionProps {
  releaseId?: string;
  existingFormats?: ExistingFormat[];
  /**
   * Called after the first MP3_320KBPS upload in create mode: the release has
   * been auto-created in the DB and the upload confirmed. The parent form should
   * switch to edit mode and populate fields from the returned metadata.
   */
  onReleaseAutoCreated?: (result: ReleaseAutoCreatedPayload) => void;
  /**
   * Called when audio metadata is successfully extracted from an uploaded MP3_320KBPS file.
   * The parent form can use this to pre-populate form fields.
   */
  onMetadataExtracted?: (metadata: ExtractedAudioMetadata) => void;
}
