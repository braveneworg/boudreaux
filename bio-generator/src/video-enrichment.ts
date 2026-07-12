/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postBioCallback } from './callback.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import { lookupArtistIdentity, searchArtistCandidates } from './musicbrainz.js';
import { postBioProgress } from './progress.js';
import { resolveIdentityFallback, resolveReleaseDateSuggestion } from './release-date.js';
import { searchSerperWeb } from './serper.js';
import { DEFAULT_GEMINI_MODEL, videoEnrichmentInputSchema } from './types.js';
import { getWikidataData } from './wikidata.js';

import type { MusicBrainzArtistCandidate, MusicBrainzArtistIdentity } from './musicbrainz.js';
import type {
  VideoEnrichmentData,
  VideoEnrichmentInput,
  VideoEnrichmentResult,
  VideoProgressStage,
  VideoSuggestion,
} from './types.js';
import type { WikidataData } from './wikidata.js';

/** Injectable collaborators so the orchestration can be unit-tested in full. */
export interface VideoEnrichmentDeps {
  searchArtistCandidates: typeof searchArtistCandidates;
  lookupArtistIdentity: typeof lookupArtistIdentity;
  getWikidataData: typeof getWikidataData;
  searchSerperWeb: typeof searchSerperWeb;
  getGeminiApiKey: () => Promise<string>;
  getSerperApiKey: typeof getSerperApiKey;
  resolveReleaseDateSuggestion: typeof resolveReleaseDateSuggestion;
  resolveIdentityFallback: typeof resolveIdentityFallback;
  /** Best-effort POST of the result back to the web app's async callback. */
  postCallback: typeof postBioCallback;
  /** Best-effort POST of a single stage checkpoint. */
  postProgress: typeof postBioProgress;
}

const defaultDeps: VideoEnrichmentDeps = {
  searchArtistCandidates,
  lookupArtistIdentity,
  getWikidataData,
  searchSerperWeb,
  getGeminiApiKey,
  getSerperApiKey,
  resolveReleaseDateSuggestion,
  resolveIdentityFallback,
  postCallback: postBioCallback,
  postProgress: postBioProgress,
};

/** Candidates below this MusicBrainz search score never reach a lookup. */
export const MB_MIN_CANDIDATE_SCORE = 90;
/** High confidence additionally requires at least this score. */
export const MB_HIGH_CONFIDENCE_SCORE = 95;
/** Bounded fan-out: identity lookups per artist. */
export const MAX_IDENTITY_LOOKUPS_PER_ARTIST = 2;
/** Mirrors the web schema's per-artist suggestion cap. */
export const MAX_SUGGESTIONS_PER_ARTIST = 12;
/** Cap on aliases folded into one akaNames suggestion. */
const MAX_ALIASES = 8;

/**
 * Wikidata P106 occupations that gate high confidence: musician, singer,
 * singer-songwriter, rapper, record producer, composer.
 */
export const MUSIC_OCCUPATION_IDS: readonly string[] = [
  'Q639669',
  'Q177220',
  'Q488205',
  'Q2252262',
  'Q183945',
  'Q36834',
];

/** True when an unknown event is a `task: 'video-enrichment'` invoke. */
export const isVideoEnrichmentTask = (event: unknown): boolean =>
  typeof event === 'object' &&
  event !== null &&
  'task' in event &&
  event.task === 'video-enrichment';

const namesEqual = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Score gate companion: the candidate must equal the name or one alias. */
const candidateNameMatches = (candidate: MusicBrainzArtistCandidate, name: string): boolean =>
  namesEqual(candidate.name, name) || candidate.aliases.some((alias) => namesEqual(alias, name));

const isSingleToken = (name: string): boolean => name.trim().split(/\s+/).length === 1;

const isFullDate = (value: string | null | undefined): value is string =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** Confidence inputs for one fact. */
export interface ConfidenceSignals {
  score: number;
  /** Wikidata corroborates THIS specific fact. */
  corroborated: boolean;
  /** Wikidata P106 hits the music-occupation allowlist. */
  occupationOk: boolean;
  /** Single-token artist names are collision-prone. */
  singleToken: boolean;
}

/**
 * Confidence rubric (design spec): high = MB ≥95 + Wikidata corroboration of
 * the specific fact + occupation gate; single-token names are hard-capped at
 * medium without full corroboration; everything else structured is medium.
 */
export const confidenceFor = ({
  score,
  corroborated,
  occupationOk,
  singleToken,
}: ConfidenceSignals): VideoSuggestion['confidence'] => {
  if (singleToken && !corroborated) return 'medium';
  return score >= MB_HIGH_CONFIDENCE_SCORE && corroborated && occupationOk ? 'high' : 'medium';
};

type InputArtist = VideoEnrichmentInput['artists'][number];
type KnownIdentity = NonNullable<InputArtist['known']>;

/** The known value for a field, if the web app already holds one. */
const knownValueFor = (
  known: KnownIdentity,
  field: VideoSuggestion['field']
): string | undefined => {
  switch (field) {
    case 'firstName':
      return known.firstName;
    case 'middleName':
      return known.middleName;
    case 'surname':
      return known.surname;
    case 'displayName':
      return known.displayName;
    case 'akaNames':
      return known.akaNames;
    case 'bornOn':
      return known.bornOn;
    default:
      return undefined;
  }
};

/** True when the suggested value adds nothing over the known identity. */
const equalsKnown = (
  known: KnownIdentity | undefined,
  field: VideoSuggestion['field'],
  value: string
): boolean => {
  if (!known) return false;
  const current = knownValueFor(known, field);
  if (!current) return false;
  return field === 'bornOn'
    ? current.slice(0, 10) === value.slice(0, 10)
    : namesEqual(current, value);
};

/** First/middle/surname split of a legal name (middle = everything between). */
const splitLegalName = (
  legal: string
): { firstName?: string; middleName?: string; surname?: string } => {
  const tokens = legal.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};
  if (tokens.length === 1) return { firstName: tokens[0] };
  return {
    firstName: tokens[0],
    ...(tokens.length > 2 ? { middleName: tokens.slice(1, -1).join(' ') } : {}),
    surname: tokens[tokens.length - 1],
  };
};

/** Everything one matched candidate contributes facts from. */
interface IdentityContext {
  artist: InputArtist;
  candidate: MusicBrainzArtistCandidate;
  identity: MusicBrainzArtistIdentity;
  wikidata: WikidataData | null;
}

/** Provenance links for a structured-source fact. */
const identitySources = (ctx: IdentityContext): VideoSuggestion['sources'] => {
  const sources: VideoSuggestion['sources'] = [
    { url: `https://musicbrainz.org/artist/${ctx.candidate.mbid}`, label: 'MusicBrainz' },
  ];
  if (ctx.identity.wikidataId) {
    sources.push({
      url: `https://www.wikidata.org/wiki/${ctx.identity.wikidataId}`,
      label: 'Wikidata',
    });
  }
  return sources;
};

/** bornOn: MB life-span begin, corroborated by a day-precision Wikidata P569. */
const bornOnSuggestion = (
  ctx: IdentityContext,
  signals: ConfidenceSignals
): VideoSuggestion | null => {
  const mbDob = isFullDate(ctx.identity.lifeSpanBegin) ? ctx.identity.lifeSpanBegin : null;
  const wdDob = ctx.wikidata?.dateOfBirth?.precision === 11 ? ctx.wikidata.dateOfBirth.value : null;
  const value = mbDob ?? wdDob;
  if (!value || equalsKnown(ctx.artist.known, 'bornOn', value)) return null;
  const corroborated = Boolean(mbDob && wdDob && mbDob === wdDob);
  return {
    field: 'bornOn',
    value,
    confidence: confidenceFor({ ...signals, corroborated }),
    sources: identitySources(ctx),
  };
};

/** firstName/middleName/surname from the legal name (MB alias or WD P1477). */
const legalNameSuggestions = (
  ctx: IdentityContext,
  signals: ConfidenceSignals
): VideoSuggestion[] => {
  const legal = ctx.identity.legalName ?? ctx.wikidata?.birthName;
  if (!legal) return [];
  const corroborated = Boolean(
    ctx.identity.legalName &&
    ctx.wikidata?.birthName &&
    namesEqual(ctx.identity.legalName, ctx.wikidata.birthName)
  );
  const confidence = confidenceFor({ ...signals, corroborated });
  const parts = splitLegalName(legal);
  const out: VideoSuggestion[] = [];
  const pushPart = (field: 'firstName' | 'middleName' | 'surname', value?: string): void => {
    if (value && !equalsKnown(ctx.artist.known, field, value)) {
      out.push({ field, value, confidence, sources: identitySources(ctx) });
    }
  };
  pushPart('firstName', parts.firstName);
  pushPart('middleName', parts.middleName);
  pushPart('surname', parts.surname);
  return out;
};

/** True when an alias is new information worth suggesting. */
const isNewAlias = (
  alias: string,
  ctx: IdentityContext,
  seen: Set<string>,
  knownAliases: Set<string>
): boolean => {
  const key = alias.toLowerCase();
  if (!alias || seen.has(key) || knownAliases.has(key)) return false;
  if (namesEqual(alias, ctx.artist.name)) return false;
  return !(ctx.identity.legalName && namesEqual(alias, ctx.identity.legalName));
};

/** One akaNames suggestion folding the new MB + WD aliases (medium: noisy). */
const aliasSuggestion = (ctx: IdentityContext): VideoSuggestion | null => {
  const knownAliases = new Set(
    (ctx.artist.known?.akaNames ?? '')
      .split(',')
      .map((alias) => alias.trim().toLowerCase())
      .filter(Boolean)
  );
  const seen = new Set<string>();
  const fresh: string[] = [];
  for (const raw of [...ctx.identity.aliases, ...(ctx.wikidata?.aliases ?? [])]) {
    const alias = raw.trim();
    if (!isNewAlias(alias, ctx, seen, knownAliases)) continue;
    seen.add(alias.toLowerCase());
    fresh.push(alias);
  }
  if (fresh.length === 0) return null;
  return {
    field: 'akaNames',
    value: fresh.slice(0, MAX_ALIASES).join(', '),
    confidence: 'medium',
    sources: identitySources(ctx),
  };
};

/** displayName: the MB canonical name, only when the app has none. */
const displayNameSuggestion = (ctx: IdentityContext): VideoSuggestion | null => {
  if (ctx.artist.known?.displayName) return null;
  if (namesEqual(ctx.candidate.name, ctx.artist.name)) return null;
  return {
    field: 'displayName',
    value: ctx.candidate.name,
    confidence: 'medium',
    sources: identitySources(ctx),
  };
};

/** Wikidata corroboration, isolated so its failure keeps the MB facts. */
const safeWikidata = async (
  deps: VideoEnrichmentDeps,
  wikidataId: string
): Promise<WikidataData | null> => {
  try {
    return await deps.getWikidataData(wikidataId);
  } catch (err) {
    logEvent('warn', 'video_wikidata_failed', { wikidataId, error: toErrorMessage(err) });
    return null;
  }
};

/** Best-effort progress reporter (no-op without progress plumbing). */
type VideoReport = (stage: VideoProgressStage, counts?: Record<string, number>) => Promise<void>;

const buildVideoReport = (input: VideoEnrichmentInput, deps: VideoEnrichmentDeps): VideoReport => {
  const { progressUrl, jobToken } = input;
  if (!progressUrl || !jobToken) return () => Promise.resolve();
  return async (stage, counts) => {
    try {
      await deps.postProgress({ progressUrl, jobToken, stage, counts });
    } catch {
      // Progress is a pure side channel — never let a checkpoint failure surface.
    }
  };
};

/** Facts from the FIRST surviving structured candidate; null = sources missed. */
const structuredSuggestions = async (
  artist: InputArtist,
  deps: VideoEnrichmentDeps,
  report: VideoReport
): Promise<VideoSuggestion[] | null> => {
  const candidates = await deps.searchArtistCandidates(artist.name, 5);
  const gated = candidates
    .filter((c) => c.score >= MB_MIN_CANDIDATE_SCORE && candidateNameMatches(c, artist.name))
    .slice(0, MAX_IDENTITY_LOOKUPS_PER_ARTIST);
  for (const candidate of gated) {
    const identity = await deps.lookupArtistIdentity(candidate.mbid);
    if (!identity) continue;
    // Groups carry no personal identity facts (DOB/legal name are per-person).
    if (identity.type && identity.type !== 'Person') return [];
    await report('wikidata');
    const wikidata = identity.wikidataId ? await safeWikidata(deps, identity.wikidataId) : null;
    const ctx: IdentityContext = { artist, candidate, identity, wikidata };
    const signals: ConfidenceSignals = {
      score: candidate.score,
      corroborated: false, // overridden per fact
      occupationOk: Boolean(
        wikidata?.occupationIds.some((id) => MUSIC_OCCUPATION_IDS.includes(id))
      ),
      singleToken: isSingleToken(artist.name),
    };
    const out: VideoSuggestion[] = [];
    const born = bornOnSuggestion(ctx, signals);
    if (born) out.push(born);
    out.push(...legalNameSuggestions(ctx, signals));
    const alias = aliasSuggestion(ctx);
    if (alias) out.push(alias);
    const display = displayNameSuggestion(ctx);
    if (display) out.push(display);
    return out;
  }
  return null;
};

/** Grouped args threaded through the per-artist enrichment. */
interface EnrichArtistArgs {
  artist: InputArtist;
  keys: { gemini: string; serper: string | null };
  model: string;
  deps: VideoEnrichmentDeps;
  report: VideoReport;
}

/** Map web-fallback facts onto low-confidence suggestions. */
const fallbackSuggestions = async ({
  artist,
  keys,
  model,
  deps,
}: EnrichArtistArgs): Promise<VideoSuggestion[]> => {
  if (!keys.serper) return [];
  const found = await deps.resolveIdentityFallback({
    name: artist.name,
    serperKey: keys.serper,
    geminiKey: keys.gemini,
    model,
  });
  if (!found) return [];
  const out: VideoSuggestion[] = [];
  const push = (field: 'firstName' | 'middleName' | 'surname' | 'bornOn', value?: string): void => {
    if (value && !equalsKnown(artist.known, field, value)) {
      out.push({ field, value, confidence: 'low', sources: found.sources, note: found.note });
    }
  };
  push('firstName', found.firstName);
  push('middleName', found.middleName);
  push('surname', found.surname);
  push('bornOn', found.bornOn);
  return out;
};

/** One artist, fully isolated: any throw degrades to zero suggestions. */
const enrichOneArtist = async (args: EnrichArtistArgs): Promise<VideoSuggestion[]> => {
  try {
    const structured = await structuredSuggestions(args.artist, args.deps, args.report);
    if (structured !== null) return structured;
    await args.report('web-search');
    return await fallbackSuggestions(args);
  } catch (err) {
    logEvent('warn', 'video_artist_enrichment_failed', {
      artistId: args.artist.artistId,
      error: toErrorMessage(err),
    });
    return [];
  }
};

/**
 * Orchestrates one video-enrichment run: per artist, a MusicBrainz candidate
 * gate (score ≥90 + name/alias equality, ≤2 identity lookups) with Wikidata
 * corroboration and the P106 music-occupation gate; a web+Gemini identity
 * fallback (always low confidence) when structured sources miss; and one
 * release-date adjudication for the video. Facts equal to the `known` block
 * are skipped. Sequential and best-effort throughout — one artist's failure
 * never aborts the run.
 */
export const runVideoEnrichment = async (
  input: VideoEnrichmentInput,
  deps: VideoEnrichmentDeps = defaultDeps
): Promise<VideoEnrichmentData> => {
  const report = buildVideoReport(input, deps);
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const keys = { gemini: await deps.getGeminiApiKey(), serper: await deps.getSerperApiKey() };

  await report('musicbrainz', { artists: input.artists.length });
  const artists: VideoEnrichmentData['artists'] = [];
  for (const artist of input.artists) {
    const suggestions = await enrichOneArtist({ artist, keys, model, deps, report });
    artists.push({
      artistId: artist.artistId,
      suggestions: suggestions.slice(0, MAX_SUGGESTIONS_PER_ARTIST),
    });
  }

  await report('adjudicating');
  const releasedOn = keys.serper
    ? await deps.resolveReleaseDateSuggestion(
        {
          title: input.title,
          artistDisplay: input.artistDisplay,
          adminReleasedOn: input.releasedOn,
          serperKey: keys.serper,
          geminiKey: keys.gemini,
          model,
        },
        { searchWeb: deps.searchSerperWeb }
      )
    : null;

  await report('finalizing');
  return { artists, ...(releasedOn ? { video: { releasedOn } } : {}), model };
};

/**
 * The testable Lambda core for `task: 'video-enrichment'`: validate, run,
 * convert a throw into the `ok: false` envelope, and — when the event carries
 * callback plumbing — POST the result to the web app (best-effort).
 */
export const runVideoEnrichmentLambda = async (
  event: unknown,
  deps: VideoEnrichmentDeps = defaultDeps
): Promise<VideoEnrichmentResult> => {
  const parsed = videoEnrichmentInputSchema.safeParse(event);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`,
    };
  }

  let result: VideoEnrichmentResult;
  try {
    result = { ok: true, data: await runVideoEnrichment(parsed.data, deps) };
  } catch (err) {
    logEvent('warn', 'video_enrichment_failed', { error: toErrorMessage(err) });
    result = {
      ok: false,
      error: err instanceof Error ? err.message : 'Video enrichment failed',
    };
  }

  const { callbackUrl, jobToken } = parsed.data;
  if (callbackUrl && jobToken) {
    await deps.postCallback({ url: callbackUrl, jobToken, result });
  }
  return result;
};
