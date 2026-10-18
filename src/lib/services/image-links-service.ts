/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { IMAGE_LINKS_TASK, MAX_IMAGE_LINKS, type ImageLinksInput } from '@fakefour/job-contract';

import { ArtistBioImageRepository } from '@/lib/repositories/artist-bio-image-repository';
import { ArtistBioLinkRepository } from '@/lib/repositories/artist-bio-link-repository';
import {
  ArtistRepository,
  type ImageLinksJobStateRecord,
} from '@/lib/repositories/artist-repository';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type { JobAdapter, JobDispatch, JobTypes } from '@/lib/services/job-runner/types';
import type { ArtistBioLinkRecord, CreateArtistBioImageData } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import { deriveBioLinkLabel } from '@/lib/utils/derive-bio-link-label';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import type {
  ImageLinksData,
  ImageLinksStatusResponse,
  ImageSourceLink,
} from '@/lib/validation/image-links-schema';

import {
  buildReferenceImageUrls,
  buildRehostedRecord,
  deriveDisplayName,
  type RehostedImage,
} from './bio-generation-service';
import { BioImageService } from './bio-image-service';

/** Projects a re-hosted, sanitized image onto a `linked` pool row. */
const toLinkedRow = (artistId: string, image: RehostedImage): CreateArtistBioImageData => ({
  artistId,
  url: image.url,
  thumbnailUrl: image.thumbnailUrl,
  title: image.title,
  attribution: image.attribution,
  license: image.license,
  licenseUrl: image.licenseUrl,
  sourceUrl: image.sourceUrl,
  originalUrl: image.originalUrl,
  width: image.width,
  height: image.height,
  isPrimary: false,
  kind: image.kind ?? 'photo',
  alt: image.alt,
  hasFace: image.hasFace,
  faceScore: image.faceScore,
  contentHash: image.contentHash,
  perceptualHash: image.perceptualHash,
  origin: 'linked',
});

/** Outcome of flagging a URL as one of an artist's image sources. */
export type AddSourceLinkResult =
  { status: 'added'; link: ImageSourceLink } | { status: 'not-found' } | { status: 'limit' };

/**
 * Upserts the image-source row. A concurrent add that loses the unique
 * `(artistId, url)` index surfaces as `DUPLICATE`; one retry then finds the
 * winner's row and simply flags it.
 */
const upsertImageSourceRow = async (
  artistId: string,
  url: string
): Promise<ArtistBioLinkRecord> => {
  const label = deriveBioLinkLabel(url);
  try {
    return await ArtistBioLinkRepository.upsertImageSource(artistId, url, label);
  } catch (error) {
    if (error instanceof DataError && error.code === 'DUPLICATE') {
      return ArtistBioLinkRepository.upsertImageSource(artistId, url, label);
    }
    throw error;
  }
};

/**
 * Re-hosts the callback's images that are not already in the pool and inserts
 * the survivors as `linked` rows. Returns how many rows were added. Pool URLs
 * are compared case-insensitively, matching the Lambda's own dedupe; the
 * re-host then also skips a candidate whose bytes (or perceptual hash) match
 * any hashed pool image, whatever its origin, since this job deletes nothing.
 */
const persistLinkedImages = async (
  artistId: string,
  images: ImageLinksData['images']
): Promise<number> => {
  const existing = new Set(
    Array.from(await ArtistBioImageRepository.findExistingUrls(artistId), (url) =>
      url.toLowerCase()
    )
  );
  const fresh = images.filter((image) => !existing.has(image.url.toLowerCase()));
  if (fresh.length === 0) return 0;

  const knownImages = await ArtistBioImageRepository.findFingerprints(artistId);
  const { results } = await BioImageService.rehostImages(
    fresh.map((image, index) => ({ url: image.url, index })),
    artistId,
    knownImages
  );
  const rows = fresh.flatMap((image, index) => {
    const result = results.at(index);
    return result ? [toLinkedRow(artistId, buildRehostedRecord(result, image))] : [];
  });
  return ArtistBioImageRepository.createMany(rows);
};

/** The invoke payload without the runner's dispatch fields. */
type ImageLinksRequest = Omit<ImageLinksInput, keyof JobDispatch>;

/**
 * Reads the artist and its stored image-source links and assembles the Lambda
 * request. Returns a typed error when the artist is missing, has no name to
 * match faces against, or has no image-source links.
 */
const prepareImageLinks = async (
  artistId: string
): Promise<{ ok: true; request: ImageLinksRequest } | { ok: false; error: string }> => {
  const artist = await ArtistRepository.findById(artistId);
  if (!artist) return { ok: false, error: 'Artist not found.' };

  const displayName = deriveDisplayName(artist);
  if (!displayName) return { ok: false, error: 'Artist has no name to match faces against.' };

  // `addSourceLink` enforces the cap; the slice only bounds rows that
  // predate it so the payload always satisfies the Lambda's schema.
  const sources = await ArtistBioLinkRepository.findImageSources(artistId);
  const links = sources.slice(0, MAX_IMAGE_LINKS).map((link) => link.url);
  if (links.length === 0) return { ok: false, error: 'Add at least one link first.' };

  // Custom (human-chosen) pool images are the face references; a lookup
  // failure degrades to no references.
  const customUrls = await ArtistBioImageRepository.findCustomUrls(artistId).catch((error) => {
    loggers.media.warn('image_links_reference_images_failed', {
      artistId,
      error: String(error),
    });
    return [] as string[];
  });
  const referenceImageUrls = buildReferenceImageUrls(customUrls);

  return {
    ok: true,
    request: {
      task: IMAGE_LINKS_TASK,
      artistId,
      displayName,
      links,
      referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
    },
  };
};

/** The images-from-links job's types (see the job runner). */
interface ImageLinksJobTypes extends JobTypes {
  record: ImageLinksJobStateRecord;
  /** A run takes nothing from its trigger: it reads the stored sources. */
  input: undefined;
  request: ImageLinksRequest;
  data: ImageLinksData;
  claim: { slug: string };
  persisted: number;
  checkpoint: never;
  progress: never;
}

/**
 * The images-from-links job, as the job runner sees it: the artist's
 * `imageLinks*` lifecycle columns (independent of the bio job's, so both can
 * run at once), its callback route, the Lambda request, and the persistence
 * that adds the found photos to the pool. It has no progress channel.
 */
export const imageLinksJob: JobAdapter<ImageLinksJobTypes> = {
  kind: 'image-links',
  copy: {
    notFound: 'Artist not found.',
    noCallbackUrl: 'Bio generator callback URL is not configured',
    notConfigured: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    unreachable: 'Failed to reach the bio generator',
    runFailed: 'Image generation failed unexpectedly.',
    persistFailed: 'Image persistence failed.',
  },
  callbackPath: (artistId) => `/api/artists/${artistId}/image-links/callback`,
  // The local adapter answers at once with nothing found.
  fake: { delayMs: 0, result: () => ({ ok: true, data: { images: [] } }) },

  read: (artistId) => ArtistRepository.getImageLinksJobState(artistId),
  state: ({ imageLinksStatus, imageLinksStartedAt, imageLinksError, imageLinksJobToken }) => ({
    status: imageLinksStatus,
    startedAt: imageLinksStartedAt,
    error: imageLinksError ?? null,
    jobToken: imageLinksJobToken,
    progress: null,
  }),
  claimContext: ({ slug }) => ({ slug }),

  markPending: (artistId, startedAt) =>
    ArtistRepository.setImageLinksStatus(artistId, 'pending', { error: null, startedAt }),
  begin: (artistId, now) => ArtistRepository.beginImageLinksRun(artistId, now),
  setToken: (artistId, token) => ArtistRepository.setImageLinksJobToken(artistId, token),
  claimToken: (artistId, token) => ArtistRepository.claimImageLinksJobToken(artistId, token),
  recordFailed: (artistId, error) =>
    ArtistRepository.setImageLinksStatus(artistId, 'failed', { error }),
  recordSucceeded: (artistId, addedCount) =>
    ArtistRepository.setImageLinksStatus(artistId, 'succeeded', { error: null, addedCount }),

  prepare: (artistId) => prepareImageLinks(artistId),
  persist: (artistId, { images }) => persistLinkedImages(artistId, images),
};

/**
 * Service boundary for the images-from-links job: an admin-supplied set of
 * page links the bio-generator Lambda reads for photos (no vision gate), face
 * scores, and hands back for re-hosting into the artist's image pool as
 * `origin: 'linked'` rows. Independent of the bio job — it has its own
 * lifecycle columns, token and callback route, so both can run at once.
 */
export class ImageLinksService {
  /**
   * Flags a URL as one of the artist's image sources (creating an image-only
   * custom link row, or adding the role to an existing reference-link row).
   * Refuses a new URL once the artist already has `MAX_IMAGE_LINKS` sources —
   * the most the job reads — so nothing is stored that would never be
   * scraped; re-adding a URL that is already a source stays idempotent.
   */
  static async addSourceLink(artistId: string, url: string): Promise<AddSourceLinkResult> {
    if (!(await ArtistRepository.existsById(artistId))) return { status: 'not-found' };
    const safeUrl = sanitizeUrl(url);
    const sources = await ArtistBioLinkRepository.findImageSources(artistId);
    const alreadySource = sources.some((source) => source.url === safeUrl);
    if (!alreadySource && sources.length >= MAX_IMAGE_LINKS) return { status: 'limit' };
    const row = await upsertImageSourceRow(artistId, safeUrl);
    return { status: 'added', link: { id: row.id, label: row.label, url: row.url } };
  }

  /** Drops the image-source role from one of the artist's links; `false` when no such row. */
  static async removeSourceLink(artistId: string, linkId: string): Promise<boolean> {
    return ArtistBioLinkRepository.removeImageSource(artistId, linkId);
  }

  /**
   * Reads the job's lifecycle view (stale-coerced like the bio job) plus the
   * artist's image-source links. Returns `null` when the artist is missing.
   */
  static async getStatus(artistId: string): Promise<ImageLinksStatusResponse | null> {
    const state = await ArtistRepository.getImageLinksJobState(artistId);
    if (!state) return null;

    const { status, error } = jobRunner.view(imageLinksJob, state);
    const sources = await ArtistBioLinkRepository.findImageSources(artistId);

    return {
      status,
      error,
      addedCount: state.imageLinksAddedCount,
      links: sources.map(({ id, label, url }) => ({ id, label, url })),
    };
  }
}
