/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Pure extractor that pulls admin-form prefill values out of a raw ffprobe
 * JSON document. Safe for client-side import — no `server-only`.
 */

export interface ProbePrefillTags {
  title: string | null;
  artist: string | null;
  /** YYYY-MM-DD — from the `date` tag ONLY; never from encode-time stamps. */
  releasedOn: string | null;
  /** From `comment` tag, falling back to `description`. */
  description: string | null;
  /** `format.duration` parsed, rounded, must be > 0. */
  durationSeconds: number | null;
}

// ── Private guards (same pattern as normalize.ts, kept decoupled) ──────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

// ── Tag helpers ───────────────────────────────────────────────────────────

/**
 * Build a lowercased-key view of a tags object so lookups are case-insensitive.
 * Matroska emits TITLE/ARTIST/DATE; MP4 emits lowercase.
 */
const lowercaseTags = (tags: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tags)) {
    result[key.toLowerCase()] = value;
  }
  return result;
};

// ── Field parsers ─────────────────────────────────────────────────────────

/**
 * Parse an ISO or bare-year date string to YYYY-MM-DD, else null.
 * "2019" → "2019-01-01"; "2019-08-01" → "2019-08-01"; "not-a-date" → null.
 */
const parseReleasedOn = (value: string | null): string | null => {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

/**
 * Parse ffprobe's duration string ("245.000000") to a rounded positive integer.
 * Zero, negative, non-finite, or non-numeric input → null.
 */
const parseDuration = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? parseFloat(value) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
};

// ── Main extractor ────────────────────────────────────────────────────────

/**
 * Extract admin-form prefill values from a raw ffprobe JSON document.
 * Fully defensive: any shape surprise degrades to null; never throws.
 */
export const extractProbePrefillTags = (raw: unknown): ProbePrefillTags => {
  const NULL_RESULT: ProbePrefillTags = {
    title: null,
    artist: null,
    releasedOn: null,
    description: null,
    durationSeconds: null,
  };

  if (!isRecord(raw)) return NULL_RESULT;

  const format = isRecord(raw.format) ? raw.format : null;
  if (format === null) return NULL_RESULT;

  const rawTags = isRecord(format.tags) ? format.tags : null;
  const tags = rawTags !== null ? lowercaseTags(rawTags) : {};

  const { title: t, artist: a, album_artist: aa, date: d, comment: c, description: desc } = tags;
  const title = asString(t);
  const artist = asString(a) ?? asString(aa);
  const releasedOn = parseReleasedOn(asString(d));
  const description = asString(c) ?? asString(desc);
  const durationSeconds = parseDuration(format.duration);

  return { title, artist, releasedOn, description, durationSeconds };
};
