/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import type { ReleaseCoverSource } from '@/lib/types/domain/release';
import { replaceBioImagePlaceholders } from '@/lib/utils/bio-image-placeholders';
import { buildCdnImageVariantUrl } from '@/lib/utils/build-cdn-image-variant-url';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import {
  sanitizeBioHtml,
  sanitizeBioHtmlNoImages,
  sanitizeBioText,
} from '@/lib/utils/sanitize-bio-html';
import {
  type BioGenerationData,
  type BioGenerationResult,
  type BioGenerationStatusResult,
  type BioStatus,
  type GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { fakeBioGeneration, type BioGenerationLambdaInput } from './bio-generation-fixture';
import { BioImageService } from './bio-image-service';

let lambdaClient: LambdaClient | null = null;

// Bio generation now fires a fire-and-forget `Event` invoke: the Lambda returns
// 202 immediately (then POSTs its result to the callback route), so the HTTP
// client only needs a short timeout to cover the dispatch round-trip.
export const INVOKE_REQUEST_TIMEOUT_MS = 30 * 1000;

const getLambdaClient = (): LambdaClient => {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttpHandler({ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }),
    });
  }
  return lambdaClient;
};

/** Derive a public real name for the metadata lookup (skip if pseudonymous). */
const deriveRealName = (artist: {
  firstName: string;
  middleName: string | null;
  surname: string;
  isPseudonymous: boolean;
}): string | undefined => {
  if (artist.isPseudonymous) return undefined;
  const realName = [artist.firstName, artist.middleName, artist.surname]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return realName || undefined;
};

/** YYYY-MM-DD for the Lambda's ISO-date fields, or undefined. */
const toIsoDate = (value: Date | null | undefined): string | undefined =>
  value ? value.toISOString().slice(0, 10) : undefined;

/** Resolve the best display name to ground the generation on. */
const deriveDisplayName = (artist: {
  firstName: string;
  surname: string;
  displayName: string | null;
  akaNames: string | null;
}): string =>
  artist.displayName?.trim() ||
  `${artist.firstName} ${artist.surname}`.trim() ||
  artist.akaNames?.split(',')[0]?.trim() ||
  '';

/** Re-hosted image record before `sortOrder` is assigned; width/height may be null. */
type RehostedImage = {
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  sourceUrl: string | null;
  originalUrl: string | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  kind: string | null;
  alt: string | null;
};

/** Re-hosted image with its final sort position for persistence. */
type PersistedImage = RehostedImage & { sortOrder: number };

/** Sanitized link ready for persistence; sortOrder is stripped before returning to callers. */
type PersistedLink = { label: string; url: string; kind: string | null; sortOrder: number };

// ---------------------------------------------------------------------------
// Private helpers — module-scoped so they are accessible from the static
// methods without being part of the public API.
// ---------------------------------------------------------------------------

/** Raw re-host result from {@link BioImageService.rehostImages}. */
type RehostResult = { url: string; width: number | null; height: number | null };

/** Structured output of the private {@link rehostImages} helper. */
type RehostedBatch = {
  rehosted: Array<RehostedImage | null>;
  duplicateAliases: Map<number, string>;
};

/** Sanitize an optional text string; return null if absent or empty. */
const sanitizeOptional = (text: string | null | undefined): string | null =>
  text ? sanitizeBioText(text) : null;

/**
 * Builds the rich {@link RehostedImage} record from a raw re-host result and
 * the original image metadata returned by the Lambda. Extracted to keep
 * {@link rehostImages} under the cyclomatic-complexity limit.
 */
const buildRehostedRecord = (
  result: RehostResult,
  image: BioGenerationData['images'][number]
): RehostedImage => ({
  url: result.url,
  thumbnailUrl: result.url,
  title: sanitizeOptional(image.title),
  attribution: sanitizeOptional(image.attribution),
  license: image.license ?? null,
  sourceUrl: image.sourceUrl ?? null,
  originalUrl: image.url,
  width: result.width ?? image.width ?? null,
  height: result.height ?? image.height ?? null,
  isPrimary: image.isPrimary,
  kind: image.kind ?? null,
  alt: sanitizeOptional(image.alt),
});

/**
 * Re-hosts each discovered image into S3 via a cheap single-thumbnail pass,
 * deduplicating by content hash so the same photo appearing under different
 * URLs is only uploaded once. Attribution metadata is kept through re-host
 * (PR #547). Failures and duplicates are returned as `null` — best-effort.
 * `duplicateAliases` carries each dropped index → survivor URL so callers
 * can alias `image:N` placeholders rather than silently dropping them.
 */
const rehostImages = async (
  images: BioGenerationData['images'],
  artistId: string
): Promise<RehostedBatch> => {
  const urlsWithIndices = images.map((img, index) => ({ url: img.url, index }));
  const { results, duplicateAliases } = await BioImageService.rehostImages(
    urlsWithIndices,
    artistId
  );
  // Use .at(i) rather than [i] so the ESLint security rule does not flag the
  // correlated array lookup as a potential object-injection sink.
  const rehosted = images.map((image, i) => {
    const result = results.at(i);
    return result ? buildRehostedRecord(result, image) : null;
  });
  return { rehosted, duplicateAliases };
};

/**
 * Builds a Map from each ORIGINAL image index to its re-hosted CDN URL so that
 * `<img src="image:N">` placeholders in the long bio can be resolved before
 * sanitizing. Survivors are keyed by their position; duplicates are aliased to
 * the surviving copy's URL via `duplicateAliases` so their placeholders render
 * the same picture instead of being dropped by the sanitizer.
 */
const buildImageUrlIndex = (
  rehosted: Array<RehostedImage | null>,
  duplicateAliases: Map<number, string>
): Map<number, string> => {
  const map = new Map<number, string>();
  rehosted.forEach((image, index) => {
    if (image) map.set(index, image.url);
  });
  duplicateAliases.forEach((survivorUrl, duplicateIndex) => {
    if (!map.has(duplicateIndex)) map.set(duplicateIndex, survivorUrl);
  });
  return map;
};

/**
 * Filters and sanitizes Lambda-returned links. Drops any link whose URL is not
 * http(s) (e.g. `javascript:` / `data:`). Assigns a stable `sortOrder` based on
 * the filtered array. Streaming/listening-service links are kept as of 2026-07.
 */
const sanitizeLinks = (links: BioGenerationData['links']): PersistedLink[] =>
  links.reduce<PersistedLink[]>((acc, link) => {
    const url = sanitizeUrl(link.url);
    if (!url) return acc;
    acc.push({
      label: sanitizeBioText(link.label),
      url,
      kind: link.kind ?? null,
      sortOrder: acc.length,
    });
    return acc;
  }, []);

/** Builds the lambda-input releases payload from the label's own catalog. */
const toLambdaReleases = (
  releases: ReleaseCoverSource[]
): NonNullable<BioGenerationLambdaInput['releases']> =>
  releases.map((release) => ({
    title: release.title,
    releasedOn: toIsoDate(release.releasedOn),
    url: `/releases/${release.id}`,
  }));

/**
 * Appends internal release links (label = release title) after the discovered
 * links using the prefetched `ReleaseCoverSource[]`. Uses an accumulating
 * `seen` set so the same release URL is never written twice, even if the
 * list contains duplicate rows.
 */
const appendReleaseLinks = (
  links: PersistedLink[],
  releases: ReleaseCoverSource[]
): PersistedLink[] => {
  const seen = new Set(links.map((link) => link.url));
  const result = [...links];
  for (const release of releases) {
    const url = `/releases/${release.id}`;
    if (!seen.has(url)) {
      seen.add(url);
      result.push({ label: release.title, url, kind: 'release', sortOrder: result.length });
    }
  }
  return result;
};

/**
 * Appends the label's own release covers as palette images — rights-cleared,
 * already CDN-hosted (no fetch, no re-host), deduped against discovered rows.
 */
const appendInternalCoverImages = (
  persistedImages: PersistedImage[],
  releases: ReleaseCoverSource[]
): PersistedImage[] => {
  const seen = new Set(persistedImages.map((image) => image.url));
  const result = [...persistedImages];
  for (const release of releases) {
    if (!release.coverUrl || seen.has(release.coverUrl)) continue;
    seen.add(release.coverUrl);
    result.push({
      url: release.coverUrl,
      thumbnailUrl: buildCdnImageVariantUrl(release.coverUrl, 384),
      title: release.title,
      attribution: `${release.title} — label release`,
      license: null,
      sourceUrl: null,
      originalUrl: null,
      width: null,
      height: null,
      isPrimary: false,
      kind: 'cover',
      alt: `${release.title} album cover`,
      sortOrder: result.length,
    });
  }
  return result;
};

/** Inputs to {@link assembleContent} — grouped to stay within the `max-params` limit. */
type AssembleContentInput = {
  data: BioGenerationData;
  persistedImages: PersistedImage[];
  imageUrlByIndex: Map<number, string>;
  persistedLinks: PersistedLink[];
  genres: string | null;
};

/**
 * Assembles the final {@link GeneratedBioContent} from sanitized/re-hosted parts.
 * The long bio has its `image:N` placeholders resolved before HTML sanitization.
 */
const assembleContent = ({
  data,
  persistedImages,
  imageUrlByIndex,
  persistedLinks,
  genres,
}: AssembleContentInput): GeneratedBioContent => ({
  // Every bio is rich HTML that may carry inline links and a single inline
  // image:N placeholder, so resolve placeholders first.  The short bio then
  // uses the no-image sanitizer (inline images break layout in listing cards
  // and meta descriptions); long bio and altBio keep their images.
  shortBio: sanitizeBioHtmlNoImages(replaceBioImagePlaceholders(data.shortBio, imageUrlByIndex)),
  longBio: sanitizeBioHtml(replaceBioImagePlaceholders(data.longBio, imageUrlByIndex)),
  altBio: sanitizeBioHtml(replaceBioImagePlaceholders(data.altBio, imageUrlByIndex)),
  genres,
  images: persistedImages.map(
    ({ width: _width, height: _height, sortOrder: _sortOrder, ...rest }) => rest
  ),
  links: persistedLinks.map(({ sortOrder: _sortOrder, ...rest }) => rest),
  model: data.model,
});

/**
 * Re-host + sanitize + assemble raw generation data and persist it, replacing
 * the artist's bio content. Shared by the synchronous fake path
 * ({@link runFakeGeneration}) and the async callback route (which persists on
 * the Lambda's out-of-band completion). Returns the assembled
 * {@link GeneratedBioContent}; callers pair it with the artist slug to
 * revalidate pages. Throws on a DB error (callers map that to `failed`).
 */
export const persistGeneratedBio = async (
  artistId: string,
  data: BioGenerationData,
  releases: ReleaseCoverSource[]
): Promise<GeneratedBioContent> => {
  const genres = data.genres ? sanitizeBioText(data.genres) || null : null;

  // Re-host each discovered image into S3 via a cheap thumbnail so it is
  // CDN-served. Full variant re-hosting moves to save-time in PR 2.
  const { rehosted, duplicateAliases } = await rehostImages(data.images, artistId);

  // Map each ORIGINAL image index → its re-hosted CDN URL so the long bio's
  // `<img src="image:N">` placeholders can be resolved to hosted images before
  // sanitizing. Deduped indices are aliased to their survivor URL so the prose
  // retains the picture instead of having the sanitizer drop the placeholder.
  const imageUrlByIndex = buildImageUrlIndex(rehosted, duplicateAliases);

  // Re-index sortOrder after dropping failed images. The Lambda already caps
  // the number of primaries (and which images are primary is its choice, not
  // a function of array position), so preserve isPrimary as-is.
  const persistedImages = rehosted
    .filter((image): image is RehostedImage => image !== null)
    .map((image, index) => ({ ...image, sortOrder: index }));

  // Drop any link whose URL is not http(s); streaming links are kept (2026-07).
  const sanitizedLinks = sanitizeLinks(data.links);

  // Append internal release links using the prefetched catalog (no extra query).
  const persistedLinks = appendReleaseLinks(sanitizedLinks, releases);

  // Append rights-cleared CDN cover images after the discovered palette.
  const persistedImagesWithCovers = appendInternalCoverImages(persistedImages, releases);

  const content = assembleContent({
    data,
    persistedImages: persistedImagesWithCovers,
    imageUrlByIndex,
    persistedLinks,
    genres,
  });

  await ArtistRepository.replaceBioContent(artistId, {
    shortBio: content.shortBio,
    bio: content.longBio,
    altBio: content.altBio,
    genres: content.genres,
    bioModel: content.model,
    images: persistedImagesWithCovers,
    links: persistedLinks,
  });

  return content;
};

/**
 * Discriminated outcome of {@link BioGenerationService.runGenerationJob}. The
 * synchronous fake path finishes in-process (`completed`); the real path fires
 * an async `Event` invoke (`dispatched`) whose callback later persists the
 * result; both may resolve to `failed` with a message.
 */
export type RunGenerationJobResult =
  | { status: 'completed'; slug: string; data: GeneratedBioContent }
  | { status: 'dispatched' }
  | { status: 'failed'; error: string };

/** The artist row, once loaded and known to exist. */
type LoadedArtist = NonNullable<Awaited<ReturnType<typeof ArtistRepository.findById>>>;

/** Shared pre-invoke context: the artist, its catalog, and the built Lambda input. */
type GenerationPrep = {
  artist: LoadedArtist;
  releases: ReleaseCoverSource[];
  input: BioGenerationLambdaInput;
};

/**
 * Build the absolute callback URL the Lambda POSTs its result to, derived from
 * the app's public base URL (`NEXT_PUBLIC_BASE_URL`). Returns `null` when the
 * base URL is not configured, so the caller can fail the job rather than
 * dispatch an un-answerable invoke. Task B10 refines this derivation.
 */
const buildBioCallbackUrl = (artistId: string): string | null => {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/artists/${artistId}/bio-generation/callback`;
};

/**
 * Read the artist, guard it has a usable name, prefetch its published releases
 * (non-fatal on failure), and assemble the Lambda input. Shared by the fake and
 * real generation paths. Returns a typed error when the artist is missing or has
 * no name to ground on.
 */
const prepareGeneration = async (
  artistId: string,
  opts: { links?: string[]; description?: string }
): Promise<{ ok: true; prep: GenerationPrep } | { ok: false; error: string }> => {
  const artist = await ArtistRepository.findById(artistId);
  if (!artist) {
    return { ok: false, error: 'Artist not found.' };
  }

  const displayName = deriveDisplayName(artist);
  if (!displayName) {
    return { ok: false, error: 'Artist has no name to generate a bio from.' };
  }

  // Fetch once: feeds (a) lambda-input releases, (b) release links, and (c) cover
  // palette. Failure falls back to [] so generation still completes without context.
  const releases = await ReleaseRepository.findPublishedByArtistWithCovers(artist.id).catch(
    (error) => {
      loggers.media.warn('bio_release_covers_failed', {
        artistId: artist.id,
        error: String(error),
      });
      return [] as ReleaseCoverSource[];
    }
  );

  const input: BioGenerationLambdaInput = {
    artistId: artist.id,
    displayName,
    realName: deriveRealName(artist),
    akaNames: artist.akaNames ?? undefined,
    links: opts.links,
    description: opts.description,
    existingGenres: artist.genres ?? undefined,
    bornOn: toIsoDate(artist.bornOn),
    diedOn: toIsoDate(artist.diedOn),
    formedOn: toIsoDate(artist.formedOn),
    releases: releases.length ? toLambdaReleases(releases) : undefined,
  };

  return { ok: true, prep: { artist, releases, input } };
};

/**
 * Synchronous (fake/E2E) path: run the deterministic fixture, persist it, and
 * flip the artist to `succeeded`. Finishes fully in-process — no Event invoke,
 * no callback — so E2E and local dev are unaffected by the async decoupling.
 */
const runFakeGeneration = async (prep: GenerationPrep): Promise<RunGenerationJobResult> => {
  const result = fakeBioGeneration(prep.input);
  if (!result.ok) {
    await ArtistRepository.setBioStatus(prep.artist.id, 'failed', { error: result.error });
    return { status: 'failed', error: result.error };
  }

  const data = await persistGeneratedBio(prep.artist.id, result.data, prep.releases);
  await ArtistRepository.setBioStatus(prep.artist.id, 'succeeded', { error: null });
  return { status: 'completed', slug: prep.artist.slug, data };
};

/**
 * Real (async) path: mint a per-job token + callback URL, store the token, and
 * fire the `Event` invoke. Leaves the artist `processing` — the Lambda's
 * callback finishes the job. Fails (clearing the token) when the callback URL is
 * unconfigured or the invoke cannot be dispatched.
 */
const dispatchGeneration = async (prep: GenerationPrep): Promise<RunGenerationJobResult> => {
  const jobToken = crypto.randomUUID();
  const callbackUrl = buildBioCallbackUrl(prep.artist.id);
  if (!callbackUrl) {
    const error = 'Bio generator callback URL is not configured';
    await ArtistRepository.setBioStatus(prep.artist.id, 'failed', { error });
    return { status: 'failed', error };
  }

  await ArtistRepository.setBioJobToken(prep.artist.id, jobToken);
  const ack = await BioGenerationService.generate({ ...prep.input, callbackUrl, jobToken });
  if (!ack.ok) {
    await ArtistRepository.setBioStatus(prep.artist.id, 'failed', { error: ack.error });
    await ArtistRepository.setBioJobToken(prep.artist.id, null);
    return { status: 'failed', error: ack.error };
  }

  return { status: 'dispatched' };
};

/**
 * Constant-time comparison of two token strings. Compares equal-length `Buffer`s
 * via {@link timingSafeEqual}; the length pre-check leaks nothing meaningful
 * because the job token is a fixed-length random UUID.
 */
const tokensMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/**
 * Service boundary for AI bio generation. Owns the full business flow: read the
 * artist, invoke the `bio-generator` Lambda, sanitize the result, and persist
 * it through the repository. The low-level {@link BioGenerationService.generate}
 * is the Lambda/fixture seam used internally and in unit tests.
 *
 * In E2E and local dev (`BIO_GENERATOR_FAKE=true`) the Lambda call returns a
 * deterministic fixture so flows are testable without AWS or a Gemini key.
 */
export class BioGenerationService {
  /**
   * Fires a fire-and-forget `Event` invoke of the bio-generator Lambda. The
   * Lambda returns 202 immediately and POSTs its result to the callback URL, so
   * there is no response body to read. Never throws across the boundary.
   *
   * @param input - Artist names/context plus `callbackUrl`/`jobToken` for the
   *   out-of-band completion callback.
   * @returns A fire acknowledgement — `{ ok: true }` once dispatched, or a typed
   *   error when the function name is unset or the invoke cannot be reached.
   */
  static async generate(
    input: BioGenerationLambdaInput
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
    if (!functionName) {
      return {
        ok: false,
        error: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
      };
    }

    try {
      const command = new InvokeCommand({
        FunctionName: functionName,
        // Fire-and-forget: 202 + empty payload; the result arrives via callback.
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(input)),
      });
      await getLambdaClient().send(command);
      return { ok: true };
    } catch (error) {
      loggers.media.error('Bio generation invoke failed', error);
      return { ok: false, error: 'Failed to reach the bio generator' };
    }
  }

  /**
   * Runs a generation as a background job and records its lifecycle on the
   * artist. Flips to `processing`, prepares the shared input, then branches:
   * the fake/E2E path finishes in-process and sets `succeeded`; the real path
   * fires an async `Event` invoke, leaving the artist `processing` for the
   * Lambda's callback to complete. Never throws — it is scheduled via Next.js
   * `after()`, where an unhandled rejection would be lost.
   *
   * @param artistId - The artist to generate for.
   * @param opts - Optional admin-supplied reference links and description.
   */
  static async runGenerationJob(
    artistId: string,
    opts: { links?: string[]; description?: string } = {}
  ): Promise<RunGenerationJobResult> {
    await ArtistRepository.setBioStatus(artistId, 'processing');
    try {
      const prepared = await prepareGeneration(artistId, opts);
      if (!prepared.ok) {
        await ArtistRepository.setBioStatus(artistId, 'failed', { error: prepared.error });
        return { status: 'failed', error: prepared.error };
      }

      return process.env.BIO_GENERATOR_FAKE === 'true'
        ? await runFakeGeneration(prepared.prep)
        : await dispatchGeneration(prepared.prep);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Bio generation failed unexpectedly.';
      await ArtistRepository.setBioStatus(artistId, 'failed', { error: message });
      return { status: 'failed', error: message };
    }
  }

  private static buildBioContent(
    state: NonNullable<Awaited<ReturnType<typeof ArtistRepository.getBioGenerationState>>>,
    status: BioStatus | null
  ): GeneratedBioContent | null {
    const hasPersistedMedia = state.bioImages.length > 0 || state.bioLinks.length > 0;
    if (status !== 'succeeded' && !hasPersistedMedia) return null;
    return {
      shortBio: state.shortBio ?? '',
      longBio: state.bio ?? '',
      altBio: state.altBio ?? '',
      genres: state.genres ?? null,
      images: state.bioImages,
      links: state.bioLinks,
      model: state.bioModel ?? '',
    };
  }

  /**
   * Reads the current async generation status for an artist, including the
   * persisted bio content when the job has succeeded or when persisted bio
   * media (images/links) already exist (so the admin form can populate without
   * a second request). Returns `null` when the artist is missing.
   *
   * @param artistId - The artist to read the status for.
   */
  static async getGenerationStatus(artistId: string): Promise<BioGenerationStatusResult | null> {
    const state = await ArtistRepository.getBioGenerationState(artistId);
    if (!state) {
      return null;
    }

    const status = (state.bioStatus as BioStatus | null) ?? null;
    const content = BioGenerationService.buildBioContent(state, status);

    return { status, error: state.bioError ?? null, content };
  }

  /**
   * Verifies an async completion callback and atomically claims the job so it can
   * only be completed once. Returns the artist slug (for revalidation) and clears
   * the single-use token ONLY when the job is `processing` and the stored token
   * constant-time-matches the callback's token. Returns `null` — without clearing
   * the token — when the artist is missing, the job is not in flight, no token is
   * stored, or the token mismatches (so a forged callback cannot DoS a real one).
   *
   * @param artistId - The artist whose in-flight job the callback targets.
   * @param jobToken - The per-job token the callback presents.
   */
  static async verifyAndClaimCallback(
    artistId: string,
    jobToken: string
  ): Promise<{ slug: string } | null> {
    const state = await ArtistRepository.getBioGenerationState(artistId);
    if (!state || state.bioStatus !== 'processing' || !state.bioJobToken) {
      return null;
    }
    if (!tokensMatch(state.bioJobToken, jobToken)) {
      return null; // do NOT clear a valid token on a mismatched/forged callback
    }
    await ArtistRepository.setBioJobToken(artistId, null); // single-use
    return { slug: state.slug };
  }

  /**
   * Completes a claimed async job by persisting the Lambda's result and recording
   * the terminal status. A non-ok result flips the artist to `failed` with the
   * Lambda's error. An ok result re-fetches the artist's published releases
   * (non-fatal on failure), persists the sanitized/re-hosted bio, and flips to
   * `succeeded`; a persistence failure flips to `failed` instead. Never throws —
   * it runs post-response via `after()`.
   *
   * @param artistId - The artist whose job is completing.
   * @param result - The Lambda's validated generation result.
   */
  static async completeCallback(artistId: string, result: BioGenerationResult): Promise<void> {
    if (!result.ok) {
      await ArtistRepository.setBioStatus(artistId, 'failed', { error: result.error });
      return;
    }

    const releases = await ReleaseRepository.findPublishedByArtistWithCovers(artistId).catch(
      () => [] as ReleaseCoverSource[]
    );

    try {
      await persistGeneratedBio(artistId, result.data, releases);
      await ArtistRepository.setBioStatus(artistId, 'succeeded', { error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bio persistence failed.';
      await ArtistRepository.setBioStatus(artistId, 'failed', { error: message });
    }
  }
}
