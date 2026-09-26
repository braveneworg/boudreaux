/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID } from 'node:crypto';

import { InvokeCommand } from '@aws-sdk/client-lambda';
import { IMAGE_LINKS_TASK, MAX_IMAGE_LINKS, type ImageLinksInput } from '@fakefour/job-contract';

import { ArtistBioImageRepository } from '@/lib/repositories/artist-bio-image-repository';
import { ArtistBioLinkRepository } from '@/lib/repositories/artist-bio-link-repository';
import { ArtistRepository } from '@/lib/repositories/artist-repository';
import type { ArtistBioLinkRecord, CreateArtistBioImageData } from '@/lib/types/domain/artist';
import { DataError } from '@/lib/types/domain/errors';
import { deriveBioLinkLabel } from '@/lib/utils/derive-bio-link-label';
import { resolveEnrichmentBaseUrl } from '@/lib/utils/enrichment-base-url';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import type {
  ImageLinksResult,
  ImageLinksStatusResponse,
  ImageSourceLink,
} from '@/lib/validation/image-links-schema';
import { resolveStaleJobView, toAsyncJobStatus } from '@/utils/async-job-lifecycle';

import {
  buildReferenceImageUrls,
  buildRehostedRecord,
  deriveDisplayName,
  type RehostedImage,
} from './bio-generation-service';
import { BioImageService } from './bio-image-service';
import { getLambdaClient, resolveFakeDelayMs, sleep, tokensMatch } from './lambda-dispatch';

/** Outcome of {@link ImageLinksService.runJob}: dispatched across the seam, or failed early. */
export type RunImageLinksJobResult = { status: 'dispatched' } | { status: 'failed'; error: string };

type InvokeAck = { ok: true } | { ok: false; error: string };

/** Fake-path dwell when `BIO_GENERATOR_FAKE_DELAY_MS` is unset: none. */
const DEFAULT_FAKE_IMAGE_LINKS_DELAY_MS = 0;

/**
 * Local stand-in for the Lambda under `BIO_GENERATOR_FAKE=true` (dev, E2E): it
 * POSTs an empty ok result to the same callback route the Lambda would, so the
 * token round-trip, the single-use claim and `completeCallback` all execute.
 */
const dispatchImageLinksLocally = async (input: ImageLinksInput): Promise<InvokeAck> => {
  try {
    await sleep(resolveFakeDelayMs(DEFAULT_FAKE_IMAGE_LINKS_DELAY_MS));
    const response = await fetch(input.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobToken: input.jobToken,
        result: { ok: true, data: { images: [] } },
      }),
      cache: 'no-store',
    });
    if (!response.ok) {
      loggers.media.error('Local image-links dispatch callback rejected', undefined, {
        url: input.callbackUrl,
        status: response.status,
      });
    }
    return { ok: true };
  } catch (error) {
    loggers.media.error('Local image-links dispatch failed', error);
    return { ok: false, error: 'Local image-links dispatch failed' };
  }
};

/** Fires the `Event` invoke (or the local fake). Never throws across the boundary. */
const invoke = async (input: ImageLinksInput): Promise<InvokeAck> => {
  if (process.env.BIO_GENERATOR_FAKE === 'true') {
    return dispatchImageLinksLocally(input);
  }

  const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
  if (!functionName) {
    return {
      ok: false,
      error: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    };
  }

  try {
    await getLambdaClient().send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(input)),
      })
    );
    return { ok: true };
  } catch (error) {
    loggers.media.error('Image-links invoke failed', error);
    return { ok: false, error: 'Failed to reach the bio generator' };
  }
};

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
 * Writes a terminal job status. A failed write is logged, never thrown, so
 * the `after()`-scheduled paths keep their never-throws contract; the stale
 * sweep then coerces the stuck `processing` row on the next read.
 */
const writeTerminalStatus = async (
  artistId: string,
  status: 'failed' | 'succeeded',
  opts: { error: string | null; addedCount?: number }
): Promise<void> => {
  try {
    await ArtistRepository.setImageLinksStatus(artistId, status, opts);
  } catch (error) {
    loggers.media.error('image_links_status_write_failed', {
      artistId,
      status,
      error: String(error),
    });
  }
};

/**
 * Re-hosts the callback's images that are not already in the pool and inserts
 * the survivors as `linked` rows. Returns how many rows were added. Pool URLs
 * are compared case-insensitively, matching the Lambda's own dedupe.
 */
const persistLinkedImages = async (
  artistId: string,
  images: Extract<ImageLinksResult, { ok: true }>['data']['images']
): Promise<number> => {
  const existing = new Set(
    Array.from(await ArtistBioImageRepository.findExistingUrls(artistId), (url) =>
      url.toLowerCase()
    )
  );
  const fresh = images.filter((image) => !existing.has(image.url.toLowerCase()));
  if (fresh.length === 0) return 0;

  const { results } = await BioImageService.rehostImages(
    fresh.map((image, index) => ({ url: image.url, index })),
    artistId
  );
  const rows = fresh.flatMap((image, index) => {
    const result = results.at(index);
    return result ? [toLinkedRow(artistId, buildRehostedRecord(result, image))] : [];
  });
  return ArtistBioImageRepository.createMany(rows);
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
   * Runs an images-from-links job for the artist's stored image-source links:
   * flips to `processing`, mints the per-job token, and fires the `Event`
   * invoke. Leaves the artist `processing` for the callback to complete. Never
   * throws — it is scheduled via Next.js `after()`.
   *
   * @param artistId - The artist whose image-source links to read.
   */
  static async runJob(artistId: string): Promise<RunImageLinksJobResult> {
    try {
      await ArtistRepository.setImageLinksStatus(artistId, 'processing');
      const fail = async (error: string): Promise<RunImageLinksJobResult> => {
        await ArtistRepository.setImageLinksStatus(artistId, 'failed', { error });
        return { status: 'failed', error };
      };

      const artist = await ArtistRepository.findById(artistId);
      if (!artist) return fail('Artist not found.');

      const displayName = deriveDisplayName(artist);
      if (!displayName) return fail('Artist has no name to match faces against.');

      // `addSourceLink` enforces the cap; the slice only bounds rows that
      // predate it so the payload always satisfies the Lambda's schema.
      const sources = await ArtistBioLinkRepository.findImageSources(artistId);
      const links = sources.slice(0, MAX_IMAGE_LINKS).map((link) => link.url);
      if (links.length === 0) return fail('Add at least one link first.');

      const base = resolveEnrichmentBaseUrl();
      if (!base) return fail('Bio generator callback URL is not configured');

      // Custom (human-chosen) pool images round out the artist's own images as
      // face references; a lookup failure degrades to artist images only.
      const customUrls = await ArtistBioImageRepository.findCustomUrls(artistId).catch((error) => {
        loggers.media.warn('image_links_reference_images_failed', {
          artistId,
          error: String(error),
        });
        return [] as string[];
      });
      const referenceImageUrls = buildReferenceImageUrls(
        artist.images.map((image) => image.src),
        customUrls
      );

      const jobToken = randomUUID();
      await ArtistRepository.setImageLinksJobToken(artistId, jobToken);
      const ack = await invoke({
        task: IMAGE_LINKS_TASK,
        artistId,
        displayName,
        links,
        referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
        callbackUrl: `${base}/api/artists/${artistId}/image-links/callback`,
        jobToken,
      });
      if (!ack.ok) {
        await ArtistRepository.setImageLinksJobToken(artistId, null);
        return fail(ack.error);
      }
      return { status: 'dispatched' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Image generation failed unexpectedly.';
      await writeTerminalStatus(artistId, 'failed', { error: message });
      return { status: 'failed', error: message };
    }
  }

  /**
   * Reads the job's lifecycle view (stale-coerced like the bio job) plus the
   * artist's image-source links. Returns `null` when the artist is missing.
   */
  static async getStatus(artistId: string): Promise<ImageLinksStatusResponse | null> {
    const state = await ArtistRepository.getImageLinksJobState(artistId);
    if (!state) return null;

    const { status, error } = resolveStaleJobView({
      status: toAsyncJobStatus(state.imageLinksStatus),
      startedAt: state.imageLinksStartedAt,
      error: state.imageLinksError ?? null,
    });
    const sources = await ArtistBioLinkRepository.findImageSources(artistId);

    return {
      status,
      error,
      addedCount: state.imageLinksAddedCount,
      links: sources.map(({ id, label, url }) => ({ id, label, url })),
    };
  }

  /**
   * Verifies a completion callback and atomically claims the job so it can only
   * complete once. Returns the artist slug (for revalidation) only when the job
   * is `processing`, the token constant-time-matches, AND this caller wins the
   * claim; a mismatched token never attempts the claim.
   */
  static async verifyAndClaimCallback(
    artistId: string,
    jobToken: string
  ): Promise<{ slug: string } | null> {
    const state = await ArtistRepository.getImageLinksJobState(artistId);
    if (!state || state.imageLinksStatus !== 'processing' || !state.imageLinksJobToken) {
      return null;
    }
    if (!tokensMatch(state.imageLinksJobToken, jobToken)) {
      return null;
    }
    const claimed = await ArtistRepository.claimImageLinksJobToken(artistId, jobToken);
    return claimed ? { slug: state.slug } : null;
  }

  /**
   * Completes a claimed job: a non-ok result records `failed`; an ok result
   * re-hosts the new images into the pool as `linked` rows and records
   * `succeeded` with the number added. Never throws — it runs via `after()`.
   */
  static async completeCallback(artistId: string, result: ImageLinksResult): Promise<void> {
    if (!result.ok) {
      await writeTerminalStatus(artistId, 'failed', { error: result.error });
      return;
    }
    try {
      const addedCount = await persistLinkedImages(artistId, result.data.images);
      await writeTerminalStatus(artistId, 'succeeded', { error: null, addedCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Image persistence failed.';
      await writeTerminalStatus(artistId, 'failed', { error: message });
    }
  }
}
