/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postBioCallback } from './callback.js';
import { logEvent, toErrorMessage } from './lib/log.js';
import { getGeminiApiKey, getSerperApiKey } from './lib/secrets.js';
import {
  lookupArtistIdentity,
  searchArtistCandidates,
  searchRecordingCandidates,
} from './musicbrainz.js';
import { postBioProgress } from './progress.js';
import { resolveIdentityFallback, resolveReleaseDateSuggestion } from './release-date.js';
import { searchSerperWeb } from './serper.js';
import { DEFAULT_GEMINI_MODEL, videoEnrichmentInputSchema } from './types.js';
import { getWikidataData } from './wikidata.js';

import type {
  MusicBrainzArtistCandidate,
  MusicBrainzArtistIdentity,
  MusicBrainzRecordingCandidate,
  MusicBrainzRecordingCredit,
} from './musicbrainz.js';
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
  searchRecordingCandidates: typeof searchRecordingCandidates;
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
  searchRecordingCandidates,
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
/** A recording match must clear this MusicBrainz search score to be trusted. */
export const RECORDING_MIN_SCORE = 90;
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
  /** The matched recording's credit corroborates this artist's identity. */
  creditCorroborated: boolean;
}

/**
 * Confidence rubric (design spec): high = MB ≥95 + Wikidata corroboration of
 * the specific fact + occupation gate; a recording credit that corroborates a
 * Wikidata-backed fact also grants high; single-token names are hard-capped at
 * medium without any corroboration; everything else structured is medium.
 */
export const confidenceFor = ({
  score,
  corroborated,
  occupationOk,
  singleToken,
  creditCorroborated,
}: ConfidenceSignals): VideoSuggestion['confidence'] => {
  if (singleToken && !corroborated && !creditCorroborated) return 'medium';
  if (creditCorroborated && corroborated) return 'high';
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

/** All names the app already associates with an artist (name + display + akas). */
const knownNamesFor = (artist: InputArtist): string[] => [
  artist.name,
  ...(artist.known?.displayName ? [artist.known.displayName] : []),
  ...(artist.known?.akaNames ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean),
];

/** The matched recording's credit for this artist, matched by any known name. */
const creditFor = (
  artist: InputArtist,
  recording: MusicBrainzRecordingCandidate | null
): MusicBrainzRecordingCredit | null =>
  recording?.credits.find((credit) =>
    knownNamesFor(artist).some((name) => namesEqual(credit.name, name))
  ) ?? null;

/** A candidate synthesized from a corroborating credit — skips the name search. */
const creditCandidate = (credit: MusicBrainzRecordingCredit): MusicBrainzArtistCandidate => ({
  mbid: credit.mbid ?? '',
  name: credit.name,
  score: 100,
  sortName: null,
  aliases: [],
});

/** The gated candidate list: the credit fast-path, or the scored name search. */
const gatedCandidates = async (
  artist: InputArtist,
  credit: MusicBrainzRecordingCredit | null,
  deps: VideoEnrichmentDeps
): Promise<MusicBrainzArtistCandidate[]> => {
  if (credit?.mbid) return [creditCandidate(credit)];
  const candidates = await deps.searchArtistCandidates(artist.name, 5);
  return candidates
    .filter((c) => c.score >= MB_MIN_CANDIDATE_SCORE && candidateNameMatches(c, artist.name))
    .slice(0, MAX_IDENTITY_LOOKUPS_PER_ARTIST);
};

/** Every identity fact one matched candidate contributes (bornOn/legal/alias/display). */
const factsFromContext = (ctx: IdentityContext, signals: ConfidenceSignals): VideoSuggestion[] => {
  const out: VideoSuggestion[] = [];
  const born = bornOnSuggestion(ctx, signals);
  if (born) out.push(born);
  out.push(...legalNameSuggestions(ctx, signals));
  const alias = aliasSuggestion(ctx);
  if (alias) out.push(alias);
  const display = displayNameSuggestion(ctx);
  if (display) out.push(display);
  return out;
};

/** Args for {@link structuredSuggestions} — grouped to stay under the params cap. */
interface StructuredArgs {
  artist: InputArtist;
  credit: MusicBrainzRecordingCredit | null;
  deps: VideoEnrichmentDeps;
  report: VideoReport;
}

/** Facts from the FIRST surviving structured candidate; null = sources missed. */
const structuredSuggestions = async ({
  artist,
  credit,
  deps,
  report,
}: StructuredArgs): Promise<VideoSuggestion[] | null> => {
  const gated = await gatedCandidates(artist, credit, deps);
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
      creditCorroborated: Boolean(credit?.mbid),
    };
    return factsFromContext(ctx, signals);
  }
  return null;
};

/** Grouped args threaded through the per-artist enrichment. */
interface EnrichArtistArgs {
  artist: InputArtist;
  /** The matched recording's credit for this artist (fast-path corroboration). */
  credit: MusicBrainzRecordingCredit | null;
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
    const structured = await structuredSuggestions({
      artist: args.artist,
      credit: args.credit,
      deps: args.deps,
      report: args.report,
    });
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

/** A video-level suggestion: the fielded shape keyed by position, not `field`. */
type VideoLevelSuggestion = Omit<VideoSuggestion, 'field'>;
/** The optional `video` block returned alongside the per-artist suggestions. */
type VideoBlock = NonNullable<VideoEnrichmentData['video']>;

/** The provenance link for a matched recording. */
const recordingSource = (recording: MusicBrainzRecordingCandidate): VideoSuggestion['sources'] => [
  { url: `https://musicbrainz.org/recording/${recording.rid}`, label: 'MusicBrainz' },
];

/**
 * The best recording match: the first candidate clearing {@link RECORDING_MIN_SCORE}
 * whose title equals the video title. Best-effort — any search failure yields null.
 */
const findMatchedRecording = async (
  input: VideoEnrichmentInput,
  deps: VideoEnrichmentDeps
): Promise<MusicBrainzRecordingCandidate | null> => {
  const candidates = await deps.searchRecordingCandidates(input.artistDisplay, input.title, 5);
  return (
    candidates.find((c) => c.score >= RECORDING_MIN_SCORE && namesEqual(c.title, input.title)) ??
    null
  );
};

/** True when some input artist claims this credit by any of its known names. */
const creditIsLinked = (input: VideoEnrichmentInput, credit: MusicBrainzRecordingCredit): boolean =>
  input.artists.some((artist) =>
    knownNamesFor(artist).some((name) => namesEqual(credit.name, name))
  );

/** Credits matching no input artist → featured-artist suggestions (wire cap 5). */
const discoverFeatured = (
  input: VideoEnrichmentInput,
  recording: MusicBrainzRecordingCandidate | null
): VideoLevelSuggestion[] => {
  if (!recording) return [];
  return recording.credits
    .filter((credit) => !creditIsLinked(input, credit))
    .slice(0, 5)
    .map((credit) => ({
      value: credit.name,
      confidence: 'medium',
      sources: recordingSource(recording),
      note: 'Credited on the matched recording but not linked to this video.',
    }));
};

/**
 * A "the split may be wrong" displayName suggestion on the primary: only when
 * the input carries multiple artists yet the recording credits exactly one,
 * whose name differs from the primary's. Deliberately bypasses the
 * displayNameSuggestion "only when the app has none" gate.
 */
const unifiedNameSuggestion = (
  primary: InputArtist,
  input: VideoEnrichmentInput,
  recording: MusicBrainzRecordingCandidate | null
): VideoSuggestion | null => {
  if (!recording || input.artists.length <= 1 || recording.credits.length !== 1) return null;
  const [credit] = recording.credits;
  if (namesEqual(credit.name, primary.name)) return null;
  return {
    field: 'displayName',
    value: credit.name,
    confidence: 'medium',
    sources: recordingSource(recording),
    note: 'MusicBrainz credits this recording to a single artist — the split may be wrong.',
  };
};

/** The structured MB release-date row (medium), suppressed when it echoes admin. */
const mbReleaseRow = (
  recording: MusicBrainzRecordingCandidate | null,
  adminReleasedOn: string | undefined
): VideoLevelSuggestion | null => {
  if (!recording || !isFullDate(recording.firstReleaseDate)) return null;
  const mbDate = recording.firstReleaseDate;
  if (mbDate === adminReleasedOn?.slice(0, 10)) return null;
  return { value: mbDate, confidence: 'medium', sources: recordingSource(recording) };
};

/**
 * Merges the MusicBrainz release date with the web adjudication: the MB full
 * date leads; an agreeing web date promotes it to high with combined sources
 * (MB first); a disagreeing/absent web date leaves the MB row unchanged; and
 * with no MB full date the web-only suggestion passes through untouched.
 */
const mergeReleaseDate = (
  recording: MusicBrainzRecordingCandidate | null,
  webSuggestion: VideoLevelSuggestion | null,
  adminReleasedOn: string | undefined
): VideoLevelSuggestion | null => {
  const mbRow = mbReleaseRow(recording, adminReleasedOn);
  if (!mbRow) return webSuggestion;
  if (webSuggestion?.value !== mbRow.value) return mbRow;
  return { ...mbRow, confidence: 'high', sources: [...mbRow.sources, ...webSuggestion.sources] };
};

/** Assembles the optional `video` block, omitting empty keys. */
const buildVideoBlock = (
  releasedOn: VideoLevelSuggestion | null,
  featuredArtists: VideoLevelSuggestion[]
): VideoBlock | null => {
  const video: VideoBlock = {
    ...(releasedOn ? { releasedOn } : {}),
    ...(featuredArtists.length > 0 ? { featuredArtists } : {}),
  };
  return releasedOn || featuredArtists.length > 0 ? video : null;
};

/**
 * Orchestrates one video-enrichment run: a recording-first MusicBrainz match
 * whose credits fast-path each linked artist's identity lookup (and discover
 * unlinked featured artists); per artist, a candidate gate (score ≥90 +
 * name/alias equality, ≤2 identity lookups) with Wikidata corroboration and the
 * P106 music-occupation gate; a web+Gemini identity fallback (always low
 * confidence) when structured sources miss; a unified-name split check; and a
 * release-date adjudication merging the MB date with the web verdict. Facts
 * equal to the `known` block are skipped. Sequential and best-effort throughout
 * — one artist's failure never aborts the run.
 */
export const runVideoEnrichment = async (
  input: VideoEnrichmentInput,
  deps: VideoEnrichmentDeps = defaultDeps
): Promise<VideoEnrichmentData> => {
  const report = buildVideoReport(input, deps);
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const keys = { gemini: await deps.getGeminiApiKey(), serper: await deps.getSerperApiKey() };

  await report('musicbrainz', { artists: input.artists.length });
  const recording = await findMatchedRecording(input, deps).catch(() => null);

  const primary = input.artists.find((artist) => artist.role === 'primary') ?? input.artists[0];
  const artists: VideoEnrichmentData['artists'] = [];
  for (const artist of input.artists) {
    const suggestions = await enrichOneArtist({
      artist,
      credit: creditFor(artist, recording),
      keys,
      model,
      deps,
      report,
    });
    const unified =
      artist.artistId === primary.artistId
        ? unifiedNameSuggestion(primary, input, recording)
        : null;
    artists.push({
      artistId: artist.artistId,
      suggestions: [...suggestions, ...(unified ? [unified] : [])].slice(
        0,
        MAX_SUGGESTIONS_PER_ARTIST
      ),
    });
  }

  await report('adjudicating');
  const webReleasedOn = keys.serper
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
  const releasedOn = mergeReleaseDate(recording, webReleasedOn, input.releasedOn);
  const video = buildVideoBlock(releasedOn, discoverFeatured(input, recording));
  return { artists, ...(video ? { video } : {}), model };
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
