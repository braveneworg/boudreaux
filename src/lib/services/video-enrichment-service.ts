/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { z } from 'zod';

import {
  VideoArtistRepository,
  type VideoArtistWithArtist,
} from '@/lib/repositories/video-artist-repository';
import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';
import { ArtistService } from '@/lib/services/artist-service';
import { jobRunner } from '@/lib/services/job-runner/job-runner';
import type { JobAdapter, JobDispatch, JobTypes } from '@/lib/services/job-runner/types';
import type { Json } from '@/lib/types/domain/shared';
import type { UpdateVideoData } from '@/lib/types/domain/video';
import type {
  CreateSuggestionRow,
  VideoEnrichmentState,
  VideoEnrichmentSuggestionRecord,
} from '@/lib/types/domain/video-enrichment';
import { deriveArtistDisplayName } from '@/lib/utils/artist-display-name';
import { loggers } from '@/lib/utils/logger';
import {
  isReleaseDay,
  releaseDayFromStored,
  todayUtcIsoDate,
  type ReleaseDay,
} from '@/lib/utils/validation/iso-date';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';
import {
  enrichmentIneligibilityReason,
  SUGGESTION_CONFIDENCES,
  VIDEO_LEVEL_SUGGESTION_FIELDS,
  VIDEO_SUGGESTION_FIELDS,
  videoEnrichmentProgressSchema,
  videoSuggestionSourceSchema,
  type EnrichmentIneligibilityReason,
  type SuggestionConfidence,
  type VideoEnrichmentData,
  type VideoEnrichmentProgress,
  type VideoEnrichmentProgressPost,
  type VideoEnrichmentStatusResult,
  type VideoSuggestion,
  type VideoSuggestionField,
} from '@/lib/validation/video-enrichment-schema';
import { splitFeaturedArtists } from '@/utils/artist-name-split';

import { decideEnrichmentAutoApply } from './video-editorial-rules';
import { videoEnrichmentFixture } from './video-enrichment-fixture';

import type { VideoEnrichmentCategory } from '@fakefour/job-contract';

const logger = loggers.media;

/** Hard cap mirrored by the Lambda's input schema (`artists: 1..10`). */
const MAX_LAMBDA_ARTISTS = 10;

/** Invoke payload for the bio-generator Lambda's `video-enrichment` task. */
export interface VideoEnrichmentLambdaInput {
  task: 'video-enrichment';
  videoId: string;
  title: string;
  artistDisplay: string;
  /**
   * Drives the Lambda's flow: INFORMATIONAL skips the music lookups. Typed
   * against the CONTRACT's category so the web union and the wire enum cannot
   * drift silently — `state.category` must remain assignable to it.
   */
  category: VideoEnrichmentCategory;
  releasedOn?: string;
  artists: Array<{
    artistId: string;
    name: string;
    role: 'primary' | 'featured';
    known?: {
      firstName?: string;
      middleName?: string;
      surname?: string;
      displayName?: string;
      akaNames?: string;
      bornOn?: string;
    };
  }>;
  callbackUrl?: string;
  progressUrl?: string;
  jobToken?: string;
  /** Per-job HMAC key the Lambda signs its callbacks with (ADR-0014). */
  signingKey?: string;
}

/** YYYY-MM-DD for wire dates, or undefined. */
const toIsoDate = (value: Date | null | undefined): string | undefined =>
  value ? value.toISOString().slice(0, 10) : undefined;

/** Map join rows onto the Lambda's `artists` payload, dropping empty knowns. */
const toLambdaArtists = (rows: VideoArtistWithArtist[]): VideoEnrichmentLambdaInput['artists'] =>
  rows.slice(0, MAX_LAMBDA_ARTISTS).map((row) => {
    const known = {
      ...(row.artist.firstName ? { firstName: row.artist.firstName } : {}),
      ...(row.artist.middleName ? { middleName: row.artist.middleName } : {}),
      ...(row.artist.surname ? { surname: row.artist.surname } : {}),
      ...(row.artist.displayName ? { displayName: row.artist.displayName } : {}),
      ...(row.artist.akaNames ? { akaNames: row.artist.akaNames } : {}),
      ...(row.artist.bornOn ? { bornOn: toIsoDate(row.artist.bornOn) } : {}),
    };
    return {
      artistId: row.artistId,
      name: deriveArtistDisplayName(row.artist),
      role: row.role === 'PRIMARY' ? ('primary' as const) : ('featured' as const),
      ...(Object.keys(known).length > 0 ? { known } : {}),
    };
  });

const storedSourcesSchema = z.array(videoSuggestionSourceSchema);

/** Map a stored suggestion row onto the wire shape (null = malformed row). */
const toStatusSuggestion = (
  row: VideoEnrichmentSuggestionRecord
): VideoEnrichmentStatusResult['suggestions'][number] | null => {
  if (!(VIDEO_SUGGESTION_FIELDS as readonly string[]).includes(row.field)) return null;
  if (!(SUGGESTION_CONFIDENCES as readonly string[]).includes(row.confidence)) return null;
  if (!['pending', 'applied', 'dismissed'].includes(row.status)) return null;
  const sources = storedSourcesSchema.safeParse(row.sources);
  return {
    id: row.id,
    artistId: row.artistId,
    field: row.field as VideoSuggestionField,
    value: row.value,
    confidence: row.confidence as SuggestionConfidence,
    sources: sources.success ? sources.data : [],
    note: row.note,
    status: row.status as 'pending' | 'applied' | 'dismissed',
  };
};

/** Map a join row onto the wire artist shape with day-precision bornOn. */
const toStatusArtist = (
  row: VideoArtistWithArtist
): VideoEnrichmentStatusResult['artists'][number] => ({
  artistId: row.artistId,
  displayName: deriveArtistDisplayName(row.artist),
  role: row.role,
  current: {
    firstName: row.artist.firstName,
    middleName: row.artist.middleName,
    surname: row.artist.surname,
    akaNames: row.artist.akaNames,
    displayName: row.artist.displayName,
    bornOn: toIsoDate(row.artist.bornOn) ?? null,
  },
});

// ---------------------------------------------------------------------------
// Suggestion filtering (callback persistence)
// ---------------------------------------------------------------------------

/** Day-precision normalization for date-valued strings. */
const normalizeDay = (value: string): string => value.trim().slice(0, 10);

/** Case-insensitive trim normalization for text-valued strings. */
const normalizeText = (value: string): string => value.trim().toLowerCase();

/** The artist's current value for a suggestion field (null when unset). */
const currentValueFor = (
  field: VideoSuggestionField,
  current: VideoArtistWithArtist['artist']
): string | null => {
  switch (field) {
    case 'firstName':
      return current.firstName;
    case 'middleName':
      return current.middleName;
    case 'surname':
      return current.surname;
    case 'akaNames':
      return current.akaNames;
    case 'displayName':
      return current.displayName;
    case 'bornOn':
      return toIsoDate(current.bornOn) ?? null;
    default:
      return null;
  }
};

/** True when the suggested value equals the current one (case-insensitive; day precision for dates). */
const equalsCurrent = (
  field: VideoSuggestionField,
  value: string,
  current: VideoArtistWithArtist['artist']
): boolean => {
  const cur = currentValueFor(field, current);
  if (cur === null) return false;
  return field === 'bornOn'
    ? normalizeDay(cur) === normalizeDay(value)
    : normalizeText(cur) === normalizeText(value);
};

/** One applied/dismissed fact from a previous run. */
type ExistingFact = { artistId: string | null; field: string; value: string };

/** True when an identical fact was already applied or dismissed (re-run fence). */
const matchesExistingFact = (
  facts: ExistingFact[],
  artistId: string | null,
  field: string,
  value: string
): boolean =>
  facts.some(
    (fact) =>
      fact.artistId === artistId &&
      fact.field === field &&
      normalizeText(fact.value) === normalizeText(value)
  );

/**
 * Merge incoming aliases into the existing comma list, deduped
 * case-insensitively with the existing entries first — so applying the
 * suggestion replaces the field wholesale without losing current aliases.
 */
const mergeAkaNames = (existing: string | null, incoming: string): string => {
  const parts = [existing ?? '', incoming]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(part);
  }
  return merged.join(', ');
};

/** JSON-safe copy of a suggestion's sources for the Json column. */
const toJsonSources = (sources: VideoSuggestion['sources']): Json =>
  sources.map(({ url, label }) => (label === undefined ? { url } : { url, label }));

/** Prepare one artist suggestion for persistence, or null when filtered out. */
const prepareSuggestion = (
  suggestion: VideoSuggestion,
  current: VideoArtistWithArtist['artist']
): Omit<CreateSuggestionRow, 'artistId'> | null => {
  // Video-level fields (releasedOn/description/featuredArtist) are emitted only
  // under `data.video`; ignore any that arrive misfiled at artist scope.
  if ((VIDEO_LEVEL_SUGGESTION_FIELDS as readonly string[]).includes(suggestion.field)) return null;
  const value =
    suggestion.field === 'akaNames'
      ? mergeAkaNames(current.akaNames, suggestion.value)
      : suggestion.value.trim();
  if (!value) return null;
  if (equalsCurrent(suggestion.field, value, current)) return null;
  return {
    field: suggestion.field,
    value,
    confidence: suggestion.confidence,
    sources: toJsonSources(suggestion.sources),
    note: suggestion.note ?? null,
  };
};

/** Grouped inputs for {@link buildPendingRows} (stays under max-params). */
interface BuildPendingRowsInput {
  data: VideoEnrichmentData;
  state: VideoEnrichmentState;
  rows: VideoArtistWithArtist[];
  facts: ExistingFact[];
}

/** Collect one artist's surviving (filtered + un-fenced) suggestion rows. */
const collectArtistRows = (
  artist: VideoEnrichmentData['artists'][number],
  current: VideoArtistWithArtist['artist'],
  facts: ExistingFact[]
): CreateSuggestionRow[] => {
  const rows: CreateSuggestionRow[] = [];
  for (const suggestion of artist.suggestions) {
    const prepared = prepareSuggestion(suggestion, current);
    if (!prepared) continue;
    if (matchesExistingFact(facts, artist.artistId, prepared.field, prepared.value)) continue;
    rows.push({ artistId: artist.artistId, ...prepared });
  }
  return rows;
};

/**
 * Build the video-level release-date row when the Lambda's date differs (day
 * precision) from the admin-entered date and it was not already applied or
 * dismissed. Returns null when there is nothing to suggest.
 */
/** The release day a Lambda value names, or null when it is not a calendar day. */
const suggestedReleaseDay = (value: string): ReleaseDay | null => {
  const day = normalizeDay(value);
  return isReleaseDay(day) ? day : null;
};

const buildReleaseDateRow = (
  data: VideoEnrichmentData,
  state: VideoEnrichmentState,
  facts: ExistingFact[]
): CreateSuggestionRow | null => {
  const releasedOn = data.video?.releasedOn;
  if (!releasedOn) return null;
  const day = suggestedReleaseDay(releasedOn.value);
  if (day === null || day === releaseDayFromStored(state.releasedOn)) return null;
  if (matchesExistingFact(facts, null, 'releasedOn', releasedOn.value)) return null;
  return {
    artistId: null,
    field: 'releasedOn',
    value: day,
    confidence: releasedOn.confidence,
    sources: toJsonSources(releasedOn.sources),
    note: releasedOn.note ?? null,
  };
};

/** Video-level description row — skipped when it matches the stored text. */
const buildDescriptionRow = (
  data: VideoEnrichmentData,
  state: VideoEnrichmentState,
  facts: ExistingFact[]
): CreateSuggestionRow | null => {
  const description = data.video?.description;
  if (!description) return null;
  const value = description.value.trim();
  if (!value) return null;
  if (state.description && normalizeText(state.description) === normalizeText(value)) return null;
  if (matchesExistingFact(facts, null, 'description', value)) return null;
  return {
    artistId: null,
    field: 'description',
    value,
    confidence: description.confidence,
    sources: toJsonSources(description.sources),
    note: description.note ?? null,
  };
};

/** Names already represented on the video (linked rows + artist string parts). */
const knownArtistNames = (
  state: VideoEnrichmentState,
  rows: VideoArtistWithArtist[]
): Set<string> =>
  new Set([
    ...rows.map((row) => deriveArtistDisplayName(row.artist).toLowerCase()),
    ...splitFeaturedArtists(state.artist).map((part) => part.name.toLowerCase()),
  ]);

/** Featured-artist discovery rows: deduped, fence-checked, never already linked. */
const buildFeaturedArtistRows = ({
  data,
  state,
  rows,
  facts,
}: BuildPendingRowsInput): CreateSuggestionRow[] => {
  const featured = data.video?.featuredArtists ?? [];
  if (featured.length === 0) return [];
  const known = knownArtistNames(state, rows);
  const seen = new Set<string>();
  const out: CreateSuggestionRow[] = [];
  for (const suggestion of featured) {
    const value = suggestion.value.trim();
    const key = value.toLowerCase();
    if (!value || known.has(key) || seen.has(key)) continue;
    if (matchesExistingFact(facts, null, 'featuredArtist', value)) continue;
    seen.add(key);
    out.push({
      artistId: null,
      field: 'featuredArtist',
      value,
      confidence: suggestion.confidence,
      sources: toJsonSources(suggestion.sources),
      note: suggestion.note ?? null,
    });
  }
  return out;
};

/** The video-level row for `field`, if the batch carries one. */
const videoLevelRow = (pending: CreateSuggestionRow[], field: string): CreateSuggestionRow | null =>
  pending.find((row) => row.artistId === null && row.field === field) ?? null;

/**
 * Split out of the pending batch the rows the editorial rules let the
 * callback apply by itself — an empty release date takes the offered day
 * (never today's), a blank description takes the synthesized prose — and
 * keep the rest pending for review (ADR-0004, ADR-0005).
 */
const takeAutoApplied = (
  state: VideoEnrichmentState,
  pending: CreateSuggestionRow[],
  now: Date
): { autoApplied: CreateSuggestionRow[]; remaining: CreateSuggestionRow[] } => {
  const releaseRow = videoLevelRow(pending, 'releasedOn');
  const descriptionRow = videoLevelRow(pending, 'description');
  const decision = decideEnrichmentAutoApply({
    state: { releasedOn: releaseDayFromStored(state.releasedOn), description: state.description },
    offered: {
      releasedOn: releaseRow ? suggestedReleaseDay(releaseRow.value) : null,
      description: descriptionRow?.value ?? null,
    },
    today: todayUtcIsoDate(now),
  });
  const autoApplied = [
    ...(decision.releasedOn !== null && releaseRow ? [releaseRow] : []),
    ...(decision.description !== null && descriptionRow ? [descriptionRow] : []),
  ];
  return { autoApplied, remaining: pending.filter((row) => !autoApplied.includes(row)) };
};

/** The row's value as the field's stored type. */
const toAppliedUpdate = (row: CreateSuggestionRow): UpdateVideoData =>
  row.field === 'releasedOn'
    ? { releasedOn: new Date(`${row.value}T00:00:00.000Z`) }
    : { description: row.value };

/**
 * Convert the Lambda's validated payload into pending suggestion rows:
 * drop facts equal to current values, fence facts already applied/dismissed,
 * pre-merge akaNames, and emit the video-level release date only when it
 * differs (day precision) from the admin-entered date.
 */
const buildPendingRows = ({
  data,
  state,
  rows,
  facts,
}: BuildPendingRowsInput): CreateSuggestionRow[] => {
  const byArtistId = new Map(rows.map((row) => [row.artistId, row.artist]));
  const out: CreateSuggestionRow[] = [];
  for (const artist of data.artists) {
    const current = byArtistId.get(artist.artistId);
    if (!current) continue; // detached since dispatch
    out.push(...collectArtistRows(artist, current, facts));
  }
  const releaseRow = buildReleaseDateRow(data, state, facts);
  if (releaseRow) out.push(releaseRow);
  const descriptionRow = buildDescriptionRow(data, state, facts);
  if (descriptionRow) out.push(descriptionRow);
  out.push(...buildFeaturedArtistRows({ data, state, rows, facts }));
  return out;
};

// ---------------------------------------------------------------------------
// The job adapter
// ---------------------------------------------------------------------------

/** Actionable copy per failing part of the eligibility rule. */
const ineligibleCopyFor = (reason: EnrichmentIneligibilityReason): string => {
  switch (reason) {
    case 'artist':
      return 'Add an artist or creator and save before running enrichment.';
    default: {
      // Unreachable while every reason has a case above; a new reason added
      // to the union stops compiling here.
      const unhandled: never = reason;
      return unhandled;
    }
  }
};

/** The invoke payload without the runner's dispatch fields. */
type VideoEnrichmentRequest = Omit<VideoEnrichmentLambdaInput, keyof JobDispatch>;

/**
 * Reads the video and its linked artists and assembles the Lambda request.
 * Returns a typed error when the video is gone or no artist is linked.
 */
const prepareEnrichment = async (
  videoId: string
): Promise<{ ok: true; request: VideoEnrichmentRequest } | { ok: false; error: string }> => {
  const state = await VideoRepository.getEnrichmentState(videoId);
  if (!state) return { ok: false, error: 'Video not found.' };
  const rows = await VideoArtistRepository.findByVideoId(videoId);
  if (rows.length === 0) return { ok: false, error: 'No linked artists to enrich.' };

  return {
    ok: true,
    request: {
      task: 'video-enrichment',
      videoId: state.id,
      title: state.title,
      artistDisplay: state.artist,
      category: state.category,
      releasedOn: releaseDayFromStored(state.releasedOn) ?? undefined,
      artists: toLambdaArtists(rows),
    },
  };
};

/**
 * Completes an ok result: filters, fences and merges the suggestions (see
 * {@link buildPendingRows}), replaces the pending rows, and applies by itself
 * what the editorial rules allow (see {@link takeAutoApplied}). A video gone
 * since dispatch persists nothing.
 */
const persistEnrichment = async (videoId: string, data: VideoEnrichmentData): Promise<void> => {
  const state = await VideoRepository.getEnrichmentState(videoId);
  if (!state) return;
  const rows = await VideoArtistRepository.findByVideoId(videoId);
  const facts = await VideoEnrichmentSuggestionRepository.findExistingFacts(videoId);
  const pending = buildPendingRows({ data, state, rows, facts });
  const { autoApplied, remaining } = takeAutoApplied(state, pending, new Date());
  await VideoEnrichmentSuggestionRepository.replacePending(videoId, remaining);
  for (const row of autoApplied) {
    await VideoRepository.update(videoId, toAppliedUpdate(row));
    await VideoEnrichmentSuggestionRepository.createApplied(videoId, row);
  }
};

/** The video enrichment job's types (see the job runner). */
interface VideoEnrichmentJobTypes extends JobTypes {
  record: VideoEnrichmentState;
  /** A run takes nothing from its trigger: it reads the video and its artists. */
  input: undefined;
  request: VideoEnrichmentRequest;
  data: VideoEnrichmentData;
  /** Nothing to hand on: the callback revalidates no page. */
  claim: Record<string, never>;
  persisted: void;
  checkpoint: Omit<VideoEnrichmentProgressPost, 'jobToken'>;
  progress: VideoEnrichmentProgress;
}

/**
 * Fake-path dwell between the checkpoint and the callback. The real Lambda
 * takes seconds; the fixture is instantaneous, so without a pause the 2.5s
 * status poll can never observe the in-flight (`Enriching…`) chip — worst on
 * a re-run whose start and end are both `succeeded`.
 */
const FAKE_ENRICHMENT_DELAY_MS = 4000;

/**
 * The video enrichment job, as the job runner sees it: the video's
 * `enrichment*` lifecycle columns, the enrichment callback and progress
 * routes, the eligibility rule, the Lambda request, and the suggestion
 * persistence.
 */
export const videoEnrichmentJob: JobAdapter<VideoEnrichmentJobTypes> = {
  kind: 'video-enrichment',
  copy: {
    notFound: 'Video not found.',
    noCallbackUrl: 'Video enrichment callback URL is not configured',
    notConfigured: 'Video enrichment is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    unreachable: 'Failed to reach the enrichment generator',
    runFailed: 'Video enrichment failed unexpectedly.',
    persistFailed: 'Video enrichment persistence failed.',
  },
  callbackPath: (videoId) => `/api/videos/${videoId}/enrichment/callback`,
  progress: {
    path: (videoId) => `/api/videos/${videoId}/enrichment/progress`,
    schema: videoEnrichmentProgressSchema,
    write: (videoId, progress) => VideoRepository.setEnrichmentProgress(videoId, progress),
  },
  // The first stage the real Lambda posts for the category — `web-search`
  // for INFORMATIONAL, which skips the music lookups — then the category's
  // fixture for the artists the payload carries.
  fake: {
    delayMs: FAKE_ENRICHMENT_DELAY_MS,
    checkpoint: ({ category, artists }) => ({
      stage: category === 'INFORMATIONAL' ? 'web-search' : 'musicbrainz',
      counts: { artists: artists.length },
    }),
    result: ({ artists, category, title }) => ({
      ok: true,
      data: videoEnrichmentFixture({
        artists: artists.map(({ artistId }) => ({ artistId })),
        category,
        title,
      }),
    }),
  },

  read: (videoId) => VideoRepository.getEnrichmentState(videoId),
  state: ({
    enrichmentStatus,
    enrichmentStartedAt,
    enrichmentError,
    enrichmentJobToken,
    enrichmentProgress,
  }) => ({
    status: enrichmentStatus,
    startedAt: enrichmentStartedAt,
    error: enrichmentError ?? null,
    jobToken: enrichmentJobToken,
    progress: enrichmentProgress,
  }),
  claimContext: () => ({}),
  // A video whose persisted artist is blank (see `isEnrichmentEligible`) is
  // refused before any status write, so it is never stranded at `pending`.
  refusal: (state) => {
    const reason = enrichmentIneligibilityReason(state);
    return reason ? ineligibleCopyFor(reason) : null;
  },

  // The repository stamps the start itself on every in-flight write.
  markPending: (videoId) => VideoRepository.setEnrichmentStatus(videoId, 'pending'),
  begin: (videoId, now) => VideoRepository.beginEnrichmentRun(videoId, now),
  setToken: (videoId, token) => VideoRepository.setEnrichmentJobToken(videoId, token),
  claimToken: (videoId, token) => VideoRepository.claimEnrichmentJobToken(videoId, token),
  recordFailed: (videoId, error) =>
    VideoRepository.setEnrichmentStatus(videoId, 'failed', { error }),
  recordSucceeded: (videoId) =>
    VideoRepository.setEnrichmentStatus(videoId, 'succeeded', { error: null }),

  prepare: (videoId) => prepareEnrichment(videoId),
  persist: (videoId, data) => persistEnrichment(videoId, data),
};

/**
 * Service boundary for async video-metadata enrichment: the artist sync and
 * the polled status read. The job itself runs through the job runner with
 * {@link videoEnrichmentJob}, like every other background job.
 */
export class VideoEnrichmentService {
  /**
   * Split the admin-entered artist string on feat.-markers, find-or-create an
   * Artist shell per name (best-effort — a failed shell is logged and
   * skipped), replace the video's join rows, and drop pending suggestions for
   * artists the re-sync detached (applied/dismissed rows survive as audit).
   *
   * When `artistDetails` is provided, each detail is matched to an artist part
   * by lowercased trimmed `sourceName`. Stale details (whose sourceName is no
   * longer present in the artist string) are simply never forwarded — no
   * explicit filtering is needed.
   */
  static async syncVideoArtists(
    videoId: string,
    artistString: string,
    artistDetails?: VideoArtistDetail[]
  ): Promise<void> {
    const parts = splitFeaturedArtists(artistString);
    const detailMap = new Map<string, VideoArtistDetail>(
      (artistDetails ?? []).map((detail) => [detail.sourceName.trim().toLowerCase(), detail])
    );
    const previous = await VideoArtistRepository.findByVideoId(videoId);
    const rows: Array<{ artistId: string; role: 'PRIMARY' | 'FEATURED'; sortOrder: number }> = [];
    for (const part of parts) {
      try {
        const details = detailMap.get(part.name.trim().toLowerCase());
        const found = await ArtistService.findOrCreateByName(part.name, details);
        if (!found.success) {
          logger.warn('video_artist_shell_failed', {
            videoId,
            name: part.name,
            error: found.error,
          });
          continue;
        }
        if (rows.some((row) => row.artistId === found.data.id)) continue;
        rows.push({
          artistId: found.data.id,
          role: part.role === 'primary' ? 'PRIMARY' : 'FEATURED',
          sortOrder: rows.length,
        });
      } catch (error) {
        logger.warn('video_artist_shell_failed', {
          videoId,
          name: part.name,
          error: String(error),
        });
      }
    }
    await VideoArtistRepository.replaceForVideo(videoId, rows);
    const kept = new Set(rows.map((row) => row.artistId));
    const detached = previous.map((row) => row.artistId).filter((artistId) => !kept.has(artistId));
    await VideoEnrichmentSuggestionRepository.deletePendingForArtists(videoId, detached);
  }

  /**
   * Runs enrichment as a background job through the job runner. Never throws
   * — it runs via `after()`.
   */
  static async runEnrichmentJob(videoId: string): Promise<void> {
    await jobRunner.run(videoEnrichmentJob, videoId, undefined);
  }

  /**
   * Read the polled enrichment status: 17-minute read-time stale coercion
   * (mirrors the bio pipeline — non-persistent, a late callback can still
   * claim), fresh artist current values, and all suggestion rows. Returns
   * null when the video does not exist.
   */
  static async getEnrichmentStatus(videoId: string): Promise<VideoEnrichmentStatusResult | null> {
    const state = await VideoRepository.getEnrichmentState(videoId);
    if (!state) return null;
    const rows = await VideoArtistRepository.findByVideoId(videoId);
    const stored = await VideoEnrichmentSuggestionRepository.findByVideoId(videoId);

    const { status, error, progress } = jobRunner.view(videoEnrichmentJob, state);

    return {
      status,
      error,
      progress,
      enrichedAt: state.enrichedAt ? state.enrichedAt.toISOString() : null,
      currentReleasedOn: releaseDayFromStored(state.releasedOn) ?? '',
      artists: rows.map(toStatusArtist),
      suggestions: stored
        .map(toStatusSuggestion)
        .filter((row): row is VideoEnrichmentStatusResult['suggestions'][number] => row !== null),
    };
  }
}
