/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { replaceBioImagePlaceholders } from '@/lib/utils/bio-image-placeholders';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import {
  sanitizeBioHtml,
  sanitizeBioHtmlNoImages,
  sanitizeBioText,
} from '@/lib/utils/sanitize-bio-html';
import {
  bioGenerationResultSchema,
  type BioGenerationData,
  type BioGenerationResult,
  type BioGenerationStatusResult,
  type BioStatus,
  type GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { fakeBioGeneration, type BioGenerationLambdaInput } from './bio-generation-fixture';
import { BioImageService } from './bio-image-service';

let lambdaClient: LambdaClient | null = null;

// Bio generation runs a synchronous (RequestResponse) invoke that can take up to
// the Lambda's 15-minute timeout (the draft-and-synthesize ensemble runs three
// Gemini generations, each with rate-limit backoff). Give the HTTP client a
// slightly larger request timeout so it never aborts before the function finishes.
export const INVOKE_REQUEST_TIMEOUT_MS = 16 * 60 * 1000;

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
  title: image.title ? sanitizeBioText(image.title) : null,
  attribution: image.attribution ? sanitizeBioText(image.attribution) : null,
  license: image.license ?? null,
  sourceUrl: image.sourceUrl ?? null,
  originalUrl: image.url,
  width: result.width ?? image.width ?? null,
  height: result.height ?? image.height ?? null,
  isPrimary: image.isPrimary,
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

/** Result of the high-level flow; `slug` lets the caller revalidate its pages. */
export type GenerateForArtistResult =
  | { success: true; data: GeneratedBioContent; slug: string }
  | { success: false; error: string };

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
   * Invokes the bio-generator Lambda for the given input and validates its
   * response against the shared contract. Never throws across the boundary.
   *
   * @param input - Artist names/context to ground the generation.
   * @returns A discriminated result from the Lambda (or the fixture).
   */
  static async generate(input: BioGenerationLambdaInput): Promise<BioGenerationResult> {
    if (process.env.BIO_GENERATOR_FAKE === 'true') {
      return fakeBioGeneration(input);
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
        Payload: Buffer.from(JSON.stringify(input)),
      });
      const response = await getLambdaClient().send(command);

      if (response.FunctionError) {
        loggers.media.error('Bio generator Lambda returned a function error', undefined, {
          functionError: response.FunctionError,
        });
        return { ok: false, error: 'Bio generation failed' };
      }

      const payloadText = response.Payload ? Buffer.from(response.Payload).toString('utf-8') : '';
      const parsed = bioGenerationResultSchema.safeParse(JSON.parse(payloadText));
      if (!parsed.success) {
        loggers.media.error('Malformed bio generator response', undefined, {
          issues: parsed.error.issues,
        });
        return { ok: false, error: 'Bio generation returned an unexpected response' };
      }

      return parsed.data;
    } catch (error) {
      loggers.media.error('Bio generation invoke failed', error);
      return { ok: false, error: 'Failed to reach the bio generator' };
    }
  }

  /**
   * Generates (or regenerates) an artist's bio end to end: read the artist,
   * derive the grounding names, invoke generation, sanitize everything for safe
   * redisplay, and persist the bios + discovered images/links.
   *
   * @param artistId - The artist to generate for.
   * @param opts - Optional admin-supplied reference links and description.
   * @returns The sanitized content (plus the artist slug), or a typed error.
   */
  static async generateForArtist(
    artistId: string,
    opts: { links?: string[]; description?: string } = {}
  ): Promise<GenerateForArtistResult> {
    const artist = await ArtistRepository.findById(artistId);
    if (!artist) {
      return { success: false, error: 'Artist not found.' };
    }

    const displayName = deriveDisplayName(artist);
    if (!displayName) {
      return { success: false, error: 'Artist has no name to generate a bio from.' };
    }

    const result = await BioGenerationService.generate({
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
    });

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    const genres = result.data.genres ? sanitizeBioText(result.data.genres) || null : null;

    // Re-host each discovered image into S3 via a cheap thumbnail so it is
    // CDN-served. Full variant re-hosting moves to save-time in PR 2.
    const { rehosted, duplicateAliases } = await rehostImages(result.data.images, artist.id);

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
    const persistedLinks = sanitizeLinks(result.data.links);

    const content = assembleContent({
      data: result.data,
      persistedImages,
      imageUrlByIndex,
      persistedLinks,
      genres,
    });

    await ArtistRepository.replaceBioContent(artist.id, {
      shortBio: content.shortBio,
      bio: content.longBio,
      altBio: content.altBio,
      genres: content.genres,
      bioModel: content.model,
      images: persistedImages,
      links: persistedLinks,
    });

    return { success: true, data: content, slug: artist.slug };
  }

  /**
   * Runs a full generation as a background job and records its lifecycle on the
   * artist: flips to `processing`, runs {@link generateForArtist}, then sets
   * `succeeded` (clearing any prior error) or `failed` (storing the message).
   * Never throws — it is meant to be scheduled via Next.js `after()`, where an
   * unhandled rejection would be lost. Returns the underlying result so the
   * caller can revalidate caches / audit-log on success.
   *
   * @param artistId - The artist to generate for.
   * @param opts - Optional admin-supplied reference links and description.
   */
  static async runGenerationJob(
    artistId: string,
    opts: { links?: string[]; description?: string } = {}
  ): Promise<GenerateForArtistResult> {
    await ArtistRepository.setBioStatus(artistId, 'processing');
    try {
      const result = await BioGenerationService.generateForArtist(artistId, opts);
      await (result.success
        ? ArtistRepository.setBioStatus(artistId, 'succeeded', { error: null })
        : ArtistRepository.setBioStatus(artistId, 'failed', { error: result.error }));
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Bio generation failed unexpectedly.';
      await ArtistRepository.setBioStatus(artistId, 'failed', { error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Reads the current async generation status for an artist, including the
   * persisted bio content when the job has succeeded (so the admin form can
   * populate without a second request). Returns `null` when the artist is
   * missing.
   *
   * @param artistId - The artist to read the status for.
   */
  static async getGenerationStatus(artistId: string): Promise<BioGenerationStatusResult | null> {
    const state = await ArtistRepository.getBioGenerationState(artistId);
    if (!state) {
      return null;
    }

    const status = (state.bioStatus as BioStatus | null) ?? null;
    const content: GeneratedBioContent | null =
      status === 'succeeded'
        ? {
            shortBio: state.shortBio ?? '',
            longBio: state.bio ?? '',
            altBio: state.altBio ?? '',
            genres: state.genres ?? null,
            images: state.bioImages,
            links: state.bioLinks,
            model: state.bioModel ?? '',
          }
        : null;

    return { status, error: state.bioError ?? null, content };
  }
}
