/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { ArtistService } from '@/lib/services/artist-service';
import { CreditConfirmationService } from '@/lib/services/credit-confirmation-service';
import { ReleaseService } from '@/lib/services/release-service';
import type { Format } from '@/lib/types/media-models';
import { requireRole } from '@/lib/utils/auth/require-role';
import { needsCreditDecisions, type CreditConfirmation } from '@/lib/utils/credit-confirmation';
import { loggers } from '@/lib/utils/logger';
import { logSecurityEvent } from '@/utils/audit-log';

/**
 * Metadata used to find or create a release
 */
export interface ReleaseMetadata {
  /** Album/release title (required) */
  album: string;
  /** Record label */
  label?: string;
  /** Catalog number */
  catalogNumber?: string;
  /** Release year */
  year?: number;
  /** Full release date string */
  date?: string;
  /** Album artist (may differ from track artist) */
  albumArtist?: string;
  /** Track artist from ID3 metadata */
  artist?: string;
  /** Cover art URL (already uploaded) */
  coverArt?: string;
  /** Whether the audio is lossless */
  lossless?: boolean;
  /** Pre-generated MongoDB ObjectId — when provided, the newly created release
   *  uses this value as its `_id` so that S3 keys already referencing it remain valid. */
  id?: string;
}

/**
 * Result of finding or creating a release
 */
export interface FindOrCreateReleaseResult {
  success: boolean;
  /** The release ID if found or created */
  releaseId?: string;
  /** The release title */
  releaseTitle?: string;
  /** Whether the release was newly created (vs found existing) */
  created?: boolean;
  /** The artist ID if found or created from metadata */
  artistId?: string;
  /**
   * Whether the release is published. Set when publishing was requested, or
   * when `creditConfirmation` is reported for a release already published.
   */
  published?: boolean;
  /**
   * Set when a credit awaits confirmation (ADR-0015). A release that was to be
   * published is then left unpublished: the admin decides each credit, and
   * `publishReleaseAction` publishes with those decisions.
   */
  creditConfirmation?: CreditConfirmation;
  /** Error message if failed */
  error?: string;
}

/**
 * Determines the format based on metadata
 */
const determineFormat = (_lossless?: boolean): Format[] => ['DIGITAL'];

/**
 * Parses a release date from various formats
 */
const parseReleaseDate = (year?: number, dateStr?: string): Date | undefined => {
  // Try full date string first (e.g., "2024-03-15")
  if (dateStr) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Fall back to year only
  if (year && year > 1900 && year < 2100) {
    // Use January 1st of that year
    return new Date(year, 0, 1);
  }

  return undefined;
};

/**
 * Options for find-or-create release behaviour
 */
export interface FindOrCreateReleaseOptions {
  /** When true a newly created release, or an existing unpublished one, is
   *  published — unless a credit awaits confirmation, in which case it is left
   *  unpublished and the credits are returned (ADR-0015). */
  publish?: boolean;
}

/**
 * Best-effort artist find-or-create and release connection from metadata.
 * Prefers `albumArtist` over `artist` (ID3 convention: albumArtist is album-level,
 * artist is per-track). Returns the artist ID if successful, undefined otherwise.
 */
const connectArtistFromMetadata = async (
  metadata: ReleaseMetadata,
  releaseId: string
): Promise<string | undefined> => {
  const artistName = metadata.albumArtist?.trim() || metadata.artist?.trim();
  if (!artistName) {
    return undefined;
  }

  try {
    const result = await ArtistService.findOrCreateByName(artistName);
    if (result.success) {
      await ArtistService.connectToRelease(result.data.id, releaseId);
      return result.data.id;
    }
  } catch (err) {
    // Artist connection is best-effort — never fail the release creation
    loggers.media.warn('[findOrCreateRelease] Could not connect artist from metadata', {
      error: err,
    });
  }
  return undefined;
};

type FoundRelease = {
  id: string;
  title: string;
  publishedAt: Date | null;
  deletedOn: Date | null;
};

type ReleaseActionContext = {
  albumTitle: string;
  userId: string;
  options: FindOrCreateReleaseOptions;
};

/** The part of the result that reports publication and credits to confirm. */
type PublicationOutcome =
  | { ok: true; fields: Pick<FindOrCreateReleaseResult, 'published' | 'creditConfirmation'> }
  | { ok: false; error: string };

interface PublicationRequest {
  releaseId: string;
  /** Whether the release is published before this call. */
  alreadyPublished: boolean;
  /** Whether the caller asked for the release to be published. */
  publish: boolean;
  /** Whether this call credited an artist on the release. */
  credited: boolean;
}

/**
 * Decide publication once the release's credits are stored. A release is
 * published only when no credit awaits confirmation; otherwise the credits are
 * returned for the admin to decide. A release already published reports the
 * credits this call left awaiting confirmation.
 */
const resolvePublication = async ({
  releaseId,
  alreadyPublished,
  publish,
  credited,
}: PublicationRequest): Promise<PublicationOutcome> => {
  const publishing = publish && !alreadyPublished;
  if (!publishing && !(alreadyPublished && credited)) {
    return { ok: true, fields: {} };
  }

  const confirmation = await CreditConfirmationService.forRelease(releaseId);
  if (!confirmation.success) {
    return { ok: false, error: confirmation.error };
  }
  if (needsCreditDecisions(confirmation.data)) {
    return {
      ok: true,
      fields: { published: alreadyPublished, creditConfirmation: confirmation.data },
    };
  }
  if (!publishing) {
    return { ok: true, fields: {} };
  }

  const published = await ReleaseService.publishRelease(releaseId);
  if (!published.success) {
    return { ok: false, error: published.error };
  }
  revalidatePath('/admin/releases');
  revalidatePath('/releases');
  return { ok: true, fields: { published: true } };
};

const handleFoundRelease = async (
  metadata: ReleaseMetadata,
  existingRelease: FoundRelease,
  ctx: ReleaseActionContext
): Promise<FindOrCreateReleaseResult> => {
  if (existingRelease.deletedOn) {
    await ReleaseService.restoreFoundRelease(existingRelease.id);
    revalidatePath('/admin/releases');
  }

  logSecurityEvent({
    event: 'media.release.found',
    userId: ctx.userId,
    metadata: {
      releaseId: existingRelease.id,
      releaseTitle: existingRelease.title,
      searchedTitle: ctx.albumTitle,
    },
  });

  const foundArtistId = await connectArtistFromMetadata(metadata, existingRelease.id);

  const publication = await resolvePublication({
    releaseId: existingRelease.id,
    alreadyPublished: Boolean(existingRelease.publishedAt),
    publish: Boolean(ctx.options.publish),
    credited: foundArtistId !== undefined,
  });
  if (!publication.ok) {
    return { success: false, error: publication.error };
  }

  return {
    success: true,
    releaseId: existingRelease.id,
    releaseTitle: existingRelease.title,
    created: false,
    artistId: foundArtistId,
    ...publication.fields,
  };
};

const buildCreateParams = (
  metadata: ReleaseMetadata,
  ctx: ReleaseActionContext
): Parameters<typeof ReleaseService.createRelease>[0] => {
  const releasedOn = parseReleaseDate(metadata.year, metadata.date) ?? new Date();
  const formats = determineFormat(metadata.lossless);
  const labels = metadata.label ? [metadata.label.trim()] : [];
  return {
    ...(metadata.id ? { id: metadata.id } : {}),
    title: ctx.albumTitle,
    releasedOn,
    formats,
    labels,
    catalogNumber: metadata.catalogNumber?.trim() || undefined,
    coverArt: metadata.coverArt || '',
  };
};

const handleCreateResponse = async (
  createResponse: Awaited<ReturnType<typeof ReleaseService.createRelease>>,
  metadata: ReleaseMetadata,
  ctx: ReleaseActionContext
): Promise<FindOrCreateReleaseResult> => {
  if (!createResponse.success) {
    logSecurityEvent({
      event: 'media.release.create_failed',
      userId: ctx.userId,
      metadata: { attemptedTitle: ctx.albumTitle, error: createResponse.error },
    });
    return { success: false, error: createResponse.error || 'Failed to create release' };
  }

  logSecurityEvent({
    event: 'media.release.created',
    userId: ctx.userId,
    metadata: {
      releaseId: createResponse.data.id,
      releaseTitle: createResponse.data.title,
      fromMetadata: true,
      metadataFields: Object.keys(metadata).filter(
        (key) => metadata[key as keyof ReleaseMetadata] !== undefined
      ),
    },
  });

  revalidatePath('/admin/releases');

  const createdArtistId = await connectArtistFromMetadata(metadata, createResponse.data.id);

  const publication = await resolvePublication({
    releaseId: createResponse.data.id,
    alreadyPublished: false,
    publish: Boolean(ctx.options.publish),
    credited: createdArtistId !== undefined,
  });
  if (!publication.ok) {
    return { success: false, error: publication.error };
  }

  return {
    success: true,
    releaseId: createResponse.data.id,
    releaseTitle: createResponse.data.title,
    created: true,
    artistId: createdArtistId,
    ...publication.fields,
  };
};

const getAdminUserId = async (): Promise<string | null> => {
  const session = await auth();
  if (!session || !session.user || !session.user.id || session.user.role !== 'admin') {
    return null;
  }
  return session.user.id;
};

/**
 * Find an existing release by title (case-insensitive) or create a new one
 * from audio metadata. This action requires admin role.
 *
 * @param metadata - The metadata extracted from the audio file
 * @param options  - Optional behaviour flags
 * @returns Result indicating success/failure and the release ID
 */
export const findOrCreateReleaseAction = async (
  metadata: ReleaseMetadata,
  options: FindOrCreateReleaseOptions = {}
): Promise<FindOrCreateReleaseResult> => {
  await requireRole('admin');

  if (!metadata.album || metadata.album.trim() === '') {
    return { success: false, error: 'Album name is required to find or create a release' };
  }

  const albumTitle = metadata.album.trim();

  try {
    const userId = await getAdminUserId();

    if (!userId) {
      return { success: false, error: 'You must be a logged in admin user to manage releases' };
    }

    const ctx: ReleaseActionContext = { albumTitle, userId, options };
    const existingRelease = await ReleaseService.findByTitleInsensitive(albumTitle);

    if (existingRelease) {
      return handleFoundRelease(metadata, existingRelease, ctx);
    }

    const createParams = buildCreateParams(metadata, ctx);
    const createResponse = await ReleaseService.createRelease(createParams);
    return handleCreateResponse(createResponse, metadata, ctx);
  } catch (error) {
    loggers.media.error('Error in findOrCreateReleaseAction', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
};
