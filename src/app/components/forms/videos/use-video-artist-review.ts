/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

import { useDebounce } from '@/hooks/use-debounce';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';
import { splitFeaturedArtists, splitNameCandidates } from '@/utils/artist-name-split';
import { splitArtistNameParts, type ArtistNameParts } from '@/utils/split-artist-name-parts';

import {
  useArtistNameLookupQuery,
  type ArtistNameLookupResponse,
} from '../_hooks/use-artist-name-lookup-query';

// ── Public types ──────────────────────────────────────────────────────────────

/** The match shape from the name-lookup response. */
export type ArtistNameLookupMatch = NonNullable<
  ArtistNameLookupResponse['results'][number]['match']
>;

/** One reviewed-artist entry as the review UI will render it. */
export interface VideoArtistReviewEntry {
  sourceName: string;
  role: 'primary' | 'featured';
  status: 'matched' | 'new';
  match: ArtistNameLookupMatch | null;
  draft: ArtistNameParts | null;
}

export interface UseVideoArtistReviewResult {
  entries: VideoArtistReviewEntry[];
  updateDraft: (sourceName: string, patch: Partial<ArtistNameParts>) => void;
  buildArtistDetails: () => VideoArtistDetail[];
  /** Split candidates for the PRIMARY entry's sourceName; null when it isn't multi-artist. */
  primarySplitParts: string[] | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;
const MAX_ARTIST_DETAILS = 20;
/** Route caps name-lookup at 20 names — >20 returns 400. */
const MAX_LOOKUP_NAMES = 20;

// ── Pure helpers (extracted to keep hook complexity ≤10) ──────────────────────

/** Lowercase-trimmed key for the draft Map. */
const draftKey = (sourceName: string): string => sourceName.trim().toLowerCase();

/** Build one VideoArtistReviewEntry for an unmatched name. */
const buildNewEntry = (
  sourceName: string,
  role: 'primary' | 'featured',
  drafts: Map<string, ArtistNameParts>
): VideoArtistReviewEntry => ({
  sourceName,
  role,
  status: 'new',
  match: null,
  draft: drafts.get(draftKey(sourceName)) ?? splitArtistNameParts(sourceName),
});

/** Build one VideoArtistReviewEntry for a matched name. */
const buildMatchedEntry = (
  sourceName: string,
  role: 'primary' | 'featured',
  match: ArtistNameLookupMatch
): VideoArtistReviewEntry => ({
  sourceName,
  role,
  status: 'matched',
  match,
  draft: null,
});

/** Derive entries from current parsed parts and the lookup query data. */
const deriveEntries = (
  parts: ReturnType<typeof splitFeaturedArtists>,
  queryData: ArtistNameLookupResponse | undefined,
  isSuccess: boolean,
  drafts: Map<string, ArtistNameParts>
): VideoArtistReviewEntry[] => {
  if (!isSuccess || !queryData) return [];

  // The route echoes cleaned names in order — match by position via a shared index.
  // We avoid bracket-notation on the results array by destructuring in a loop.
  let index = 0;
  return parts.map(({ name, role }) => {
    const result = queryData.results.at(index);
    index += 1;
    const match = result?.match ?? null;
    if (match) return buildMatchedEntry(name, role, match);
    return buildNewEntry(name, role, drafts);
  });
};

/** Convert a VideoArtistReviewEntry with status 'new' to a VideoArtistDetail. */
const entryToDetail = (entry: VideoArtistReviewEntry): VideoArtistDetail => {
  const draft = entry.draft ?? splitArtistNameParts(entry.sourceName);
  const detail: VideoArtistDetail = { sourceName: entry.sourceName };

  const firstName = draft.firstName.trim();
  const middleName = draft.middleName.trim();
  const surname = draft.surname.trim();
  const displayName = draft.displayName.trim();

  if (firstName) detail.firstName = firstName;
  if (middleName) detail.middleName = middleName;
  if (surname) detail.surname = surname;
  if (displayName) detail.displayName = displayName;

  return detail;
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Client state machine for the admin video artist-review flow.
 *
 * Debounces the `artist` string by 400ms, parses it into primary + featured
 * names, fires a name-lookup query, then builds per-artist entries with editable
 * draft fields. Draft state lives outside React Hook Form so it survives the
 * `form.reset` that runs on every `videos.detail` refetch.
 *
 * @param artist - The raw artist string from the video metadata field.
 * @returns Entries for the review UI, an `updateDraft` mutator, and
 *   `buildArtistDetails` for the submit payload.
 */
export const useVideoArtistReview = (artist: string): UseVideoArtistReviewResult => {
  const debounced = useDebounce(artist, DEBOUNCE_MS);
  const parts = useMemo(() => splitFeaturedArtists(debounced), [debounced]);
  const names = useMemo(() => parts.map(({ name }) => name), [parts]);

  const { data, isSuccess, isPending, isError } = useArtistNameLookupQuery(
    names.slice(0, MAX_LOOKUP_NAMES)
  );

  const [drafts, setDrafts] = useState<Map<string, ArtistNameParts>>(new Map());

  const entries = useMemo(
    () => (isPending || isError ? [] : deriveEntries(parts, data, isSuccess, drafts)),
    [isPending, isError, data, isSuccess, drafts, parts]
  );

  const primarySplitParts = useMemo(() => {
    const primary = parts.find((part) => part.role === 'primary') ?? null;
    const candidates = primary ? splitNameCandidates(primary.name) : [];
    return candidates.length > 1 ? candidates : null;
  }, [parts]);

  const updateDraft = useCallback((sourceName: string, patch: Partial<ArtistNameParts>): void => {
    const key = draftKey(sourceName);
    setDrafts((prev) => {
      const existing = prev.get(key) ?? splitArtistNameParts(sourceName);
      const next = new Map(prev);
      next.set(key, { ...existing, ...patch });
      return next;
    });
  }, []);

  const buildArtistDetails = useCallback(
    (): VideoArtistDetail[] =>
      entries
        .filter((e) => e.status === 'new')
        .slice(0, MAX_ARTIST_DETAILS)
        .map(entryToDetail),
    [entries]
  );

  return { entries, updateDraft, buildArtistDetails, primarySplitParts };
};
