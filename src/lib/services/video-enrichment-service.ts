/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { randomUUID, timingSafeEqual } from 'node:crypto';

import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { z } from 'zod';

import {
  VideoArtistRepository,
  type VideoArtistWithArtist,
} from '@/lib/repositories/video-artist-repository';
import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
import { VideoRepository } from '@/lib/repositories/video-repository';
import { ArtistService } from '@/lib/services/artist-service';
import type { Json } from '@/lib/types/domain/shared';
import type {
  CreateSuggestionRow,
  VideoEnrichmentState,
  VideoEnrichmentSuggestionRecord,
} from '@/lib/types/domain/video-enrichment';
import { resolveEnrichmentBaseUrl } from '@/lib/utils/enrichment-base-url';
import { loggers } from '@/lib/utils/logger';
import {
  ENRICHMENT_STATUSES,
  isInFlightEnrichmentStatus,
  STALE_JOB_MS,
  SUGGESTION_CONFIDENCES,
  VIDEO_SUGGESTION_FIELDS,
  videoEnrichmentProgressSchema,
  videoSuggestionSourceSchema,
  type EnrichmentStatus,
  type SuggestionConfidence,
  type VideoEnrichmentData,
  type VideoEnrichmentProgress,
  type VideoEnrichmentResult,
  type VideoEnrichmentStatusResult,
  type VideoProgressStage,
  type VideoSuggestion,
  type VideoSuggestionField,
} from '@/lib/validation/video-enrichment-schema';
import { splitFeaturedArtists } from '@/utils/artist-name-split';

import { videoEnrichmentFixture } from './video-enrichment-fixture';

const logger = loggers.media;

let lambdaClient: LambdaClient | null = null;

/** Short timeout: the Event invoke returns 202 immediately (see bio service). */
const INVOKE_REQUEST_TIMEOUT_MS = 30 * 1000;

/** Error the status read attaches when coercing a stale in-flight job. */
const STALE_JOB_ERROR = 'Video enrichment timed out. Please try again.';

/** Hard cap mirrored by the Lambda's input schema (`artists: 1..10`). */
const MAX_LAMBDA_ARTISTS = 10;

const getLambdaClient = (): LambdaClient => {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: new NodeHttpHandler({ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }),
    });
  }
  return lambdaClient;
};

/** Invoke payload for the bio-generator Lambda's `video-enrichment` task. */
export interface VideoEnrichmentLambdaInput {
  task: 'video-enrichment';
  videoId: string;
  title: string;
  artistDisplay: string;
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
}

/** YYYY-MM-DD for wire dates, or undefined. */
const toIsoDate = (value: Date | null | undefined): string | undefined =>
  value ? value.toISOString().slice(0, 10) : undefined;

/** Constant-time token comparison (see BioGenerationService.tokensMatch). */
const tokensMatch = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/** The best display name for a linked artist (mirrors the bio derivation). */
const displayNameFor = (row: VideoArtistWithArtist): string =>
  row.artist.displayName?.trim() || `${row.artist.firstName} ${row.artist.surname}`.trim();

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
      name: displayNameFor(row),
      role: row.role === 'PRIMARY' ? ('primary' as const) : ('featured' as const),
      ...(Object.keys(known).length > 0 ? { known } : {}),
    };
  });

/** Narrow a stored status string to the lifecycle union (null when unknown). */
const toEnrichmentStatus = (status: string | null): EnrichmentStatus | null =>
  status && (ENRICHMENT_STATUSES as readonly string[]).includes(status)
    ? (status as EnrichmentStatus)
    : null;

/** True when a fresh (non-stale) job is already processing. */
const isFreshlyProcessing = (state: VideoEnrichmentState): boolean => {
  if (state.enrichmentStatus !== 'processing') return false;
  const startedAt = state.enrichmentStartedAt?.getTime() ?? 0;
  return Date.now() - startedAt <= STALE_JOB_MS;
};

/** Parse a stored progress JSON into the validated shape, or null. */
const parseStoredProgress = (value: Json | null): VideoEnrichmentProgress | null => {
  const parsed = videoEnrichmentProgressSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

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

/** The status/error/progress triple after read-time stale coercion. */
interface StatusView {
  status: EnrichmentStatus | null;
  error: string | null;
  progress: VideoEnrichmentProgress | null;
}

/**
 * Apply the 17-minute read-time stale coercion: an in-flight job older than
 * {@link STALE_JOB_MS} reads as `failed` with a timeout error (non-persistent —
 * a late callback can still claim). Progress surfaces only while in flight.
 */
const resolveStatusView = (state: VideoEnrichmentState): StatusView => {
  const rawStatus = toEnrichmentStatus(state.enrichmentStatus);
  const startedAtMs = state.enrichmentStartedAt?.getTime();
  const isStale =
    isInFlightEnrichmentStatus(rawStatus) &&
    startedAtMs !== undefined &&
    Date.now() - startedAtMs > STALE_JOB_MS;
  const status = isStale ? 'failed' : rawStatus;
  return {
    status,
    error: isStale ? STALE_JOB_ERROR : (state.enrichmentError ?? null),
    progress: isInFlightEnrichmentStatus(status)
      ? parseStoredProgress(state.enrichmentProgress)
      : null,
  };
};

/** Map a join row onto the wire artist shape with day-precision bornOn. */
const toStatusArtist = (
  row: VideoArtistWithArtist
): VideoEnrichmentStatusResult['artists'][number] => ({
  artistId: row.artistId,
  displayName: displayNameFor(row),
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
  if (suggestion.field === 'releasedOn') return null; // video-level only
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
const buildReleaseDateRow = (
  data: VideoEnrichmentData,
  state: VideoEnrichmentState,
  facts: ExistingFact[]
): CreateSuggestionRow | null => {
  const releasedOn = data.video?.releasedOn;
  if (!releasedOn) return null;
  if (normalizeDay(releasedOn.value) === toIsoDate(state.releasedOn)) return null;
  if (matchesExistingFact(facts, null, 'releasedOn', releasedOn.value)) return null;
  return {
    artistId: null,
    field: 'releasedOn',
    value: normalizeDay(releasedOn.value),
    confidence: releasedOn.confidence,
    sources: toJsonSources(releasedOn.sources),
    note: releasedOn.note ?? null,
  };
};

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
  return out;
};

// ---------------------------------------------------------------------------
// Job dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Fake-path dwell between the synthetic `processing` checkpoint and completion.
 * The real Lambda takes seconds; the fake path is otherwise instantaneous, so
 * without a pause the 2.5s status poll can never observe the in-flight
 * (`Enriching…`) chip — worst on a re-run whose start and end are both
 * `succeeded`. Mirrors the bio pipeline and shares its env override
 * (`BIO_GENERATOR_FAKE_DELAY_MS`); unit tests set `0`. Never used on the real path.
 */
const DEFAULT_FAKE_ENRICHMENT_DELAY_MS = 4000;

/** Resolve the fake-path dwell from the env, falling back to the default. */
const resolveFakeDelayMs = (): number => {
  const raw = Number(process.env.BIO_GENERATOR_FAKE_DELAY_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FAKE_ENRICHMENT_DELAY_MS;
};

/** Resolve after `ms`; short-circuits to an already-resolved promise for `ms <= 0`. */
const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/** Fake/E2E path: one synthetic checkpoint, a dwell, then persist the fixture. */
const runFakeEnrichment = async (videoId: string, rows: VideoArtistWithArtist[]): Promise<void> => {
  await VideoRepository.setEnrichmentProgress(videoId, {
    stage: 'musicbrainz',
    counts: { artists: rows.length },
    at: new Date().toISOString(),
  });
  // Dwell while `processing` so the polling client can render the in-flight chip.
  await sleep(resolveFakeDelayMs());
  const data = videoEnrichmentFixture({
    artists: rows.map(({ artistId }) => ({ artistId })),
  });
  await VideoEnrichmentService.completeCallback(videoId, { ok: true, data });
};

/** Real path: mint a token, store it, fire the fire-and-forget Event invoke. */
const dispatchEnrichment = async (
  state: VideoEnrichmentState,
  rows: VideoArtistWithArtist[]
): Promise<void> => {
  const base = resolveEnrichmentBaseUrl();
  if (!base) {
    await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
      error: 'Video enrichment callback URL is not configured',
    });
    return;
  }
  const functionName = process.env.BIO_GENERATOR_LAMBDA_NAME;
  if (!functionName) {
    await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
      error: 'Video enrichment is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    });
    return;
  }
  if (rows.length === 0) {
    await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
      error: 'No linked artists to enrich.',
    });
    return;
  }

  const jobToken = randomUUID();
  await VideoRepository.setEnrichmentJobToken(state.id, jobToken);
  const input: VideoEnrichmentLambdaInput = {
    task: 'video-enrichment',
    videoId: state.id,
    title: state.title,
    artistDisplay: state.artist,
    releasedOn: toIsoDate(state.releasedOn),
    artists: toLambdaArtists(rows),
    callbackUrl: `${base}/api/videos/${state.id}/enrichment/callback`,
    progressUrl: `${base}/api/videos/${state.id}/enrichment/progress`,
    jobToken,
  };
  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(input)),
    });
    await getLambdaClient().send(command);
  } catch (error) {
    logger.error('video_enrichment_invoke_failed', error);
    await VideoRepository.setEnrichmentStatus(state.id, 'failed', {
      error: 'Failed to reach the enrichment generator',
    });
    await VideoRepository.setEnrichmentJobToken(state.id, null);
  }
};

/**
 * Service boundary for async video-metadata enrichment. Clones the proven
 * artist-bio pipeline: fire-and-forget Lambda `Event` invoke, single-use
 * per-job token, token-guarded callback/progress channels, and read-time
 * stale-job coercion. In E2E/local dev (`BIO_GENERATOR_FAKE=true`) the run
 * completes in-process from a deterministic fixture.
 */
export class VideoEnrichmentService {
  /**
   * Split the admin-entered artist string on feat.-markers, find-or-create an
   * Artist shell per name (best-effort — a failed shell is logged and
   * skipped), replace the video's join rows, and drop pending suggestions for
   * artists the re-sync detached (applied/dismissed rows survive as audit).
   */
  static async syncVideoArtists(videoId: string, artistString: string): Promise<void> {
    const parts = splitFeaturedArtists(artistString);
    const previous = await VideoArtistRepository.findByVideoId(videoId);
    const rows: Array<{ artistId: string; role: 'PRIMARY' | 'FEATURED'; sortOrder: number }> = [];
    for (const part of parts) {
      try {
        const found = await ArtistService.findOrCreateByName(part.name);
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
   * Run enrichment as a background job. MUSIC-only (others return silently);
   * refuses to double-dispatch while a non-stale job is already `processing`
   * (a `pending` handoff from the trigger action proceeds). The fake/E2E path
   * finishes in-process; the real path fires an Event invoke and leaves the
   * video `processing` for the callback to complete. Never throws — it runs
   * via `after()`, where an unhandled rejection would be lost.
   */
  static async runEnrichmentJob(videoId: string): Promise<void> {
    try {
      const state = await VideoRepository.getEnrichmentState(videoId);
      if (!state || state.category !== 'MUSIC' || isFreshlyProcessing(state)) return;

      await VideoRepository.setEnrichmentStatus(videoId, 'processing', { error: null });
      const rows = await VideoArtistRepository.findByVideoId(videoId);

      if (process.env.BIO_GENERATOR_FAKE === 'true') {
        await runFakeEnrichment(videoId, rows);
        return;
      }
      await dispatchEnrichment(state, rows);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Video enrichment failed unexpectedly.';
      await VideoRepository.setEnrichmentStatus(videoId, 'failed', { error: message });
    }
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

    const { status, error, progress } = resolveStatusView(state);

    return {
      status,
      error,
      progress,
      enrichedAt: state.enrichedAt ? state.enrichedAt.toISOString() : null,
      currentReleasedOn: toIsoDate(state.releasedOn) ?? '',
      artists: rows.map(toStatusArtist),
      suggestions: stored
        .map(toStatusSuggestion)
        .filter((row): row is VideoEnrichmentStatusResult['suggestions'][number] => row !== null),
    };
  }

  /**
   * Verify an async completion callback and atomically claim the single-use
   * job token (constant-time compare, then a conditional updateMany that
   * clears the token). Returns false — without touching the token — when the
   * video is missing, the job is not processing, no token is stored, the
   * token mismatches, or another callback already claimed it.
   */
  static async verifyAndClaimCallback(videoId: string, jobToken: string): Promise<boolean> {
    const state = await VideoRepository.getEnrichmentState(videoId);
    if (!state || state.enrichmentStatus !== 'processing' || !state.enrichmentJobToken) {
      return false;
    }
    if (!tokensMatch(state.enrichmentJobToken, jobToken)) {
      return false; // never attempt the claim on a mismatched/forged callback
    }
    return VideoRepository.claimEnrichmentJobToken(videoId, jobToken);
  }

  /**
   * Record a per-stage checkpoint. VERIFIES the per-job token but NEVER
   * claims it (claiming is exclusive to the callback). Writes only while the
   * job is `processing`; the server stamps `at` so the client cannot forge
   * checkpoint times. Errors are logged, never thrown.
   */
  static async recordProgress(
    videoId: string,
    jobToken: string,
    checkpoint: { stage: VideoProgressStage; counts?: Record<string, number> }
  ): Promise<void> {
    try {
      const state = await VideoRepository.getEnrichmentState(videoId);
      if (!state?.enrichmentJobToken) return;
      if (!tokensMatch(state.enrichmentJobToken, jobToken)) return;
      if (state.enrichmentStatus !== 'processing') return;
      await VideoRepository.setEnrichmentProgress(videoId, {
        ...checkpoint,
        at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('video_enrichment_progress_failed', error);
    }
  }

  /**
   * Complete a claimed job: a non-ok result flips to `failed`; an ok result
   * filters/fences/merges the suggestions (see {@link buildPendingRows}),
   * replaces the pending rows, and flips to `succeeded`. Never throws — it
   * runs post-response via `after()`.
   */
  static async completeCallback(videoId: string, result: VideoEnrichmentResult): Promise<void> {
    if (!result.ok) {
      await VideoRepository.setEnrichmentStatus(videoId, 'failed', { error: result.error });
      return;
    }
    try {
      const state = await VideoRepository.getEnrichmentState(videoId);
      if (!state) return;
      const rows = await VideoArtistRepository.findByVideoId(videoId);
      const facts = await VideoEnrichmentSuggestionRepository.findExistingFacts(videoId);
      const pending = buildPendingRows({ data: result.data, state, rows, facts });
      await VideoEnrichmentSuggestionRepository.replacePending(videoId, pending);
      await VideoRepository.setEnrichmentStatus(videoId, 'succeeded', { error: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Video enrichment persistence failed.';
      await VideoRepository.setEnrichmentStatus(videoId, 'failed', { error: message });
    }
  }
}
