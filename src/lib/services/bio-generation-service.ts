/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { MAX_LAMBDA_RELEASES } from '@fakefour/job-contract';

import { ArtistBioImageRepository } from '@/lib/repositories/artist-bio-image-repository';
import {
  ArtistRepository,
  type BioGenerationStateRecord,
} from '@/lib/repositories/artist-repository';
import { ReleaseRepository } from '@/lib/repositories/release-repository';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type { JobAdapter, JobTypes } from '@/lib/services/job-runner/types';
import type { BioImageFingerprint } from '@/lib/types/domain/artist';
import type { ReleaseCoverSource } from '@/lib/types/domain/release';
import { replaceBioImagePlaceholders } from '@/lib/utils/bio-image-placeholders';
import { buildCdnImageVariantUrl } from '@/lib/utils/build-cdn-image-variant-url';
import { composeBioFigures, type BioFigureImageMeta } from '@/lib/utils/compose-bio-figures';
import { loggers } from '@/lib/utils/logger';
import { releaseDeepLinkHref } from '@/lib/utils/release-deep-link';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import {
  sanitizeBioHtml,
  sanitizeBioHtmlNoImages,
  sanitizeBioText,
} from '@/lib/utils/sanitize-bio-html';
import { validateBioLinks } from '@/lib/utils/validate-bio-links';
import { normalizeVocabularyList } from '@/lib/utils/vocabulary-term';
import {
  bioProgressSchema,
  type BioGenerationData,
  type BioGenerationStatusResult,
  type BioProgress,
  type BioProgressPayload,
  type BioStatus,
  type GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { fakeBioGeneration, type BioGenerationLambdaInput } from './bio-generation-fixture';
import { BioImageService } from './bio-image-service';

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
export const deriveDisplayName = (artist: {
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
/** A discovered image after the cheap thumbnail re-host, ready to persist (sanitized). */
export type RehostedImage = {
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
  /** SHA-256 of the source bytes — stored so later runs dedupe by content, not URL. */
  contentHash: string | null;
  /** 64-bit dHash of the source as 16 hex digits — stored for near-duplicate checks. */
  perceptualHash: string | null;
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
export type RehostResult = {
  url: string;
  width: number | null;
  height: number | null;
  contentHash?: string;
  perceptualHash?: string;
};

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

/** The re-host's source fingerprints as nullable columns (absent in skip-rehost mode). */
const toStoredHashes = ({
  contentHash,
  perceptualHash,
}: RehostResult): Pick<RehostedImage, 'contentHash' | 'perceptualHash'> => ({
  contentHash: contentHash ?? null,
  perceptualHash: perceptualHash ?? null,
});

/**
 * Builds the rich {@link RehostedImage} record from a raw re-host result and
 * the original image metadata returned by the Lambda. Extracted to keep
 * {@link rehostImages} under the cyclomatic-complexity limit.
 */
export const buildRehostedRecord = (
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
  ...toStoredHashes(result),
});

/**
 * Pool rows a regeneration keeps — the only ones a new image may duplicate.
 * Generated rows are about to be replaced, so seeding with them would drop a
 * rediscovered photo and then delete its only copy.
 */
const SURVIVING_POOL_ORIGINS = ['custom', 'linked'] as const;

/**
 * Reads the fingerprints of the pool rows that survive regeneration. A lookup
 * failure degrades to URL-only dedupe (logged), never a failed generation.
 */
const findSurvivingFingerprints = async (artistId: string): Promise<BioImageFingerprint[]> =>
  ArtistBioImageRepository.findFingerprints(artistId, SURVIVING_POOL_ORIGINS).catch((error) => {
    loggers.media.warn('bio_pool_fingerprints_failed', { artistId, error: String(error) });
    return [];
  });

/**
 * Re-hosts each discovered image into S3 via a cheap single-thumbnail pass,
 * deduplicating by content hash so the same photo appearing under different
 * URLs is only uploaded once — including against the custom and linked images
 * already in the pool (ADR-0010 addendum). Attribution metadata is kept
 * through re-host (PR #547). Failures and duplicates are returned as `null` —
 * best-effort. `duplicateAliases` carries each dropped index → survivor URL
 * (a pool image's URL for a pool match) so callers can alias `image:N`
 * placeholders rather than silently dropping them.
 */
const rehostImages = async (
  images: BioGenerationData['images'],
  artistId: string
): Promise<RehostedBatch> => {
  const urlsWithIndices = images.map((img, index) => ({ url: img.url, index }));
  const knownImages = await findSurvivingFingerprints(artistId);
  const { results, duplicateAliases } = await BioImageService.rehostImages(
    urlsWithIndices,
    artistId,
    knownImages
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

// The `releases` cap the web enforces before invoke, single-sourced with the
// Lambda's `bioGenerationInputSchema.releases.max(...)` in
// `@fakefour/job-contract`. Re-exported for the callers that import it here.
export { MAX_LAMBDA_RELEASES };

/**
 * Builds the lambda-input releases payload from the label's own catalog, each
 * release linked by its deep link on the artist's own releases listing.
 *
 * Capped: the Lambda rejects an over-cap payload wholesale, and the invoke is
 * fire-and-forget, so exceeding it would strand the job until the stale sweep
 * rather than dropping the extra releases. The repository orders newest-first,
 * so the cap keeps the most recent chronology anchors.
 */
const toLambdaReleases = (
  releases: ReleaseCoverSource[],
  artistSlug: string
): NonNullable<BioGenerationLambdaInput['releases']> =>
  releases.slice(0, MAX_LAMBDA_RELEASES).map((release) => ({
    title: release.title,
    releasedOn: toIsoDate(release.releasedOn),
    url: releaseDeepLinkHref(artistSlug, release.id),
  }));

/**
 * Appends internal release links (label = release title) after the discovered
 * links using the prefetched `ReleaseCoverSource[]`, each the release's deep
 * link on the artist's own releases listing (the artist holds a credit on
 * every one, so the listing's filter keeps it). Uses an accumulating `seen`
 * set so the same release URL is never written twice, even if the list
 * contains duplicate rows.
 */
const appendReleaseLinks = (
  links: PersistedLink[],
  releases: ReleaseCoverSource[],
  artistSlug: string
): PersistedLink[] => {
  const seen = new Set(links.map((link) => link.url));
  const result = [...links];
  for (const release of releases) {
    const url = releaseDeepLinkHref(artistSlug, release.id);
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
      contentHash: null,
      perceptualHash: null,
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
  // Dimensions, order and content hashes are storage-only — not preview data.
  images: persistedImages.map(
    ({
      width: _width,
      height: _height,
      sortOrder: _sortOrder,
      contentHash: _contentHash,
      perceptualHash: _perceptualHash,
      ...rest
    }) => rest
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
  releases: ReleaseCoverSource[],
  artistSlug: string
): Promise<GeneratedBioContent> => {
  // Sanitize first (the value is model output), then normalise every term into
  // the one storage form. Without the normalise step a blank-fill generation
  // would reintroduce raw `"indie rock"` alongside curated `indie-rock` pills
  // and the two would count as different genres (ADR-0009).
  const genres = data.genres ? normalizeVocabularyList(sanitizeBioText(data.genres)) : null;

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
  // query). Appended AFTER validation so the site's own release links are never probed.
  const persistedLinks = appendReleaseLinks(reindexedLinks, releases, artistSlug);

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
 * Cap on how many reference images the Lambda receives per run — enough to give
 * Rekognition a strong face signal without inflating the invoke payload.
 */
const MAX_REFERENCE_IMAGES = 3;

/**
 * Build the Lambda's `referenceImageUrls` from the artist's custom (human-owned)
 * bio image URLs, keeping only absolute http(s) URLs, deduped
 * case-insensitively, capped at {@link MAX_REFERENCE_IMAGES}. Order is
 * preserved so the first pool rows take priority when the cap trims.
 */
export const buildReferenceImageUrls = (customBioImageUrls: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of customBioImageUrls) {
    const url = sanitizeUrl(candidate);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
    if (result.length === MAX_REFERENCE_IMAGES) break;
  }
  return result;
};

/** What a bio trigger hands the run: the admin's optional reference links and description. */
interface BioGenerationInput {
  links?: string[];
  description?: string;
}

/**
 * Read the artist, guard it has a usable name, prefetch its published releases
 * (non-fatal on failure), and assemble the Lambda input. Returns a typed error
 * when the artist is missing or has no name to ground on.
 */
const prepareGeneration = async (
  artistId: string,
  opts: BioGenerationInput
): Promise<{ ok: true; request: BioGenerationLambdaInput } | { ok: false; error: string }> => {
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

  // Custom (human-owned) bio images are the face references. A lookup failure
  // degrades to no references (never fatal).
  const customBioImageUrls = await ArtistBioImageRepository.findCustomUrls(artist.id).catch(
    (error) => {
      loggers.media.warn('bio_custom_reference_images_failed', {
        artistId: artist.id,
        error: String(error),
      });
      return [] as string[];
    }
  );

  const referenceImageUrls = buildReferenceImageUrls(customBioImageUrls);

  const request: BioGenerationLambdaInput = {
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
    releases: releases.length ? toLambdaReleases(releases, artist.slug) : undefined,
    referenceImageUrls: referenceImageUrls.length ? referenceImageUrls : undefined,
  };

  return { ok: true, request };
};

/** The bio generation job's types (see the job runner). */
interface BioGenerationJobTypes extends JobTypes {
  record: BioGenerationStateRecord;
  input: BioGenerationInput;
  request: BioGenerationLambdaInput;
  data: BioGenerationData;
  claim: { slug: string };
  persisted: void;
  checkpoint: BioProgressPayload;
  progress: BioProgress;
}

/**
 * Observable in-flight window for the local adapter. The real Lambda takes
 * minutes and streams stage checkpoints; the fixture resolves instantly, so the
 * adapter pauses to give the polled admin timeline (2.5s) a window to render a
 * checkpoint before the run completes. Overridable via
 * `BIO_GENERATOR_FAKE_DELAY_MS`; unit tests set `0`.
 */
const FAKE_BIO_DELAY_MS = 4000;

/**
 * The bio generation job, as the job runner sees it: the artist's `bio*`
 * lifecycle columns, the bio callback and progress routes, the Lambda input,
 * and the persistence that replaces the artist's bio content.
 */
export const bioGenerationJob: JobAdapter<BioGenerationJobTypes> = {
  kind: 'bio-generation',
  copy: {
    notFound: 'Artist not found.',
    noCallbackUrl: 'Bio generator callback URL is not configured',
    notConfigured: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    unreachable: 'Failed to reach the bio generator',
    runFailed: 'Bio generation failed unexpectedly.',
    persistFailed: 'Bio persistence failed.',
  },
  callbackPath: (artistId) => `/api/artists/${artistId}/bio-generation/callback`,
  progress: {
    path: (artistId) => `/api/artists/${artistId}/bio-generation/progress`,
    schema: bioProgressSchema,
    write: (artistId, progress) => ArtistRepository.setBioProgress(artistId, progress),
  },
  fake: {
    delayMs: FAKE_BIO_DELAY_MS,
    checkpoint: () => ({ stage: 'vision-gating', counts: { candidates: 3 } }),
    result: (payload) => fakeBioGeneration(payload),
  },

  read: (artistId) => ArtistRepository.getBioGenerationState(artistId),
  state: ({ bioStatus, bioStartedAt, bioError, bioJobToken, bioProgress }) => ({
    status: bioStatus,
    startedAt: bioStartedAt,
    error: bioError ?? null,
    jobToken: bioJobToken,
    progress: bioProgress,
  }),
  claimContext: ({ slug }) => ({ slug }),

  markPending: (artistId, startedAt) =>
    ArtistRepository.setBioStatus(artistId, 'pending', { error: null, startedAt }),
  begin: (artistId, now) => ArtistRepository.beginBioRun(artistId, now),
  setToken: (artistId, token) => ArtistRepository.setBioJobToken(artistId, token),
  claimToken: (artistId, token) => ArtistRepository.claimBioJobToken(artistId, token),
  recordFailed: (artistId, error) => ArtistRepository.setBioStatus(artistId, 'failed', { error }),
  recordSucceeded: (artistId) =>
    ArtistRepository.setBioStatus(artistId, 'succeeded', { error: null }),

  prepare: prepareGeneration,
  // Re-fetches the catalog for the release links (non-fatal on failure); the
  // slug names the artist's own releases listing in each deep link.
  persist: async (artistId, data, { slug }) => {
    const releases = await ReleaseRepository.findPublishedByArtistWithCovers(artistId).catch(
      () => [] as ReleaseCoverSource[]
    );
    await persistGeneratedBio(artistId, data, releases, slug);
  },
};

/**
 * Service boundary for AI bio generation: the polled status read. The job
 * itself runs through the job runner with {@link bioGenerationJob}.
 */
export class BioGenerationService {
  private static buildBioContent(
    state: BioGenerationStateRecord,
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

    // The runner's status view: stale-coerced, with progress only while in flight.
    const { status, error, progress } = jobRunner.view(bioGenerationJob, state);
    const content = BioGenerationService.buildBioContent(state, status);

    return { status, error, content, progress };
  }
}
