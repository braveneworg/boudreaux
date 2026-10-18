/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { DigitalFormatType } from '@/lib/constants/digital-formats';

/** One file the store sends: a local file put under `s3Key`. */
export interface FormatObjectPut {
  s3Key: string;
  filePath: string;
  contentType: string;
  contentLength: number;
  /** Aborting it stops the transfer; the put then rejects. */
  signal: AbortSignal;
}

/**
 * The object-store port a format upload sends its files through. `exists` and
 * `delete` never throw: `exists` is false for a missing or unreadable object,
 * and `delete` is false when the delete failed. Deleting a missing key
 * succeeds, as it does in S3.
 */
export interface FormatObjectStore {
  put: (object: FormatObjectPut) => Promise<void>;
  exists: (s3Key: string) => Promise<boolean>;
  delete: (s3Key: string) => Promise<boolean>;
}

/** One file the upload route hands over: its headers, its body and the request's signal. */
export interface ReceiveInput {
  releaseId: string;
  formatType: DigitalFormatType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
  signal: AbortSignal;
}

/** Where a received file was stored. */
export interface ReceivedFile {
  s3Key: string;
  contentType: string;
}

/** A new Release's title to check before any file is sent. */
export interface NewReleaseTitleCheck {
  releaseId: string;
  title: string;
}

/** One received file to confirm, in track order. */
export interface ConfirmFile {
  s3Key: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  title?: string;
  duration?: number;
}

/** The album metadata a create-mode confirm creates its Release from. */
export interface NewReleaseMetadata {
  album: string;
  artist?: string;
  albumArtist?: string;
  year?: number;
  label?: string;
  coverArt?: string;
}

/** What confirm takes: the files of one format, and the new Release's metadata in create mode. */
export interface ConfirmInput {
  releaseId: string;
  formatType: DigitalFormatType;
  files: ConfirmFile[];
  newRelease?: NewReleaseMetadata;
  /** The admin confirming, for the Release audit events. */
  userId: string;
}

/** A confirmed format upload. `releaseId` is always the one confirm was given. */
export interface ConfirmedFormatUpload {
  releaseId: string;
  releaseTitle: string;
  formatId: string;
  fileCount: number;
  /** Whether confirm created the Release. */
  created: boolean;
}

/** Files received for a format that confirm has not taken. */
export interface DiscardInput {
  releaseId: string;
  formatType: DigitalFormatType;
  s3Keys: string[];
}
