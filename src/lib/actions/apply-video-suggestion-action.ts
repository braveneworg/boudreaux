/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';

import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
import type { VideoArtistWithArtist } from '@/lib/repositories/video-artist-repository';
import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
import { ArtistService, type ArtistEnrichedField } from '@/lib/services/artist-service';
import type { VideoEnrichmentSuggestionRecord } from '@/lib/types/domain/video-enrichment';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import {
  applyVideoSuggestionInputSchema,
  type ApplyVideoSuggestionActionResult,
} from '@/lib/validation/video-enrichment-schema';
import { logSecurityEvent } from '@/utils/audit-log';

const logger = loggers.media;

const ALREADY_RESOLVED: ApplyVideoSuggestionActionResult = {
  success: false,
  error: 'Suggestion was already resolved.',
};

const CURRENT_DRIFTED: ApplyVideoSuggestionActionResult = {
  success: false,
  error: 'The current value has changed — review before applying.',
};

const INVALID_DATE: ApplyVideoSuggestionActionResult = {
  success: false,
  error: 'Suggested value is not a valid date.',
};

/** The artist fields the server may apply (releasedOn stays client-side). */
const ARTIST_FIELDS: readonly ArtistEnrichedField[] = [
  'firstName',
  'middleName',
  'surname',
  'akaNames',
  'displayName',
  'bornOn',
];

/** The applyable fields whose value is written as a Prisma `DateTime`. */
const DATE_FIELDS: readonly ArtistEnrichedField[] = ['bornOn'];

/** Strict `YYYY-MM-DD` shape gate (day-precision, zero-padded). */
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Real-calendar validity for a day-precision date string. A regex alone is
 * insufficient (it accepts `2020-13-45` / `2021-02-30`), so the parsed UTC
 * components must round-trip back to the input: impossible months/days
 * overflow into another month and fail the equality check.
 */
const isRealCalendarDate = (value: string): boolean => {
  if (!YYYY_MM_DD.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

/** Narrow a stored suggestion field to the applyable whitelist, or null. */
const toArtistField = (field: string): ArtistEnrichedField | null =>
  (ARTIST_FIELDS as readonly string[]).includes(field) ? (field as ArtistEnrichedField) : null;

/** Trim a nullable string, collapsing empty/whitespace-only values to null. */
const blankToNull = (value: string | null): string | null => value?.trim() || null;

/** The artist's raw stored text value for a non-date field. */
const rawTextValue = (
  field: Exclude<ArtistEnrichedField, 'bornOn'>,
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
  }
};

/** The artist's current value for a field, normalized for comparison
 *  (dates → YYYY-MM-DD, strings trimmed; null when unset/blank). */
const normalizedCurrentValue = (
  field: ArtistEnrichedField,
  current: VideoArtistWithArtist['artist']
): string | null =>
  field === 'bornOn'
    ? (current.bornOn?.toISOString().slice(0, 10) ?? null)
    : blankToNull(rawTextValue(field, current));

/**
 * Optimistic-concurrency check: with `expectedCurrent` provided (null =
 * "field was empty"), the normalized current value must still match; when
 * omitted (undefined), the check is skipped.
 */
const hasCurrentDrift = (
  field: ArtistEnrichedField,
  current: VideoArtistWithArtist['artist'],
  expectedCurrent: string | null | undefined
): boolean => {
  if (expectedCurrent === undefined) return false;
  const actual = normalizedCurrentValue(field, current);
  const expected = expectedCurrent === null ? null : expectedCurrent.trim() || null;
  return actual !== expected;
};

const revalidateSuggestionPaths = (): void => {
  revalidatePath('/admin/videos');
  revalidatePath('/admin/artists');
};

const dismissSuggestion = async (
  suggestionId: string,
  userId: string
): Promise<ApplyVideoSuggestionActionResult> => {
  const dismissed = await VideoEnrichmentSuggestionRepository.markDismissed(suggestionId);
  if (!dismissed) return ALREADY_RESOLVED;
  logSecurityEvent({
    event: 'media.video.updated',
    userId,
    metadata: { suggestionId, action: 'enrichment-suggestion-dismissed' },
  });
  revalidateSuggestionPaths();
  return { success: true, op: 'dismiss' };
};

/** Load + gate the pending suggestion, its whitelist field, and artist id. */
const loadApplicableSuggestion = async (
  suggestionId: string
): Promise<
  | {
      ok: true;
      suggestion: VideoEnrichmentSuggestionRecord;
      field: ArtistEnrichedField;
      artistId: string;
    }
  | { ok: false; result: ApplyVideoSuggestionActionResult }
> => {
  const suggestion = await VideoEnrichmentSuggestionRepository.findById(suggestionId);
  if (!suggestion || suggestion.status !== 'pending') {
    return { ok: false, result: ALREADY_RESOLVED };
  }
  if (suggestion.field === 'releasedOn') {
    return {
      ok: false,
      result: {
        success: false,
        error: 'The release date applies in the edit form, not on the server.',
      },
    };
  }
  const field = toArtistField(suggestion.field);
  const { artistId } = suggestion;
  if (!field || !artistId) {
    return { ok: false, result: { success: false, error: 'Unsupported suggestion field.' } };
  }
  // Date-valued fields are written as Prisma `DateTime`; validate strict
  // real-calendar validity BEFORE any write so `2020-13-45` / `2021-02-30`
  // never reach the database (the wire schema is field-agnostic string).
  if (DATE_FIELDS.includes(field) && !isRealCalendarDate(suggestion.value)) {
    return { ok: false, result: INVALID_DATE };
  }
  return { ok: true, suggestion, field, artistId };
};

const applySuggestion = async (
  suggestionId: string,
  expectedCurrent: string | null | undefined,
  userId: string
): Promise<ApplyVideoSuggestionActionResult> => {
  const loaded = await loadApplicableSuggestion(suggestionId);
  if (!loaded.ok) return loaded.result;
  const { suggestion, field, artistId } = loaded;

  const rows = await VideoArtistRepository.findByVideoId(suggestion.videoId);
  const current = rows.find((row) => row.artistId === artistId)?.artist;
  if (!current) {
    return { success: false, error: 'Artist is no longer linked to this video.' };
  }
  if (hasCurrentDrift(field, current, expectedCurrent)) {
    return CURRENT_DRIFTED;
  }

  await ArtistService.applyEnrichedField(artistId, field, suggestion.value, userId);
  const applied = await VideoEnrichmentSuggestionRepository.markApplied(suggestionId, userId);
  if (!applied) return ALREADY_RESOLVED;

  logSecurityEvent({
    event: 'media.artist.updated',
    userId,
    metadata: {
      artistId,
      videoId: suggestion.videoId,
      field,
      action: 'enrichment-suggestion-applied',
    },
  });
  revalidateSuggestionPaths();
  return { success: true, op: 'apply' };
};

/**
 * Applies or dismisses one enrichment suggestion. Admin-only. Applies go
 * through the artist field whitelist with an `expectedCurrent`
 * optimistic-concurrency guard; the video-level release date is never
 * server-applied (it flows into the RHF edit form instead, because a
 * `videos.detail` refetch would wipe dirty edits).
 *
 * @param input - `{ suggestionId, op, expectedCurrent? }` (Zod-validated).
 */
export const applyVideoSuggestionAction = async (
  input: unknown
): Promise<ApplyVideoSuggestionActionResult> => {
  const session = await requireRole('admin');

  const parsed = applyVideoSuggestionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid suggestion request.' };
  }
  const { suggestionId, op, expectedCurrent } = parsed.data;

  try {
    return op === 'dismiss'
      ? await dismissSuggestion(suggestionId, session.user.id)
      : await applySuggestion(suggestionId, expectedCurrent, session.user.id);
  } catch (error) {
    logger.error('Unexpected error applying video suggestion', {
      suggestionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Suggestion update failed. Please try again.' };
  }
};
