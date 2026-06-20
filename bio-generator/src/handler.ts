/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateProse } from './groq.js';
import { getGroqApiKey } from './lib/secrets.js';
import { lookupArtist } from './musicbrainz.js';
import { bioGenerationInputSchema, DEFAULT_GROQ_MODEL } from './types.js';
import { getWikidataData } from './wikidata.js';
import { getCommonsImage } from './wikimedia.js';
import { getWikipediaExtract } from './wikipedia.js';

import type {
  ArtistFacts,
  BioGenerationData,
  BioGenerationInput,
  BioGenerationResult,
  BioImage,
  BioLink,
} from './types.js';

/** Injectable collaborators so the orchestration can be unit-tested in full. */
export interface BioGeneratorDeps {
  lookupArtist: typeof lookupArtist;
  getWikidataData: typeof getWikidataData;
  getWikipediaExtract: typeof getWikipediaExtract;
  getCommonsImage: typeof getCommonsImage;
  generateProse: typeof generateProse;
  getGroqApiKey: () => Promise<string>;
}

const defaultDeps: BioGeneratorDeps = {
  lookupArtist,
  getWikidataData,
  getWikipediaExtract,
  getCommonsImage,
  generateProse,
  getGroqApiKey,
};

const MAX_IMAGES = 6;
const MAX_PRIMARY = 3;

/**
 * True when a Commons license is public-domain or CC0 — safe to re-host without
 * attribution. Used only to *rank* candidates (we don't hard-drop others).
 */
const isAttributionFree = (license: string | null | undefined): boolean => {
  if (!license) return false;
  const normalized = license.toLowerCase();
  return (
    normalized.includes('public domain') ||
    normalized.includes('cc0') ||
    normalized.includes('pd-') ||
    normalized === 'pd'
  );
};

const dedupeLinks = (links: BioLink[]): BioLink[] => {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Best-effort metadata gathering. Any failure (rate limit, missing entity)
 * degrades to fewer images/links rather than aborting — the artist still gets
 * a bio. Returns the assembled images, links, and grounding facts.
 */
const gatherMetadata = async (
  input: BioGenerationInput,
  deps: BioGeneratorDeps
): Promise<{ images: BioImage[]; links: BioLink[]; facts: ArtistFacts }> => {
  const images: BioImage[] = [];
  let links: BioLink[] = [];
  const facts: ArtistFacts = {
    displayName: input.displayName,
    realName: input.realName,
    akaNames: input.akaNames,
    description: input.description,
    existingGenres: input.existingGenres,
    imageTitles: [],
  };

  try {
    const searchName = input.realName?.trim() || input.displayName;
    const match =
      (await deps.lookupArtist(searchName)) ??
      (input.realName ? await deps.lookupArtist(input.displayName) : null);

    if (match) {
      facts.musicBrainzId = match.mbid;
      facts.artistType = match.artistType;
      facts.area = match.area;
      facts.beginDate = match.beginDate;
      facts.endDate = match.endDate;
      if (match.tags.length) facts.tags = match.tags;
      links.push(...match.links);

      if (match.wikidataId) {
        const wd = await deps.getWikidataData(match.wikidataId);
        facts.wikipediaUrl = wd.wikipediaUrl;
        facts.officialUrl = wd.officialUrl;
        if (wd.wikipediaUrl)
          links.push({ label: 'Wikipedia', url: wd.wikipediaUrl, kind: 'wikipedia' });
        if (wd.officialUrl)
          links.push({ label: 'Official site', url: wd.officialUrl, kind: 'official' });

        // Fetch the full Wikipedia article body as the primary grounding source
        // so the LLM rewrites real depth rather than padding sparse facts. A
        // failed/absent extract simply leaves sourceText unset (best-effort).
        if (wd.wikipediaUrl) {
          const article = await deps.getWikipediaExtract(wd.wikipediaUrl);
          if (article) facts.sourceText = article.extract;
        }

        // Resolve all candidate images, then prefer attribution-free (public
        // domain / CC0) ones since we re-host without attribution. Truncate
        // after ranking so PD/CC0 images survive over attribution-required ones.
        const candidates = (
          await Promise.all(wd.imageFileNames.map((fileName) => deps.getCommonsImage(fileName)))
        ).filter((image): image is BioImage => image !== null);
        candidates.sort(
          (a, b) => Number(isAttributionFree(b.license)) - Number(isAttributionFree(a.license))
        );
        images.push(...candidates.slice(0, MAX_IMAGES));
      }
    }
  } catch (err) {
    console.warn('Bio metadata gathering degraded:', err);
  }

  // Admin-supplied links are appended last so curated entries survive dedupe.
  for (const url of input.links ?? []) {
    links.push({ label: 'Reference', url, kind: 'other' });
  }

  links = dedupeLinks(links);
  facts.imageTitles = images.map((image) => image.title ?? '');

  return { images, links, facts };
};

/** Applies the LLM's image ranking, marking up to {@link MAX_PRIMARY} primaries. */
const applyImageRanking = (images: BioImage[], indexes: number[] | undefined): BioImage[] => {
  const primarySet = new Set(
    (indexes && indexes.length ? indexes : images.map((_, i) => i)).slice(0, MAX_PRIMARY)
  );
  return images.map((image, i) => ({ ...image, isPrimary: primarySet.has(i) }));
};

/**
 * Orchestrates a full bio generation: gather grounding metadata, ask Groq for
 * grounded prose, then assemble the final payload.
 *
 * @param input - Validated generation input.
 * @param deps - Injectable collaborators (defaults to the real implementations).
 * @returns The assembled bio data ready to persist.
 */
export const runBioGeneration = async (
  input: BioGenerationInput,
  deps: BioGeneratorDeps = defaultDeps
): Promise<BioGenerationData> => {
  const model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  const { images, links, facts } = await gatherMetadata(input, deps);

  const apiKey = await deps.getGroqApiKey();
  const prose = await deps.generateProse(facts, apiKey, model);

  // applyImageRanking already caps the COUNT of primaries to MAX_PRIMARY via the
  // selected indexes; the primaries can sit at any position, so we must NOT
  // re-cap by array index here — that would zero out a primary the model picked
  // at index >= MAX_PRIMARY, leaving the artist with no primary image.
  const rankedImages = applyImageRanking(images, prose.primaryImageIndexes);

  const genres = prose.genres?.trim() || input.existingGenres?.trim() || null;

  return {
    shortBio: prose.shortBio,
    longBio: prose.longBio,
    genres,
    images: rankedImages,
    links,
    model,
  };
};

/**
 * Lambda entry point. Invoked directly (not via HTTP) by the web app's
 * bio-generation service. Returns a discriminated result envelope so the
 * caller can branch on success without throwing across the invoke boundary.
 */
export const lambdaHandler = async (event: unknown): Promise<BioGenerationResult> => {
  const parsed = bioGenerationInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  try {
    const data = await runBioGeneration(parsed.data);
    return { ok: true, data };
  } catch (err) {
    console.error('Bio generation failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Bio generation failed' };
  }
};
