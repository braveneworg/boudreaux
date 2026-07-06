/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getCoverArtImages } from './caa.js';
import { postBioCallback } from './callback.js';
import { runQualityPasses } from './factcheck.js';
import { critiqueProse, draftAndSynthesizeProse, reviseProse } from './gemini.js';
import { readUrl, searchArtistSources } from './jina.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getScrapeApiKey } from './lib/secrets.js';
import { classifyReferenceKind, deriveLinkLabel } from './link-labels.js';
import { isListeningServiceUrl } from './listening-services.js';
import { listReleaseGroups, lookupArtist } from './musicbrainz.js';
import { bioGenerationInputSchema, DEFAULT_GEMINI_MODEL } from './types.js';
import { verifyScrapedImages } from './vision.js';
import { getWikidataData } from './wikidata.js';
import { getCommonsCategoryImages, getCommonsImage } from './wikimedia.js';
import { getWikipediaExtract } from './wikipedia.js';

import type { BioCallbackPayload } from './callback.js';
import type { ScrapedImage } from './jina.js';
import type { ReleaseGroupSummary } from './musicbrainz.js';
import type {
  ArtistFacts,
  BioGenerationData,
  BioGenerationInput,
  BioGenerationResult,
  BioImage,
  BioLink,
} from './types.js';
import type { VisionContext } from './vision.js';

/** Injectable collaborators so the orchestration can be unit-tested in full. */
export interface BioGeneratorDeps {
  lookupArtist: typeof lookupArtist;
  getWikidataData: typeof getWikidataData;
  getWikipediaExtract: typeof getWikipediaExtract;
  getCommonsImage: typeof getCommonsImage;
  /** Prose generator — the draft-and-synthesize ensemble in production. */
  generateProse: typeof draftAndSynthesizeProse;
  critiqueProse: typeof critiqueProse;
  reviseProse: typeof reviseProse;
  getGeminiApiKey: () => Promise<string>;
  getScrapeApiKey: typeof getScrapeApiKey;
  searchArtistSources: typeof searchArtistSources;
  readUrl: typeof readUrl;
  listReleaseGroups: typeof listReleaseGroups;
  getCoverArtImages: typeof getCoverArtImages;
  getCommonsCategoryImages: typeof getCommonsCategoryImages;
  verifyScrapedImages: typeof verifyScrapedImages;
  /** Best-effort POST of the result back to the web app's async callback. */
  postCallback: (payload: BioCallbackPayload) => Promise<void>;
}

const defaultDeps: BioGeneratorDeps = {
  lookupArtist,
  getWikidataData,
  getWikipediaExtract,
  getCommonsImage,
  generateProse: draftAndSynthesizeProse,
  critiqueProse,
  reviseProse,
  getGeminiApiKey,
  getScrapeApiKey,
  searchArtistSources,
  readUrl,
  listReleaseGroups,
  getCoverArtImages,
  getCommonsCategoryImages,
  verifyScrapedImages,
  postCallback: postBioCallback,
};

const MAX_IMAGES = 100;
const MAX_PRIMARY = 3;
const MAX_LINKS = 100;
/** Commons category members resolved per artist (P373). */
const MAX_COMMONS_CATEGORY_IMAGES = 30;
/** Cover Art Archive front covers resolved per artist. */
const MAX_COVER_ART = 40;
/** Global cap on scraped candidates entering vision verification. */
export const MAX_VISION_CANDIDATES = 60;

/** Known link hosts worth following one level deep for additional images. */
const LINK_FOLLOW_HOSTS = ['bandcamp.com', 'discogs.com'] as const;
/** Cap the fan-out so expansion stays bounded against the Lambda time budget. */
export const MAX_FOLLOWED_LINKS = 4;

/** Search-engine result pages and share widgets — never useful bio links. */
const JUNK_LINK_HOSTS = ['google.com', 'bing.com', 'duckduckgo.com', 'search.yahoo.com'];
const isJunkLinkUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return JUNK_LINK_HOSTS.some((junk) => host === junk || host.endsWith(`.${junk}`));
  } catch {
    return true;
  }
};

/**
 * True when {@link url}'s registrable host equals {@link host} or is a subdomain
 * of it (e.g. `x.bandcamp.com` matches `bandcamp.com`). Guards the `URL` parse,
 * returning `false` on any malformed input.
 */
const registrableHostMatches = (url: string, host: string): boolean => {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
};

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

/** Merges additional grounding text onto existing source material, if any. */
const appendSourceText = (existing: string | undefined, addition: string): string =>
  existing ? `${existing}\n\n${addition}` : addition;

/** Mutable accumulators threaded through the best-effort gathering steps. */
interface MetadataAccumulator {
  images: BioImage[];
  links: BioLink[];
  facts: ArtistFacts;
  /** Web-page image candidates, used only when Commons yields no images. */
  scrapedImages: ScrapedImage[];
  releaseGroups: ReleaseGroupSummary[];
}

/** The display/real name used to drive both the MusicBrainz and web searches. */
const searchNameFor = (input: BioGenerationInput): string =>
  input.displayName.trim() || input.realName?.trim() || input.displayName;

/** Two-attempt MusicBrainz lookup: display name first, then real name. */
const lookupMatch = async (
  input: BioGenerationInput,
  deps: BioGeneratorDeps
): Promise<Awaited<ReturnType<BioGeneratorDeps['lookupArtist']>>> =>
  (await deps.lookupArtist(input.displayName)) ??
  (input.realName ? await deps.lookupArtist(input.realName) : null);

/**
 * Builds the combined long-form grounding text from the Wikipedia article body
 * (primary source) merged with the official site read via Jina Reader, plus any
 * image candidates scraped from the official site. Either source being
 * absent/failed simply contributes nothing (best-effort).
 */
const resolveWikidataSourceText = async (
  wikipediaUrl: string | undefined,
  officialUrl: string | undefined,
  scrapeKey: string | null,
  deps: BioGeneratorDeps
): Promise<{ sourceText: string | undefined; scrapedImages: ScrapedImage[] }> => {
  let sourceText: string | undefined;
  const scrapedImages: ScrapedImage[] = [];
  if (wikipediaUrl) {
    const article = await deps.getWikipediaExtract(wikipediaUrl);
    if (article) sourceText = article.extract;
  }
  if (officialUrl) {
    const official = await deps.readUrl(officialUrl, scrapeKey);
    if (official) {
      sourceText = appendSourceText(sourceText, official.content);
      scrapedImages.push(...official.images);
    }
  }
  return { sourceText, scrapedImages };
};

/**
 * Resolves all candidate Commons images, then prefers attribution-free (public
 * domain / CC0) ones since we re-host without attribution. Truncation happens
 * after ranking so PD/CC0 images survive over attribution-required ones.
 */
const resolveImages = async (fileNames: string[], deps: BioGeneratorDeps): Promise<BioImage[]> => {
  const resolved = await Promise.all(
    fileNames.map(async (fileName) => {
      try {
        return await deps.getCommonsImage(fileName);
      } catch (err) {
        // One bad Commons file must not zero out the whole image set.
        logEvent('warn', 'commons_image_failed', { fileName, error: toErrorMessage(err) });
        return null;
      }
    })
  );
  const candidates = resolved.filter((image): image is BioImage => image !== null);
  candidates.sort(
    (a, b) => Number(isAttributionFree(b.license)) - Number(isAttributionFree(a.license))
  );
  return candidates.slice(0, MAX_IMAGES);
};

/** The Wikipedia/official-site links derived from the Wikidata entity. */
const wikidataLinks = (
  wikipediaUrl: string | undefined,
  officialUrl: string | undefined
): BioLink[] => {
  const links: BioLink[] = [];
  if (wikipediaUrl) links.push({ label: 'Wikipedia', url: wikipediaUrl, kind: 'wikipedia' });
  if (officialUrl) links.push({ label: 'Official site', url: officialUrl, kind: 'official' });
  return links;
};

/** Enriches the accumulator with everything derived from the Wikidata entity. */
const applyWikidataFacts = async (
  acc: MetadataAccumulator,
  wikidataId: string,
  scrapeKey: string | null,
  deps: BioGeneratorDeps
): Promise<void> => {
  let wd: Awaited<ReturnType<BioGeneratorDeps['getWikidataData']>>;
  try {
    wd = await deps.getWikidataData(wikidataId);
  } catch (err) {
    // Isolate Wikidata so its failure keeps the MusicBrainz links already gathered.
    logEvent('warn', 'wikidata_failed', { wikidataId, error: toErrorMessage(err) });
    return;
  }

  acc.facts.wikipediaUrl = wd.wikipediaUrl;
  acc.facts.officialUrl = wd.officialUrl;
  acc.links.push(...wikidataLinks(wd.wikipediaUrl, wd.officialUrl));

  const { sourceText, scrapedImages } = await resolveWikidataSourceText(
    wd.wikipediaUrl,
    wd.officialUrl,
    scrapeKey,
    deps
  );
  if (sourceText) acc.facts.sourceText = sourceText;
  acc.scrapedImages.push(...scrapedImages);

  const images = await resolveImages(wd.imageFileNames, deps);
  acc.images.push(...images);
  logEvent('info', 'wikidata_images', {
    wikidataId,
    candidates: wd.imageFileNames.length,
    resolved: images.length,
  });

  if (wd.commonsCategory) {
    const categoryImages = await deps.getCommonsCategoryImages(
      wd.commonsCategory,
      MAX_COMMONS_CATEGORY_IMAGES
    );
    acc.images.push(...categoryImages);
    logEvent('info', 'commons_category_images', {
      category: wd.commonsCategory,
      resolved: categoryImages.length,
    });
  }
};

/** Enriches the accumulator with a found MusicBrainz match and its Wikidata data. */
const applyMatch = async (
  acc: MetadataAccumulator,
  match: NonNullable<Awaited<ReturnType<BioGeneratorDeps['lookupArtist']>>>,
  scrapeKey: string | null,
  deps: BioGeneratorDeps
): Promise<void> => {
  acc.facts.musicBrainzId = match.mbid;
  acc.facts.artistType = match.artistType;
  acc.facts.area = match.area;
  acc.facts.beginDate = match.beginDate;
  acc.facts.endDate = match.endDate;
  if (match.tags.length) acc.facts.tags = match.tags;
  acc.links.push(...match.links);

  if (match.wikidataId) {
    await applyWikidataFacts(acc, match.wikidataId, scrapeKey, deps);
  }

  acc.releaseGroups = await deps.listReleaseGroups(match.mbid);
  if (acc.releaseGroups.length) {
    const covers = await deps.getCoverArtImages(acc.releaseGroups, MAX_COVER_ART);
    acc.images.push(...covers);
    logEvent('info', 'cover_art_images', {
      releaseGroups: acc.releaseGroups.length,
      covers: covers.length,
    });
  }
};

/**
 * Web search (Jina) as additional grounding *context*, not just a fallback:
 * always gathered and MERGED with any Wikipedia/official-site material so both
 * the extensive long bio and the informed short bio draw on the fullest
 * possible material. Runs six searches (biography + press queries + targeted
 * press-photo/bandcamp/discogs image queries) and merges results. Optional +
 * best-effort (never throws).
 */
const applyWebSearch = async (
  acc: MetadataAccumulator,
  input: BioGenerationInput,
  scrapeKey: string | null,
  deps: BioGeneratorDeps
): Promise<void> => {
  const artist = searchNameFor(input);
  const queries: Array<string | undefined> = [
    undefined,
    `${artist} musician interview review press`,
    `${artist} music press feature profile`,
    `${artist} press photo live performance`,
    `${artist} musician site:bandcamp.com`,
    `${artist} musician site:discogs.com`,
  ];

  for (const query of queries) {
    const found = await deps.searchArtistSources(artist, scrapeKey, undefined, { query });
    if (!found) {
      logEvent('info', 'web_search_empty', { artist });
      continue;
    }
    logEvent('info', 'web_search_results', { artist, urls: found.sourceUrls.length });

    acc.facts.sourceText = appendSourceText(acc.facts.sourceText, found.sourceText);
    acc.scrapedImages.push(...found.images);
    acc.facts.sourceUrls = [
      ...new Set(
        [
          acc.facts.wikipediaUrl,
          acc.facts.officialUrl,
          ...(acc.facts.sourceUrls ?? []),
          ...found.sourceUrls,
        ].filter((url): url is string => Boolean(url))
      ),
    ];
    for (const ref of found.references) {
      acc.links.push({
        label: deriveLinkLabel({ title: ref.title, url: ref.url, artistName: artist }),
        url: ref.url,
        kind: classifyReferenceKind(ref.title),
      });
    }
  }
};

/**
 * Follow a FIXED set of already-discovered high-value links (Bandcamp/Discogs)
 * one level deep for images, pushing them into `acc.scrapedImages` so they pass
 * the same vision gate as web-search images. No recursive crawl; deduped
 * against links already read (`acc.facts.sourceUrls`); capped at
 * {@link MAX_FOLLOWED_LINKS}. Best-effort — a null read simply contributes
 * nothing.
 */
const followKnownLinksForImages = async (
  acc: MetadataAccumulator,
  scrapeKey: string | null,
  deps: BioGeneratorDeps
): Promise<void> => {
  const alreadyRead = new Set(acc.facts.sourceUrls ?? []);
  const targets = acc.links
    .filter((link) => LINK_FOLLOW_HOSTS.some((host) => registrableHostMatches(link.url, host)))
    .filter((link) => !alreadyRead.has(link.url))
    .slice(0, MAX_FOLLOWED_LINKS);

  for (const link of targets) {
    const result = await deps.readUrl(link.url, scrapeKey);
    if (result) acc.scrapedImages.push(...result.images);
  }
};

/** The registrable host of a scraped image's source page, for attribution. */
const attributionHost = (sourceUrl: string): string => {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
};

/** Maps a scraped page image onto the {@link BioImage} shape Commons images use. */
const toScrapedBioImage = (image: ScrapedImage): BioImage => ({
  url: image.url,
  thumbnailUrl: null,
  title: image.alt,
  attribution: attributionHost(image.sourceUrl),
  license: null,
  sourceUrl: image.sourceUrl,
  width: null,
  height: null,
  isPrimary: false,
});

/** Year prefix of an ISO date, or null when absent/malformed. */
const yearOf = (isoDate: string | null | undefined): string | null => {
  const year = isoDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : null;
};

/**
 * Structured timeline: label-catalog releases first (authoritative), then
 * MusicBrainz release groups, deduped by title, newest last. Prose dates must
 * come from these lines or the labeled facts — not model recall.
 */
const buildChronology = (
  releases: BioGenerationInput['releases'],
  releaseGroups: ReleaseGroupSummary[]
): string[] => {
  const seen = new Set<string>();
  const lines: Array<{ year: number; line: string }> = [];
  for (const release of releases ?? []) {
    const year = yearOf(release.releasedOn);
    if (!year || seen.has(release.title.toLowerCase())) continue;
    seen.add(release.title.toLowerCase());
    lines.push({
      year: Number(year),
      line: `${year}: released "${release.title}" (label catalog — authoritative)`,
    });
  }
  for (const group of releaseGroups) {
    const year = yearOf(group.firstReleaseDate);
    if (!year || seen.has(group.title.toLowerCase())) continue;
    seen.add(group.title.toLowerCase());
    lines.push({ year: Number(year), line: `${year}: released "${group.title}" (MusicBrainz)` });
  }
  return lines.sort((a, b) => a.year - b.year).map((entry) => entry.line);
};

/**
 * Vision-verifies the scraped candidates, then merges survivors AFTER the
 * provenance-guaranteed tiers (Commons portrait/category, Cover Art Archive),
 * deduped by URL, up to MAX_IMAGES. Fail-closed: an unverifiable candidate
 * never ships.
 */
const applyVerifiedScrapedImages = async (
  acc: MetadataAccumulator,
  input: BioGenerationInput,
  verify: (candidates: BioImage[], context: VisionContext) => Promise<BioImage[]>
): Promise<void> => {
  if (!acc.scrapedImages.length) return;
  const seen = new Set(acc.images.map((image) => image.url.toLowerCase()));
  const ranked = [...acc.scrapedImages].sort(
    (a, b) => Number(Boolean(b.alt)) - Number(Boolean(a.alt))
  );
  const candidates: BioImage[] = [];
  for (const candidate of ranked) {
    const key = candidate.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(toScrapedBioImage(candidate));
  }

  const context: VisionContext = {
    artistNames: [
      input.displayName,
      input.realName,
      ...(input.akaNames?.split(',').map((name) => name.trim()) ?? []),
    ].filter((name): name is string => Boolean(name)),
    releaseTitles: [
      ...(input.releases?.map((release) => release.title) ?? []),
      ...acc.releaseGroups.map((group) => group.title),
    ],
  };
  const verified = await verify(candidates.slice(0, MAX_VISION_CANDIDATES), context);
  for (const image of verified) {
    if (acc.images.length >= MAX_IMAGES) break;
    acc.images.push(image);
  }
  logEvent('info', 'scraped_images_merged', {
    candidates: candidates.length,
    verified: verified.length,
    total: acc.images.length,
  });
};

/**
 * Finalizes the accumulator: appends admin links (last, so curated entries
 * survive dedupe), drops junk-host links (search engines, share widgets),
 * classifies any remaining streaming-service links as `kind: 'streaming'`,
 * caps the link list at {@link MAX_LINKS}, verifies and merges scraped images
 * after provenance-guaranteed tiers, caps images at {@link MAX_IMAGES}, and
 * derives the chronology, internal release URLs, and image-title list for the prompt.
 */
const finalizeMetadata = async (
  acc: MetadataAccumulator,
  input: BioGenerationInput,
  verify: (candidates: BioImage[], context: VisionContext) => Promise<BioImage[]>
): Promise<void> => {
  for (const url of input.links ?? []) {
    acc.links.push({ label: 'Reference', url, kind: 'other' });
  }

  acc.links = dedupeLinks(acc.links)
    .filter((link) => !isJunkLinkUrl(link.url))
    .map((link) =>
      isListeningServiceUrl(link.url) ? { ...link, kind: 'streaming' as const } : link
    )
    .slice(0, MAX_LINKS);

  await applyVerifiedScrapedImages(acc, input, verify);
  acc.images = acc.images.slice(0, MAX_IMAGES);

  acc.facts.chronology = buildChronology(input.releases, acc.releaseGroups);
  acc.facts.internalReleaseUrls = input.releases?.map((release) => release.url);
  acc.facts.imageTitles = acc.images.map(
    (image) => image.alt?.trim() || image.title?.trim() || `Photo of ${input.displayName}`
  );
};

/**
 * Best-effort metadata gathering. Any failure (rate limit, missing entity)
 * degrades to fewer images/links rather than aborting — the artist still gets
 * a bio. Returns the assembled images, links, and grounding facts.
 */
const gatherMetadata = async (
  input: BioGenerationInput,
  apiKey: string,
  model: string,
  deps: BioGeneratorDeps
): Promise<{ images: BioImage[]; links: BioLink[]; facts: ArtistFacts }> => {
  const acc: MetadataAccumulator = {
    images: [],
    links: [],
    scrapedImages: [],
    releaseGroups: [],
    facts: {
      displayName: input.displayName,
      realName: input.realName,
      akaNames: input.akaNames,
      description: input.description,
      existingGenres: input.existingGenres,
      bornOn: input.bornOn,
      diedOn: input.diedOn,
      formedOn: input.formedOn,
      imageTitles: [],
    },
  };

  // Jina works keyless (lower rate limit); the key just raises the limit, so we
  // resolve it once and always attempt scraping regardless of whether it is set.
  const artist = searchNameFor(input);
  const scrapeKey = await deps.getScrapeApiKey();
  logEvent('info', 'enrichment_start', { artist, jinaKey: Boolean(scrapeKey) });

  try {
    const match = await lookupMatch(input, deps);
    if (match) {
      logEvent('info', 'musicbrainz_match', {
        mbid: match.mbid,
        wikidataId: match.wikidataId ?? null,
        links: match.links.length,
      });
      await applyMatch(acc, match, scrapeKey, deps);
    } else {
      logEvent('info', 'musicbrainz_no_match', { artist });
    }
  } catch (err) {
    logEvent('warn', 'musicbrainz_failed', { artist, error: toErrorMessage(err) });
  }

  await applyWebSearch(acc, input, scrapeKey, deps);
  await followKnownLinksForImages(acc, scrapeKey, deps);
  await finalizeMetadata(acc, input, (candidates, context) =>
    deps.verifyScrapedImages(candidates, context, { apiKey, model })
  );

  logEvent('info', 'enrichment_complete', {
    artist,
    images: acc.images.length,
    links: acc.links.length,
    hasSourceText: Boolean(acc.facts.sourceText),
  });

  return { images: acc.images, links: acc.links, facts: acc.facts };
};

/** Applies the LLM's image ranking, marking up to {@link MAX_PRIMARY} primaries. */
const applyImageRanking = (images: BioImage[], indexes: number[] | undefined): BioImage[] => {
  const primarySet = new Set(
    (indexes && indexes.length ? indexes : images.map((_, i) => i)).slice(0, MAX_PRIMARY)
  );
  return images.map((image, i) => ({ ...image, isPrimary: primarySet.has(i) }));
};

/**
 * Orchestrates a full bio generation: gather grounding metadata, ask Gemini for
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
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const apiKey = await deps.getGeminiApiKey();
  const { images, links, facts } = await gatherMetadata(input, apiKey, model, deps);

  const prose = await deps.generateProse(facts, apiKey, model);
  const checked = await runQualityPasses(
    { prose, facts, apiKey, model },
    { critiqueProse: deps.critiqueProse, reviseProse: deps.reviseProse }
  );

  // applyImageRanking already caps the COUNT of primaries to MAX_PRIMARY via the
  // selected indexes; the primaries can sit at any position, so we must NOT
  // re-cap by array index here — that would zero out a primary the model picked
  // at index >= MAX_PRIMARY, leaving the artist with no primary image.
  const rankedImages = applyImageRanking(images, checked.primaryImageIndexes);

  const genres = checked.genres?.trim() || input.existingGenres?.trim() || null;

  return {
    shortBio: checked.shortBio,
    longBio: checked.longBio,
    altBio: checked.altBio ?? '',
    genres,
    images: rankedImages,
    links,
    model,
  };
};

/**
 * Runs the generation, converting a thrown error into the `ok: false` envelope
 * so both branches yield a {@link BioGenerationResult} the caller can inspect.
 */
const runToResult = async (
  input: BioGenerationInput,
  deps: BioGeneratorDeps
): Promise<BioGenerationResult> => {
  try {
    const data = await runBioGeneration(input, deps);
    return { ok: true, data };
  } catch (err) {
    logEvent('warn', 'bio_generation_failed', { error: toErrorMessage(err) });
    return { ok: false, error: err instanceof Error ? err.message : 'Bio generation failed' };
  }
};

/**
 * The testable core of the Lambda: validate the event, run the generation, and
 * — when the event carries a `callbackUrl` + `jobToken` — POST the result back
 * to the web app's async completion callback (best-effort) before returning a
 * discriminated result envelope. `deps` is the dependency-injection seam used
 * by unit tests; it must NEVER be wired to a positional handler argument, since
 * AWS fills the handler's second argument with the Lambda context, not deps
 * (see {@link lambdaHandler}).
 */
export const runLambda = async (
  event: unknown,
  deps: BioGeneratorDeps = defaultDeps
): Promise<BioGenerationResult> => {
  const parsed = bioGenerationInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  const result = await runToResult(parsed.data, deps);

  const { callbackUrl, jobToken } = parsed.data;
  if (callbackUrl && jobToken) {
    await deps.postCallback({ url: callbackUrl, jobToken, result });
  }
  return result;
};

/**
 * AWS Lambda entry point (registered as `handler.lambdaHandler`). AWS invokes an
 * async handler as `(event, context)`, so the second argument is the Lambda
 * context — NOT a dependency bag. It is accepted and deliberately ignored here
 * so it can never be mistaken for `deps`: binding context to `deps` is exactly
 * what broke every invocation (and orphaned every job) in v4.183.0. All work —
 * and the injectable seam — lives in {@link runLambda}, always run against the
 * real {@link defaultDeps}.
 */
export const lambdaHandler = async (
  event: unknown,
  _context?: unknown
): Promise<BioGenerationResult> => runLambda(event);
