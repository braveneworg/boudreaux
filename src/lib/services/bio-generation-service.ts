/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { ArtistRepository } from '@/lib/repositories/artist-repository';
import { sanitizeUrl } from '@/lib/utils/sanitization';
import { sanitizeBioHtml, sanitizeBioText } from '@/lib/utils/sanitize-bio-html';
import {
  bioGenerationResultSchema,
  type BioGenerationResult,
  type GeneratedBioContent,
} from '@/lib/validation/bio-generation-schema';

import { fakeBioGeneration, type BioGenerationLambdaInput } from './bio-generation-fixture';
import { BioImageService } from './bio-image-service';

let lambdaClient: LambdaClient | null = null;

const getLambdaClient = (): LambdaClient => {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });
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
 * deterministic fixture so flows are testable without AWS or a Groq key.
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
        console.error('Bio generator Lambda returned a function error:', response.FunctionError);
        return { ok: false, error: 'Bio generation failed' };
      }

      const payloadText = response.Payload ? Buffer.from(response.Payload).toString('utf-8') : '';
      const parsed = bioGenerationResultSchema.safeParse(JSON.parse(payloadText));
      if (!parsed.success) {
        console.error('Malformed bio generator response:', parsed.error.issues);
        return { ok: false, error: 'Bio generation returned an unexpected response' };
      }

      return parsed.data;
    } catch (error) {
      console.error('Bio generation invoke failed:', error);
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
    // is CDN-served and not hotlinked. Best-effort: an image that fails to
    // re-host is dropped rather than aborting the whole generation. Attribution
    // is intentionally not stored for re-hosted images.
    const rehosted = await Promise.all(
      result.data.images.map(async (image, index) => {
        try {
          const { url, width, height } = await BioImageService.rehostWithVariants(
            image.url,
            artist.id,
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
          console.warn('Bio image re-host failed; dropping image:', error);
          return null;
        }
      })
    );

    // Re-index sortOrder after dropping failed images. The Lambda already caps
    // the number of primaries (and which images are primary is its choice, not
    // a function of array position), so preserve isPrimary as-is.
    const persistedImages = rehosted
      .filter((image): image is NonNullable<typeof image> => image !== null)
      .map((image, index) => ({ ...image, sortOrder: index }));

    // Drop any link whose URL is not http(s). Lambda link sources (MusicBrainz /
    // Wikidata relations) are community-editable untrusted input, so a
    // `javascript:`/`data:` URL must never reach the persisted, publicly-rendered
    // anchor. `sanitizeUrl` returns '' for disallowed schemes.
    const persistedLinks = result.data.links.reduce<
      Array<{ label: string; url: string; kind: string | null; sortOrder: number }>
    >((acc, link) => {
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

    const content: GeneratedBioContent = {
      shortBio: sanitizeBioText(result.data.shortBio),
      longBio: sanitizeBioHtml(result.data.longBio),
      genres,
      images: persistedImages.map(
        ({ width: _width, height: _height, sortOrder: _sortOrder, ...rest }) => rest
      ),
      links: persistedLinks.map(({ sortOrder: _sortOrder, ...rest }) => rest),
      model: result.data.model,
    };

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
}
