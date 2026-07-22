/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID, timingSafeEqual } from 'node:crypto';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import type { ReleaseCoverSource } from '@/lib/types/domain/release';
import type { Json } from '@/lib/types/domain/shared';
import { replaceBioImagePlaceholders } from '@/lib/utils/bio-image-placeholders';
import { buildCdnImageVariantUrl } from '@/lib/utils/build-cdn-image-variant-url';
import { composeBioFigures, type BioFigureImageMeta } from '@/lib/utils/compose-bio-figures';
import { resolveEnrichmentBaseUrl } from '@/lib/utils/enrichment-base-url';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import {
  sanitizeBioHtml,
  sanitizeBioHtmlNoImages,
  sanitizeBioText,
} from '@/lib/utils/sanitize-bio-html';
import { validateBioLinks } from '@/lib/utils/validate-bio-links';
import {
  bioProgressSchema,
  type BioGenerationData,
  type BioGenerationResult,
  type BioGenerationStatusResult,
  type BioProgress,
  type BioProgressPayload,
  type BioStatus,
  type GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';
import {
  isInFlightJobStatus,
  resolveStaleJobView,
  toAsyncJobStatus,
} from '@/utils/async-job-lifecycle';

import { type BioGenerationLambdaInput } from './bio-generation-fixture';
import { dispatchBioGenerationLocally } from './bio-generation-local-dispatch';
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
  licenseUrl: string | null;
  sourceUrl: string | null;
  originalUrl: string | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  kind: string | null;
  alt: string | null;
  hasFace: boolean | null;
  faceScore: number | null;
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
 * Sanitize an optional URL destined for an `href`, enforcing an http(s) scheme.
 * `sanitizeUrl` returns `''` for a non-http(s) scheme (e.g. `javascript:`/`data:`),
 * which this coerces to `null`. Zod's `z.string().url()` validates URL *shape*
 * only, so this guard — not the schema — is what keeps XSS schemes off the badge.
 */
const sanitizeHref = (url: string | null | undefined): string | null =>
  url ? sanitizeUrl(url) || null : null;

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
  // Both reach an `href`; `sanitizeHref` enforces http(s) (schema validates shape only).
  licenseUrl: sanitizeHref(image.licenseUrl),
  sourceUrl: sanitizeHref(image.sourceUrl),
  originalUrl: image.url,
  width: result.width ?? image.width ?? null,
  height: result.height ?? image.height ?? null,
  isPrimary: image.isPrimary,
  kind: image.kind ?? null,
  alt: sanitizeOptional(image.alt),
  // Face fields are numbers/booleans validated by the schema — pass them
  // through unchanged (no href/text sanitizer applies).
  hasFace: image.hasFace ?? null,
  faceScore: image.faceScore ?? null,
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

/** Projects a re-hosted record onto the figure composer's meta shape. */
const toFigureMeta = (image: RehostedImage): BioFigureImageMeta => ({
  url: image.url,
  alt: image.alt,
  title: image.title,
  attribution: image.attribution,
});

/**
 * Builds a Map from each ORIGINAL image index to the figure composer's meta
 * (url/alt/title/attribution — already sanitized by {@link buildRehostedRecord})
 * so the long bio's first placeholders can be composed into floated, captioned
 * `figure.bio-figure` blocks. Deduped indices are aliased to the SURVIVING
 * copy's meta, looked up by the alias URL among the non-null survivors; an
 * alias whose survivor cannot be found is omitted so its placeholder falls
 * through to the plain url-swap fallback (which aliases by URL).
 */
const buildImageMetaIndex = (
  rehosted: Array<RehostedImage | null>,
  duplicateAliases: Map<number, string>
): Map<number, BioFigureImageMeta> => {
  const map = new Map<number, BioFigureImageMeta>();
  rehosted.forEach((image, index) => {
    if (image) map.set(index, toFigureMeta(image));
  });
  duplicateAliases.forEach((survivorUrl, duplicateIndex) => {
    if (map.has(duplicateIndex)) return;
    const survivor = rehosted.find((image) => image?.url === survivorUrl);
    if (survivor) map.set(duplicateIndex, toFigureMeta(survivor));
  });
  return map;
};

/**
 * Persist-order comparator, tiered top to bottom: primaries first, then higher
 * Rekognition face scores (a null/unscored image sorts last within this tier),
 * then licensed images before unlicensed ones (an image is "licensed" when it
 * carries any `license` string). Returns 0 within a tier so `Array.prototype.sort`
 * — spec-stable — preserves the incoming order there. Extracted as a named helper
 * to stay within the cyclomatic-complexity limit.
 */
const compareByImageRank = (a: RehostedImage, b: RehostedImage): number => {
  const primaryDelta = Number(b.isPrimary) - Number(a.isPrimary);
  if (primaryDelta !== 0) return primaryDelta;
  const faceDelta = (b.faceScore ?? -1) - (a.faceScore ?? -1);
  if (faceDelta !== 0) return faceDelta;
  return Number(Boolean(b.license)) - Number(Boolean(a.license));
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

/**
 * Skip dead-link probing in E2E and fake-generation modes — mirrors
 * `shouldSkipRehost` in {@link BioImageService}'s module. The fake path must
 * stay deterministic and offline-safe: an offline dev regen (no DNS) would
 * otherwise drop every fixture link as `dns_failure`.
 */
const shouldSkipLinkValidation = (): boolean =>
  process.env.BIO_GENERATOR_FAKE === 'true' ||
  process.env.E2E_MODE === 'true' ||
  process.env.NEXT_PUBLIC_E2E_MODE === 'true';

/**
 * Mirrors `bioGenerationInputSchema`'s `.max(100)` on `releases` in the Lambda
 * (`bio-generator/src/types.ts`). The two projects deploy separately and cannot
 * share a module, so this constant is a deliberate copy — see the wire-contract
 * parity test in `bio-generation-schema.spec.ts`.
 */
export const MAX_LAMBDA_RELEASES = 100;

/**
 * Builds the lambda-input releases payload from the label's own catalog.
 *
 * Capped: the Lambda rejects an over-cap payload wholesale, and the invoke is
 * fire-and-forget, so exceeding it would strand the job until the stale sweep
 * rather than dropping the extra releases. The repository orders newest-first,
 * so the cap keeps the most recent chronology anchors.
 */
const toLambdaReleases = (
  releases: ReleaseCoverSource[]
): NonNullable<BioGenerationLambdaInput['releases']> =>
  releases.slice(0, MAX_LAMBDA_RELEASES).map((release) => ({
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
      licenseUrl: null,
      sourceUrl: null,
      originalUrl: null,
      width: null,
      height: null,
      isPrimary: false,
      kind: 'cover',
      alt: `${release.title} album cover`,
      hasFace: null,
      faceScore: null,
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
  imageMetaByIndex: Map<number, BioFigureImageMeta>;
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
  imageMetaByIndex,
  persistedLinks,
  genres,
}: AssembleContentInput): GeneratedBioContent => ({
  // Every bio is rich HTML that may carry inline links and image:N
  // placeholders, so resolve placeholders first. The short bio uses the
  // no-image sanitizer (inline images break layout in listing cards and meta
  // descriptions). The long bio's processing order is locked: compose the
  // first mapped placeholders into floated figures, THEN plain-swap whatever
  // the composer left (unmapped index or past the cap), THEN sanitize. The
  // altBio keeps the plain src-swap only.
  shortBio: sanitizeBioHtmlNoImages(replaceBioImagePlaceholders(data.shortBio, imageUrlByIndex)),
  longBio: sanitizeBioHtml(
    replaceBioImagePlaceholders(composeBioFigures(data.longBio, imageMetaByIndex), imageUrlByIndex)
  ),
  altBio: sanitizeBioHtml(replaceBioImagePlaceholders(data.altBio, imageUrlByIndex)),
  genres,
  images: persistedImages.map(
    ({ width: _width, height: _height, sortOrder: _sortOrder, ...rest }) => rest
  ),
  links: persistedLinks.map(({ sortOrder: _sortOrder, ...rest }) => rest),
  model: data.model,
});

/**
 * Re-host + sanitize + dead-link-validate + assemble raw generation data and
 * persist it, replacing the artist's bio content. Reached only through the
 * completion callback now — both the real Lambda and the local adapter POST
 * their result there, so there is one persistence path. Returns the assembled
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

  // Same key-space with richer values: original index → sanitized caption meta
  // so the long bio's first placeholders compose into floated figures.
  const imageMetaByIndex = buildImageMetaIndex(rehosted, duplicateAliases);

  // Rank survivors `isPrimary desc, faceScore desc (nulls last), licensed desc`
  // (stable within a tier) then re-index sortOrder over the sorted result. The
  // Lambda already caps the number of primaries (and which images are primary is
  // its choice, not a function of array position), so preserve isPrimary as-is.
  //
  // Placeholder-safe: `imageUrlByIndex` (built above at buildImageUrlIndex) keys
  // by the ORIGINAL, pre-sort index, so re-ordering the persisted rows here does
  // not disturb `image:N` placeholder resolution.
  const persistedImages = rehosted
    .filter((image): image is RehostedImage => image !== null)
    .sort(compareByImageRank)
    .map((image, index) => ({ ...image, sortOrder: index }));

  // Drop any link whose URL is not http(s); streaming links are kept (2026-07).
  const sanitizedLinks = sanitizeLinks(data.links);

  // Probe the sanitized EXTERNAL links and drop only the definitively dead
  // (dns_failure / ssrf_disallowed / 404/410), then re-index sortOrder densely
  // over the kept array. Skipped on the fake/E2E path (offline-deterministic).
  const validatedLinks = shouldSkipLinkValidation()
    ? sanitizedLinks
    : await validateBioLinks(sanitizedLinks);
  const reindexedLinks = validatedLinks.map((link, index) => ({ ...link, sortOrder: index }));

  // Append internal release links using the prefetched catalog (no extra
  // query). Appended AFTER validation so `/releases/...` URLs are never probed.
  const persistedLinks = appendReleaseLinks(reindexedLinks, releases);

  // Append rights-cleared CDN cover images after the discovered palette.
  const persistedImagesWithCovers = appendInternalCoverImages(persistedImages, releases);

  const content = assembleContent({
    data,
    persistedImages: persistedImagesWithCovers,
    imageUrlByIndex,
    imageMetaByIndex,
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
 * job is always dispatched across the seam (`dispatched`) and finished by the
 * completion callback, whether the AWS invoke or the local adapter carried it;
 * a run that never got that far resolves to `failed` with a message.
 */
export type RunGenerationJobResult = { status: 'dispatched' } | { status: 'failed'; error: string };

/** The artist row, once loaded and known to exist. */
type LoadedArtist = NonNullable<Awaited<ReturnType<typeof ArtistRepository.findById>>>;

/** Shared pre-invoke context: the artist, its catalog, and the built Lambda input. */
type GenerationPrep = {
  artist: LoadedArtist;
  releases: ReleaseCoverSource[];
  input: BioGenerationLambdaInput;
};

/**
 * Cap on how many reference images the Lambda receives per run — enough to give
 * Rekognition a strong face signal without inflating the invoke payload.
 */
const MAX_REFERENCE_IMAGES = 3;

/**
 * Build the Lambda's `referenceImageUrls`: the artist's own image sources first,
 * then admin-uploaded custom bio image URLs, keeping only absolute http(s) URLs,
 * deduped case-insensitively, capped at {@link MAX_REFERENCE_IMAGES}. Order is
 * preserved so the artist's canonical images take priority when the cap trims.
 */
const buildReferenceImageUrls = (
  artistImageSrcs: Array<string | null>,
  customBioImageUrls: string[]
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of [...artistImageSrcs, ...customBioImageUrls]) {
    const url = sanitizeUrl(candidate ?? '');
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
    if (result.length === MAX_REFERENCE_IMAGES) break;
  }
  return result;
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

  // Admin-uploaded custom bio images round out the artist's own images as face
  // references. A lookup failure degrades to artist images only (never fatal).
  const customBioImageUrls = await ArtistRepository.findCustomBioImageUrls(artist.id).catch(
    (error) => {
      loggers.media.warn('bio_custom_reference_images_failed', {
        artistId: artist.id,
        error: String(error),
      });
      return [] as string[];
    }
  );

  const referenceImageUrls = buildReferenceImageUrls(
    artist.images.map((image) => image.src),
    customBioImageUrls
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
    referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
  };

  return { ok: true, prep: { artist, releases, input } };
};

/**
 * Real (async) path: mint a per-job token + callback URL, store the token, and
 * fire the `Event` invoke. Leaves the artist `processing` — the Lambda's
 * callback finishes the job. Fails (clearing the token) when the callback URL is
 * unconfigured or the invoke cannot be dispatched.
 */
const dispatchGeneration = async (prep: GenerationPrep): Promise<RunGenerationJobResult> => {
  const jobToken = randomUUID();
  const base = resolveEnrichmentBaseUrl();
  if (!base) {
    const error = 'Bio generator callback URL is not configured';
    await ArtistRepository.setBioStatus(prep.artist.id, 'failed', { error });
    return { status: 'failed', error };
  }

  const callbackUrl = `${base}/api/artists/${prep.artist.id}/bio-generation/callback`;
  const progressUrl = `${base}/api/artists/${prep.artist.id}/bio-generation/progress`;

  await ArtistRepository.setBioJobToken(prep.artist.id, jobToken);
  const ack = await BioGenerationService.generate({
    ...prep.input,
    callbackUrl,
    progressUrl,
    jobToken,
  });
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
 * Coerce a stored (loosely-typed JSON) progress value into a validated
 * {@link BioProgress}, returning `null` for absent or malformed data so the
 * timeline degrades to "no stage" rather than surfacing a garbage checkpoint.
 */
const parseStoredProgress = (value: Json | null): BioProgress | null => {
  const parsed = bioProgressSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
    // Adapter selection, made once, at the seam. The local adapter POSTs the
    // same progress and callback the Lambda does, so everything downstream of
    // this line is identical on both paths.
    if (process.env.BIO_GENERATOR_FAKE === 'true') {
      return dispatchBioGenerationLocally(input);
    }

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

      return await dispatchGeneration(prepared.prep);
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

    // The shared read-time stale coercion: an in-flight job past STALE_JOB_MS
    // reads as `failed` with the timeout copy (non-persistent — a late
    // completion callback can still claim the underlying row).
    const { status, error } = resolveStaleJobView({
      status: toAsyncJobStatus(state.bioStatus),
      startedAt: state.bioStartedAt,
      error: state.bioError ?? null,
    });
    const content = BioGenerationService.buildBioContent(state, status);

    // Surface progress only while the (post-coercion) status is in flight; once
    // terminal — succeeded, failed, or stale-coerced to failed — there is no
    // live stage to show, so the timeline resolves rather than lingering.
    const progress = isInFlightJobStatus(status) ? parseStoredProgress(state.bioProgress) : null;

    return { status, error, content, progress };
  }

  /**
   * Verifies an async completion callback and atomically claims the job so it can
   * only be completed once, even under concurrent duplicate callbacks (AWS `Event`
   * invoke is at-least-once and the Lambda's callback POST can retry). Returns the
   * artist slug (for revalidation) only when the job is `processing`, the stored
   * token constant-time-matches the callback's token, AND this caller wins the
   * atomic `claimBioJobToken` (a conditional `updateMany` that clears the
   * single-use token as it matches). Returns `null` — without touching the token —
   * when the artist is missing, the job is not in flight, no token is stored, the
   * token mismatches (so a forged callback can neither DoS a real one nor attempt
   * the claim), or another concurrent callback already claimed the job.
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
      return null; // do NOT attempt the claim on a mismatched/forged callback
    }
    const claimed = await ArtistRepository.claimBioJobToken(artistId, jobToken);
    if (!claimed) {
      return null; // a concurrent callback already won the atomic claim
    }
    return { slug: state.slug };
  }

  /**
   * Records a per-stage progress checkpoint for an in-flight generation job. The
   * progress channel VERIFIES the per-job token (constant-time, via the same
   * {@link tokensMatch} the callback uses) but NEVER claims it — claiming is
   * exclusive to {@link verifyAndClaimCallback}, so a stream of progress POSTs
   * can never consume the single-use token and lock out the real completion.
   * Writes only when the artist exists, has a stored token that matches, AND the
   * job is `processing`; any gate failure returns `false` without writing. The
   * server stamps `at` so the client cannot forge the checkpoint time.
   * Repository errors are caught and logged, never thrown — a lost checkpoint is
   * cosmetic and must not break the generation run.
   *
   * @param artistId - The artist whose in-flight job the checkpoint targets.
   * @param jobToken - The per-job token presented by the checkpoint (verified, not claimed).
   * @param payload - The stage/detail/counts checkpoint; the server stamps `at`.
   * @returns `true` iff the checkpoint was persisted.
   */
  static async recordProgress(
    artistId: string,
    jobToken: string,
    payload: BioProgressPayload
  ): Promise<boolean> {
    try {
      const state = await ArtistRepository.getBioGenerationState(artistId);
      if (!state || !state.bioJobToken) {
        return false;
      }
      if (!tokensMatch(state.bioJobToken, jobToken)) {
        return false; // verify only — a mismatched token records nothing
      }
      if (state.bioStatus !== 'processing') {
        return false;
      }

      await ArtistRepository.setBioProgress(artistId, {
        ...payload,
        at: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      loggers.media.error('bio_progress_record_failed', error);
      return false;
    }
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
