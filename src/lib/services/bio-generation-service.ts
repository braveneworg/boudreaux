/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { replaceBioImagePlaceholders } from '@/lib/utils/bio-image-placeholders';
import { isListeningServiceUrl } from '@/lib/utils/is-listening-service-url';
import { loggers } from '@/lib/utils/logger';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import { sanitizeBioHtml, sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
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
// the Lambda's 10-minute timeout. Give the HTTP client a slightly larger request
// timeout so it never aborts the call before the function finishes.
const INVOKE_REQUEST_TIMEOUT_MS = 11 * 60 * 1000;

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
  surname: string;
  isPseudonymous: boolean;
}): string | undefined => {
  if (artist.isPseudonymous) {
    return undefined;
  }
  const realName = `${artist.firstName} ${artist.surname}`.trim();
  return realName || undefined;
};

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
  thumbnailUrl: null;
  title: string | null;
  attribution: null;
  license: null;
  sourceUrl: null;
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

/**
 * Re-hosts each discovered image into S3 via {@link BioImageService}. Best-effort:
 * an image that fails to re-host is represented as `null` so it can be dropped
 * later without aborting the entire generation.
 */
const rehostImages = async (
  images: BioGenerationData['images'],
  artistId: string
): Promise<Array<RehostedImage | null>> =>
  Promise.all(
    images.map(async (image, index) => {
      try {
        const { url, width, height } = await BioImageService.rehostWithVariants(
          image.url,
          artistId,
          index
        );
        return {
          url,
          thumbnailUrl: null,
          title: image.title ? sanitizeBioText(image.title) : null,
          attribution: null,
          license: null,
          sourceUrl: null,
          width: width ?? image.width ?? null,
          height: height ?? image.height ?? null,
          isPrimary: image.isPrimary,
        };
      } catch (error) {
        loggers.media.warn('Bio image re-host failed; dropping image', { error });
        return null;
      }
    })
  );

/**
 * Builds a Map from each ORIGINAL image index to its re-hosted CDN URL so that
 * `<img src="image:N">` placeholders in the long bio can be resolved before
 * sanitizing. Indices for failed re-hosts are absent from the map.
 */
const buildImageUrlIndex = (rehosted: Array<RehostedImage | null>): Map<number, string> => {
  const map = new Map<number, string>();
  rehosted.forEach((image, index) => {
    if (image) map.set(index, image.url);
  });
  return map;
};

/**
 * Filters and sanitizes Lambda-returned links. Drops any link whose URL is not
 * http(s) (e.g. `javascript:` / `data:`) or that resolves to a listening service
 * (Spotify, Bandcamp, …). Assigns a stable `sortOrder` based on the filtered array.
 */
const sanitizeLinks = (links: BioGenerationData['links']): PersistedLink[] =>
  links.reduce<PersistedLink[]>((acc, link) => {
    const url = sanitizeUrl(link.url);
    if (!url || isListeningServiceUrl(url)) return acc;
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
  // Short bio is rich HTML too (it may carry a single inline link); the
  // sanitizer strips anything outside the allowlist. Consumers that need
  // plain text (cards, meta descriptions) strip tags with sanitizeBioText.
  shortBio: sanitizeBioHtml(data.shortBio),
  longBio: sanitizeBioHtml(replaceBioImagePlaceholders(data.longBio, imageUrlByIndex)),
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
    });

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    const genres = result.data.genres ? sanitizeBioText(result.data.genres) || null : null;

    // Re-host each discovered image into our S3 (with `sharp` variants) so it
    // is CDN-served and not hotlinked. Best-effort: failures are dropped, not fatal.
    const rehosted = await rehostImages(result.data.images, artist.id);

    // Map each ORIGINAL image index → its re-hosted CDN URL so the long bio's
    // `<img src="image:N">` placeholders can be resolved to hosted images before
    // sanitizing. Keyed by original index because re-hosting may drop failures.
    const imageUrlByIndex = buildImageUrlIndex(rehosted);

    // Re-index sortOrder after dropping failed images. The Lambda already caps
    // the number of primaries (and which images are primary is its choice, not
    // a function of array position), so preserve isPrimary as-is.
    const persistedImages = rehosted
      .filter((image): image is RehostedImage => image !== null)
      .map((image, index) => ({ ...image, sortOrder: index }));

    // Drop any link whose URL is not http(s) or resolves to a listening service.
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
            genres: state.genres ?? null,
            images: state.bioImages,
            links: state.bioLinks,
            model: state.bioModel ?? '',
          }
        : null;

    return { status, error: state.bioError ?? null, content };
  }
}
