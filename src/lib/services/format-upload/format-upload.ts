/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { supportsComment, writeComment } from '@/lib/audio-metadata';
import { FORMAT_MIME_TYPES, FORMAT_SIZE_LIMITS } from '@/lib/constants/digital-formats';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { failFromError } from '@/lib/services/_internal/map-data-error';
import type { ServiceResponse } from '@/lib/services/service.types';
import { loggers } from '@/lib/utils/logger';
import {
  digitalFormatConfirmationSchema,
  multiTrackConfirmationSchema,
} from '@/lib/validation/digital-format-schema';

import { buildFormatKey, formatKeyPrefix, isFormatKey } from './format-key';
import { formatObjectStore } from './format-object-store';
import { checkTitleFree, resolveRelease } from './new-release';

import type {
  ConfirmedFormatUpload,
  ConfirmInput,
  DiscardInput,
  FormatObjectStore,
  NewReleaseTitleCheck,
  ReceivedFile,
  ReceiveInput,
} from './types';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

/** The copy of every failed transfer; the route answers it as `INTERNAL_ERROR`. */
const UPLOAD_FAILED = 'Upload failed. Please try again.';

const FILE_MISSING = 'File not found in S3 storage. Upload may have failed.';

const DUPLICATE_FORMAT = 'A digital format of this type already exists for this release';

const formatRepository = new ReleaseDigitalFormatRepository();

export interface FormatUploadDeps {
  store: FormatObjectStore;
  /** Where a received body is spooled before it is tagged and sent. */
  tempDir: string;
}

/** The format rows a confirm wrote. */
interface WrittenFormat {
  formatId: string;
  fileCount: number;
}

/** Why a file's name, size or MIME type is refused, or null when the format takes it. */
const fileInfoError = (file: ReceiveInput): string | null => {
  if (!file.fileName || file.fileName.trim().length === 0) {
    return 'File name is required';
  }
  if (file.fileSize <= 0) {
    return 'File size must be positive';
  }

  const sizeLimit = FORMAT_SIZE_LIMITS[file.formatType];
  if (file.fileSize > sizeLimit) {
    return `File size exceeds ${Math.floor(sizeLimit / (1024 * 1024))} MB limit for ${file.formatType}`;
  }

  const mimeTypes: ReadonlyArray<string> = FORMAT_MIME_TYPES[file.formatType];
  return mimeTypes.includes(file.mimeType)
    ? null
    : `Invalid MIME type. Expected: ${mimeTypes.join(', ')}`;
};

/** The site URL a stored file's comment tag points to, read and checked once per receive. */
const commentBaseUrl = (): ServiceResponse<string> => {
  const baseUrl =
    process.env.NEXT_PUBLIC_HOST_NAME?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!baseUrl) {
    loggers.s3.error(
      '[upload-proxy] Missing NEXT_PUBLIC_HOST_NAME/NEXT_PUBLIC_BASE_URL while writing audio metadata comment.'
    );
    return {
      success: false,
      error:
        'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL is not set.',
      code: 'UNAVAILABLE',
    };
  }

  try {
    return { success: true, data: new URL(baseUrl).toString() };
  } catch {
    loggers.s3.error(
      '[upload-proxy] Invalid NEXT_PUBLIC_HOST_NAME/NEXT_PUBLIC_BASE_URL while writing audio metadata comment.'
    );
    return {
      success: false,
      error:
        'Server configuration is invalid: NEXT_PUBLIC_HOST_NAME or NEXT_PUBLIC_BASE_URL must be a valid absolute URL.',
      code: 'UNAVAILABLE',
    };
  }
};

/** The first message the confirmation schemas refuse the input with, or null. */
const confirmationError = ({ releaseId, formatType, files }: ConfirmInput): string | null => {
  const parsed =
    files.length === 1
      ? digitalFormatConfirmationSchema.safeParse({ releaseId, formatType, ...files[0] })
      : multiTrackConfirmationSchema.safeParse({
          releaseId,
          formatType,
          files: files.map((file, index) => ({ ...file, trackNumber: index + 1 })),
        });

  return parsed.success ? null : parsed.error.issues[0].message;
};

/** Remove a spooled body; a failure is logged, never thrown. */
const removeTempFile = async (tempFilePath: string): Promise<void> => {
  try {
    await rm(tempFilePath, { force: true });
  } catch (error) {
    loggers.s3.warn('[upload-proxy] Failed to clean up temp file', {
      tempFilePath,
      error: String(error),
    });
  }
};

/**
 * The format upload module: a digital format's upload from the PUT to the
 * confirmed rows. It owns the key shape, the file checks, the comment tag,
 * the transfer through the object-store port, verification, the format rows,
 * a new Release's title rule, and every cleanup — a cancelled batch, a failed
 * confirm, and the files of replaced tracks.
 */
export class FormatUpload {
  constructor(private readonly deps: FormatUploadDeps) {}

  /**
   * Receive one file: check it, spool the body to a temp file, write the
   * `Visit <base URL>` comment where the format has one, and put it through
   * the store. An abort stops the transfer and leaves no object behind, even
   * when the put finished first. The temp file is removed on every path.
   */
  async receive(input: ReceiveInput): Promise<ServiceResponse<ReceivedFile>> {
    const refusal = fileInfoError(input);
    if (refusal) {
      loggers.s3.warn(`[upload-proxy] Validation failed for ${input.formatType}: ${refusal}`);
      return { success: false, error: refusal, code: 'INVALID_INPUT' };
    }

    const baseUrl = commentBaseUrl();
    if (!baseUrl.success) {
      return baseUrl;
    }

    const startTime = Date.now();
    const s3Key = buildFormatKey(input);
    const tempFilePath = join(
      this.deps.tempDir,
      `upload-${randomUUID()}${extname(input.fileName).toLowerCase()}`
    );

    try {
      await this.transfer(input, { s3Key, tempFilePath, baseUrl: baseUrl.data });
      input.signal.throwIfAborted();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      loggers.s3.info(
        `[upload-proxy] ${input.formatType}: COMPLETE in ${elapsed}s — s3Key=${s3Key}`
      );
      return { success: true, data: { s3Key, contentType: input.mimeType } };
    } catch (error) {
      if (input.signal.aborted) {
        await this.deps.store.delete(s3Key);
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      loggers.s3.error(`[upload-proxy] FAILED after ${elapsed}s`, error);
      return { success: false, error: UPLOAD_FAILED, code: 'UNKNOWN' };
    } finally {
      await removeTempFile(tempFilePath);
    }
  }

  /**
   * Check a new Release's album title before any file is sent: refused when
   * another Release holds it (see {@link checkTitleFree}).
   */
  async checkNewReleaseTitle({
    releaseId,
    title,
  }: NewReleaseTitleCheck): Promise<ServiceResponse<null>> {
    try {
      return await checkTitleFree(releaseId, title);
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to check the release title' });
    }
  }

  /**
   * Confirm a format's received files. One file writes the legacy single-file
   * format; several replace the format's tracks, numbered in the order given.
   * Every key must sit under the format's prefix and exist in the store. With
   * `newRelease`, the Release is created under `releaseId` first unless it
   * exists. Any failure after the input checks deletes the request's
   * unreferenced files.
   */
  async confirm(input: ConfirmInput): Promise<ServiceResponse<ConfirmedFormatUpload>> {
    const invalid = confirmationError(input);
    if (invalid) {
      return { success: false, error: invalid, code: 'INVALID_INPUT' };
    }

    const s3Keys = input.files.map(({ s3Key }) => s3Key);
    try {
      const confirmed = await this.confirmChecked(input);
      if (!confirmed.success) {
        await this.discardQuietly(input, s3Keys);
      }
      return confirmed;
    } catch (error) {
      await this.discardQuietly(input, s3Keys);
      return failFromError(error, {
        DUPLICATE: DUPLICATE_FORMAT,
        UNKNOWN: 'Failed to confirm upload',
      });
    }
  }

  /**
   * Delete received files confirm has not taken. Skips every key outside the
   * format's prefix and every key a format or track row references.
   */
  async discard(input: DiscardInput): Promise<ServiceResponse<{ deletedCount: number }>> {
    try {
      return {
        success: true,
        data: { deletedCount: await this.deleteUnreferenced(input, input.s3Keys) },
      };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to discard the uploaded files' });
    }
  }

  /** Spool the body, tag it, and put it through the store. */
  private async transfer(
    input: ReceiveInput,
    { s3Key, tempFilePath, baseUrl }: { s3Key: string; tempFilePath: string; baseUrl: string }
  ): Promise<void> {
    await pipeline(
      Readable.fromWeb(input.body as NodeReadableStream),
      createWriteStream(tempFilePath),
      { signal: input.signal }
    );
    // WAV has no comment tag.
    if (supportsComment(tempFilePath)) {
      await writeComment(tempFilePath, `Visit ${baseUrl}`);
    }

    const { size } = await stat(tempFilePath);
    loggers.s3.info(
      `[upload-proxy] ${input.formatType}: starting S3 multipart upload to key=${s3Key}`
    );
    await this.deps.store.put({
      s3Key,
      filePath: tempFilePath,
      contentType: input.mimeType,
      contentLength: size,
      signal: input.signal,
    });
  }

  /** Confirm input that passed the schemas: keys, then verification, the Release, the rows. */
  private async confirmChecked(
    input: ConfirmInput
  ): Promise<ServiceResponse<ConfirmedFormatUpload>> {
    if (input.files.some(({ s3Key }) => !isFormatKey(s3Key, input))) {
      return {
        success: false,
        error: `Invalid S3 key: must start with ${formatKeyPrefix(input.releaseId, input.formatType)}`,
        code: 'INVALID_INPUT',
      };
    }

    const present = await Promise.all(
      input.files.map(({ s3Key }) => this.deps.store.exists(s3Key))
    );
    if (present.includes(false)) {
      return { success: false, error: FILE_MISSING, code: 'NOT_FOUND' };
    }

    const release = await resolveRelease(input);
    if (!release.success) {
      return release;
    }

    const written = await this.writeFiles(input);

    return {
      success: true,
      data: {
        releaseId: input.releaseId,
        releaseTitle: release.data.title,
        ...written,
        created: release.data.created,
      },
    };
  }

  /** Write the format rows: the legacy single-file shape for one file, a track replacement for several. */
  private async writeFiles({ releaseId, formatType, files }: ConfirmInput): Promise<WrittenFormat> {
    if (files.length === 1) {
      const [file] = files;
      const format = await formatRepository.create({
        release: { connect: { id: releaseId } },
        formatType,
        s3Key: file.s3Key,
        fileName: file.fileName,
        fileSize: BigInt(file.fileSize),
        mimeType: file.mimeType,
        uploadedAt: new Date(),
      });
      return { formatId: format.id, fileCount: 1 };
    }

    const replacement = await formatRepository.replaceTracks(
      releaseId,
      formatType,
      files.map((file, index) => ({
        ...file,
        trackNumber: index + 1,
        fileSize: BigInt(file.fileSize),
      }))
    );
    // The replacement is committed; the replaced tracks' files go now.
    await this.discardQuietly({ releaseId, formatType }, replacement.replacedKeys);

    return { formatId: replacement.formatId, fileCount: replacement.fileCount };
  }

  /** Delete the keys under the format's prefix that no row references; returns how many went. */
  private async deleteUnreferenced(
    format: Pick<DiscardInput, 'releaseId' | 'formatType'>,
    s3Keys: ReadonlyArray<string>
  ): Promise<number> {
    const candidates = [...new Set(s3Keys.filter((s3Key) => isFormatKey(s3Key, format)))];
    const referenced = new Set(await formatRepository.findReferencedS3Keys(candidates));
    const deleted = await Promise.all(
      candidates
        .filter((s3Key) => !referenced.has(s3Key))
        .map((s3Key) => this.deps.store.delete(s3Key))
    );

    return deleted.filter(Boolean).length;
  }

  /** {@link deleteUnreferenced} where a failure must not replace the outcome being reported. */
  private async discardQuietly(
    format: Pick<DiscardInput, 'releaseId' | 'formatType'>,
    s3Keys: ReadonlyArray<string>
  ): Promise<void> {
    try {
      await this.deleteUnreferenced(format, s3Keys);
    } catch (error) {
      loggers.s3.error('[format-upload] Could not delete unconfirmed files', error, { s3Keys });
    }
  }
}

/** The format upload module as the upload route and the format upload actions use it. */
export const formatUpload = new FormatUpload({ store: formatObjectStore, tempDir: tmpdir() });
