/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import { loggers } from '@/lib/utils/logger';
import { logSecurityEvent } from '@/utils/audit-log';

import type { NewReleaseMetadata } from './types';

/** The Release a confirm writes its format rows on. */
export interface ResolvedRelease {
  title: string;
  /** Whether this confirm created it. */
  created: boolean;
}

/** The refusal of a new Release whose album title another Release holds. */
const titleTaken = (title: string): { success: false; error: string; code: 'DUPLICATE' } => ({
  success: false,
  error: `A release titled "${title}" already exists. Open it from Releases to upload its formats.`,
  code: 'DUPLICATE',
});

/**
 * Refuse a new Release's title when another Release holds it, in any case,
 * soft-deleted Releases included. A Release whose id is `releaseId` is the
 * form's own, met again on a retry, and passes.
 */
export const checkTitleFree = async (
  releaseId: string,
  title: string
): Promise<ServiceResponse<null>> => {
  const holder = await ReleaseService.findByTitleInsensitive(title);

  return holder && holder.id !== releaseId
    ? titleTaken(holder.title)
    : { success: true, data: null };
};

/** January 1st of a plausible tagged year, otherwise today. */
const releaseDateFrom = (year: number | undefined): Date =>
  year && year > 1900 && year < 2100 ? new Date(year, 0, 1) : new Date();

/**
 * Credit the album artist the metadata names (`albumArtist`, else the track
 * `artist`) on the new Release. Best-effort: a failure never fails the upload.
 */
const creditAlbumArtist = async (
  metadata: NewReleaseMetadata,
  releaseId: string
): Promise<void> => {
  const artistName = metadata.albumArtist?.trim() || metadata.artist?.trim();
  if (!artistName) {
    return;
  }

  try {
    const artist = await ArtistService.findOrCreateByName(artistName);
    if (artist.success) {
      await ArtistService.creditOnRelease(artist.data.id, releaseId);
    }
  } catch (error) {
    loggers.media.warn('[format-upload] Could not credit the album artist from metadata', {
      error: String(error),
    });
  }
};

/** Create the Release under the id its files were received under. */
const createRelease = async (
  releaseId: string,
  metadata: NewReleaseMetadata,
  userId: string
): Promise<ServiceResponse<ResolvedRelease>> => {
  const created = await ReleaseService.createRelease({
    id: releaseId,
    title: metadata.album,
    releasedOn: releaseDateFrom(metadata.year),
    formats: ['DIGITAL'],
    labels: metadata.label ? [metadata.label.trim()] : [],
    coverArt: metadata.coverArt || '',
  });

  if (!created.success) {
    logSecurityEvent({
      event: 'media.release.create_failed',
      userId,
      metadata: { attemptedTitle: metadata.album, error: created.error },
    });
    // A Release that took the title after the check holds it now.
    return created.code === 'DUPLICATE' ? titleTaken(metadata.album) : created;
  }

  logSecurityEvent({
    event: 'media.release.created',
    userId,
    metadata: {
      releaseId: created.data.id,
      releaseTitle: created.data.title,
      fromMetadata: true,
      metadataFields: Object.entries(metadata)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field),
    },
  });
  await creditAlbumArtist(metadata, created.data.id);

  return { success: true, data: { title: created.data.title, created: true } };
};

/**
 * The Release a confirm writes on: the one with `releaseId` when it exists
 * (edit mode, or a create-mode retry); otherwise, with `newRelease`, a new
 * Release under that id — unless another Release holds its title.
 */
export const resolveRelease = async ({
  releaseId,
  newRelease,
  userId,
}: {
  releaseId: string;
  newRelease?: NewReleaseMetadata;
  userId: string;
}): Promise<ServiceResponse<ResolvedRelease>> => {
  const own = await ReleaseService.findTitleById(releaseId);
  if (own) {
    return { success: true, data: { title: own.title, created: false } };
  }
  if (!newRelease) {
    return { success: false, error: 'Release not found', code: 'NOT_FOUND' };
  }

  const free = await checkTitleFree(releaseId, newRelease.album);

  return free.success ? createRelease(releaseId, newRelease, userId) : free;
};
