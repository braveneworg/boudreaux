/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ReleaseRepository, type CreditPublication } from '@/lib/repositories/release-repository';
import { CreditDecisionError } from '@/lib/types/domain/errors';
import type {
  CreateReleaseData,
  PublishedReleaseDetail,
  PublishedReleaseFilters,
  PublishedReleaseListing,
  Release,
  ReleaseForDeletion,
  ReleaseListQuery,
  ReleaseListItem,
  UpdateReleaseData,
} from '@/lib/types/domain/release';
import { publicCredits, withPublicByline } from '@/lib/utils/artist-release-credits';
import { NO_CREDIT_DECISIONS, type CreditDecisions } from '@/lib/utils/credit-confirmation';
import {
  invalidatePublicNameCaches,
  PUBLISHED_RELEASES_CACHE_PREFIX,
} from '@/lib/utils/public-name-caches';
import { deleteS3Object } from '@/utils/s3-client';
import { extractS3KeyFromUrl } from '@/utils/s3-key-utils';
import { cache, withCache } from '@/utils/simple-cache';

import { failFromError } from './_internal/map-data-error';

import type { ServiceResponse } from './service.types';

/**
 * Default page size for the public published-releases listing. Mirrors the
 * client-side `PUBLISHED_RELEASES_PAGE_SIZE` in
 * `use-infinite-published-releases-query`
 * (kept as a separate constant because this module is `server-only`).
 */
const PUBLISHED_RELEASES_PAGE_SIZE = 24;

/**
 * An admin's decisions for the credits a publishing write touches (ADR-0015).
 * Omitted, the write passes only when no credit awaits confirmation.
 */
export interface CreditConfirmationInput {
  decisions: CreditDecisions;
  /** The admin who made the decisions. */
  publishedBy: string;
  /**
   * The credits the write stores, in order, in the same transaction as the
   * release. The decisions are checked against them once they are stored.
   * Absent, the stored credits stay as they are.
   */
  creditArtistIds?: string[];
}

const NO_CONFIRMATION: CreditConfirmationInput = {
  decisions: NO_CREDIT_DECISIONS,
  publishedBy: '',
};

const publicationOf = (
  { decisions, publishedBy }: CreditConfirmationInput,
  now: Date
): CreditPublication => ({ decisions, publishedBy, now });

/**
 * Map a failed release write. A refused credit check keeps its message, which
 * names the artists that need a decision; every other failure, a database's
 * own `VALIDATION` included, gets the given user-facing message.
 */
const failFromReleaseWrite = (
  error: unknown,
  overrides: Parameters<typeof failFromError>[1]
): ReturnType<typeof failFromError> =>
  error instanceof CreditDecisionError
    ? { success: false, code: error.code, error: error.message }
    : failFromError(error, overrides);

/**
 * Collect every S3 key that should be removed when a release is hard-deleted:
 * the stored `s3Key` of each digital-format file plus the keys derived from the
 * release's image `src`s and `coverArt` URL. URL→key extraction (CDN and S3
 * styles, honouring `CDN_DOMAIN`) is delegated to {@link extractS3KeyFromUrl}.
 */
const collectReleaseS3Keys = (release: ReleaseForDeletion): string[] => {
  const s3Keys: string[] = [];

  for (const format of release.digitalFormats) {
    for (const file of format.files) {
      if (file.s3Key) s3Keys.push(file.s3Key);
    }
  }

  const imageUrls = release.images
    .map((image) => image.src)
    .filter((src): src is string => Boolean(src));
  if (release.coverArt) imageUrls.push(release.coverArt);

  for (const url of imageUrls) {
    const s3Key = extractS3KeyFromUrl(url);
    if (s3Key) s3Keys.push(s3Key);
  }

  return s3Keys;
};

/**
 * Clear the cached public published-releases listing pages
 * ({@link ReleaseService.getPublishedReleases}) after a write that can change
 * which releases are listed or how they render.
 */
const invalidatePublishedReleases = (): void => {
  cache.deleteByPrefix(PUBLISHED_RELEASES_CACHE_PREFIX);
};

export class ReleaseService {
  /**
   * Create a new release with its credits, in order, in one write. A release
   * is always created unpublished: publishing checks the stored credits
   * first (ADR-0015). Publish with {@link ReleaseService.publishRelease}.
   */
  static async createRelease(
    data: CreateReleaseData,
    artistIds: string[] = []
  ): Promise<ServiceResponse<Release>> {
    try {
      const { publishedAt: _publishedAt, ...unpublished } = data;
      const release = await ReleaseRepository.createWithCredits(unpublished, artistIds);
      return { success: true, data: release };
    } catch (error) {
      return failFromError(error, {
        DUPLICATE: 'Release with this title already exists',
        UNKNOWN: 'Failed to create release',
      });
    }
  }

  /**
   * Get a release by ID
   */
  static async getReleaseById(id: string): Promise<ServiceResponse<Release>> {
    try {
      const release = await ReleaseRepository.findById(id);

      if (!release) {
        return { success: false, error: 'Release not found', code: 'NOT_FOUND' };
      }

      return { success: true, data: release };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve release' });
    }
  }

  /**
   * Get all releases with optional filters.
   *
   * Supports server-side `search` plus `published`/`deleted` filtering for the
   * admin listing. The repository owns the Mongo-safe `where` construction
   * (the search OR and the deletedOn OR are combined under `AND` so the two
   * `OR` keys never collide).
   *
   * - `published === true` → only releases with a `publishedAt` date.
   * - `published === false` → only releases without a `publishedAt` date.
   * - `published == null` → no publish filter.
   * - `deleted` falsy → exclude soft-deleted releases; `deleted === true` → include them.
   * - `withoutByline === true` → only the published releases whose byline
   *   names nobody (ADR-0015); `published` and `deleted` do not apply.
   */
  static async getReleases(
    params: ReleaseListQuery = {}
  ): Promise<ServiceResponse<ReleaseListItem[]>> {
    try {
      const { withoutByline, published, deleted, ...rest } = params;
      const releases = await ReleaseRepository.findMany(
        withoutByline
          ? { ...rest, ids: await ReleaseRepository.findIdsWithoutByline() }
          : { ...rest, published, deleted }
      );
      return { success: true, data: releases };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve releases' });
    }
  }

  /**
   * Update a release by ID. The credits the write names are stored, and, when
   * the write publishes, the admin's decisions are checked against them and
   * the confirmed artists published — all in the release's own transaction
   * (ADR-0015), so a refused check or a failed write keeps none of it. A
   * write that goes through clears the cached published-releases listing.
   */
  static async updateRelease(
    id: string,
    data: UpdateReleaseData,
    confirmation: CreditConfirmationInput = NO_CONFIRMATION
  ): Promise<ServiceResponse<Release>> {
    const publishes = Boolean(data.publishedAt);
    try {
      const release = await ReleaseRepository.updateWithCredits(id, data, {
        artistIds: confirmation.creditArtistIds,
        publish: publishes ? publicationOf(confirmation, new Date()) : undefined,
      });
      invalidatePublishedReleases();
      if (publishes) {
        // A published release's credits name its bylines.
        invalidatePublicNameCaches();
      }
      return { success: true, data: release };
    } catch (error) {
      return failFromReleaseWrite(error, {
        NOT_FOUND: 'Release not found',
        DUPLICATE: 'Release with this title already exists',
        UNKNOWN: 'Failed to update release',
      });
    }
  }

  /**
   * Delete a release by ID (hard delete). The repository removes it and every
   * row keyed to it in one transaction, keeping Artist records, so a failed
   * delete changes nothing. Only once it has gone through is the cached
   * published-releases listing cleared and are the S3 objects of its
   * digital-format files and images removed, best-effort. Returns the deleted
   * release with the files and images it had.
   */
  static async deleteRelease(id: string): Promise<ServiceResponse<ReleaseForDeletion>> {
    try {
      const release = await ReleaseRepository.delete(id);
      const s3Keys = collectReleaseS3Keys(release);
      invalidatePublishedReleases();

      // Best-effort S3 cleanup once the delete has committed (fire-and-forget)
      Promise.allSettled(s3Keys.map((key) => deleteS3Object(key))).catch(() => {
        // Silently ignore — S3 objects will be cleaned up by lifecycle rules
      });

      return { success: true, data: release };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Release not found',
        UNKNOWN: 'Failed to delete release',
      });
    }
  }

  /**
   * Publish a release by stamping `publishedAt`, and publish the credited
   * artists the admin chose to publish, in one transaction. Every credit
   * awaiting confirmation needs a decision, or this fails with `VALIDATION`
   * and writes nothing (ADR-0015).
   */
  static async publishRelease(
    id: string,
    confirmation: CreditConfirmationInput = NO_CONFIRMATION
  ): Promise<ServiceResponse<Release>> {
    try {
      const now = new Date();
      const release = await ReleaseRepository.updateWithCredits(
        id,
        { publishedAt: now },
        { publish: publicationOf(confirmation, now) }
      );
      // A newly listed release changes the public listings and their bylines.
      invalidatePublicNameCaches();
      return { success: true, data: release };
    } catch (error) {
      return failFromReleaseWrite(error, {
        NOT_FOUND: 'Release not found',
        UNKNOWN: 'Failed to publish release',
      });
    }
  }

  // ===========================================================================
  // Public release methods (for /releases pages)
  // ===========================================================================

  /**
   * Get a page of published releases for the public listing page.
   * Includes artist info for display name and search, images for cover art
   * fallback, and URLs for Bandcamp links.
   *
   * Supports skip/offset pagination, an optional server-side `search` term
   * (title, catalog number, description, or artist name) and an optional
   * `artist` slug (only releases crediting that public artist). Only the
   * default, unsearched and unfiltered first page is cached (10 min in
   * production) — searched, artist-filtered and offset pages vary too much to
   * share a cache entry. This service clears the cache itself when a release
   * write goes through (update, publish, delete); artist writes clear it with
   * `invalidatePublicNameCaches`.
   */
  static async getPublishedReleases(
    params?: PublishedReleaseFilters
  ): Promise<ServiceResponse<PublishedReleaseListing[]>> {
    const { skip = 0, take = PUBLISHED_RELEASES_PAGE_SIZE, search, artist } = params ?? {};

    const fetchReleases = async (): Promise<ServiceResponse<PublishedReleaseListing[]>> => {
      try {
        const releases = await ReleaseRepository.findPublished({ skip, take, search, artist });

        return {
          success: true,
          data: releases.map(withPublicByline),
        };
      } catch (error) {
        return failFromError(error, { UNKNOWN: 'Failed to fetch published releases' });
      }
    };

    // Only the default first page (no search, no artist, skip 0) is cacheable. Disabled
    // in E2E: the Playwright webServer readiness probe renders `/` pre-seed,
    // which would poison this cache with an empty listing for the whole run.
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.E2E_MODE === 'true' ||
      search ||
      artist ||
      skip > 0
    ) {
      return fetchReleases();
    }

    return withCache(`${PUBLISHED_RELEASES_CACHE_PREFIX}${take}`, fetchReleases, 600);
  }

  /**
   * Get a single published release with digital format files for the listening modal.
   * Returns MP3_320KBPS files sorted by track number for audio playback. With an
   * `artist` slug, only a release that artist holds a release credit on is found
   * (the `/releases?artist=` filter's rule).
   * Returns `{ success: false }` when the release is not found or not published.
   */
  static async getReleaseWithTracks(
    id: string,
    artist?: string
  ): Promise<ServiceResponse<PublishedReleaseDetail>> {
    try {
      const release = await ReleaseRepository.findPublishedWithTracks(id, artist);

      if (!release) {
        return { success: false, error: 'Release not found', code: 'NOT_FOUND' };
      }

      return { success: true, data: withPublicByline(release) };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve release' });
    }
  }

  /**
   * Where the old release URL `/releases/<id>` now leads: the public album
   * artist's slug, for the release deep link. `null` when no listed release
   * has the id, or its album artist is hidden — the link then never falls to
   * the next credit (ADR-0015).
   */
  static async getPublishedReleaseRedirectTarget(
    id: string
  ): Promise<{ artistSlug: string } | null> {
    const release = await ReleaseRepository.findPublishedCredits(id);
    const albumArtist = release ? publicCredits(release.artistReleases).albumArtist : null;
    return albumArtist ? { artistSlug: albumArtist.slug } : null;
  }

  /**
   * Find the first release whose title matches `title` case-insensitively.
   * Used by the find-or-create-release flow to dedupe by album title.
   */
  static async findByTitleInsensitive(title: string): Promise<{
    id: string;
    title: string;
    publishedAt: Date | null;
    deletedOn: Date | null;
  } | null> {
    return ReleaseRepository.findByTitleInsensitive(title);
  }

  /**
   * Fetch the title of a published release by id. Returns null when the
   * release is missing or unpublished. Used by download endpoints that only
   * need the title for the ZIP filename.
   */
  static async findPublishedTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return ReleaseRepository.findPublishedTitleById(id);
  }

  /**
   * Fetch the title of a release by id regardless of publish state. Used by
   * post-purchase confirmation flows where the release may have since been
   * unpublished but the customer still needs the original title.
   */
  static async findTitleById(id: string): Promise<{ id: string; title: string } | null> {
    return ReleaseRepository.findTitleById(id);
  }

  /**
   * Lightweight existence check used by callers that only need to validate a
   * releaseId before performing a follow-up write.
   */
  static async existsById(id: string): Promise<boolean> {
    return ReleaseRepository.existsById(id);
  }
}
