/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';

import { useDebounce } from '@/hooks/use-debounce';
import { queryKeys } from '@/lib/query-keys';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import {
  classifyLookupResult,
  createLookupBudget,
  lookupPairKey,
  nextAttemptDelayMs,
  recordLookupAttempt,
  shouldLookupReleaseDate,
  type LookupBudget,
  type LookupOutcome,
} from './release-date-lookup-policy';
import { useReleaseDateLookupQuery } from '../_hooks/use-release-date-lookup-query';

import type { UseFormReturn } from 'react-hook-form';

/** Injectable timer so specs drive the backoff without fake timers. */
export interface Scheduler {
  /** Run `fn` after `delayMs`; returns a cancel function. */
  schedule: (fn: () => void, delayMs: number) => () => void;
}

/** The production scheduler: a plain `setTimeout`. */
export const timeoutScheduler: Scheduler = {
  schedule: (fn, delayMs) => {
    const id = setTimeout(fn, delayMs);
    return () => clearTimeout(id);
  },
};

/** Debounce applied to the (title, artist) pair before a lookup is keyed. */
export const RELEASE_DATE_LOOKUP_DEBOUNCE_MS = 400;

/** What the release-date field shows for the CURRENT (title, artist) pair. */
export type ReleaseDateLookupStatus = 'idle' | 'searching' | 'found' | 'exhausted';

export interface UseReleaseDateAutoLookupArgs {
  form: UseFormReturn<VideoFormData>;
  /** The multipart upload state machine's status. */
  uploadStatus: string;
  /** True once a Video row exists (edit mode, or the draft created at upload). */
  hasPersistedRow: boolean;
  category: string | undefined;
  scheduler?: Scheduler;
  /** Clock for the today-is-a-miss rule; injectable for specs. */
  now?: () => Date;
  debounceMs?: number;
}

export interface UseReleaseDateAutoLookupResult {
  status: ReleaseDateLookupStatus;
  /**
   * The pair key whose lookup last resolved (found or exhausted), or null.
   * The description auto-generate compares it with its own current pair.
   */
  resolvedKey: string | null;
}

/** Per-pair progress, kept across renders in a ref. */
interface PairState {
  budget: LookupBudget;
  /** The attempt currently on the wire, shared across effect re-runs. */
  inFlight: Promise<LookupOutcome> | null;
  /** Found or exhausted — never searched again this mount. */
  resolved: boolean;
}

interface LookupView {
  key: string;
  status: ReleaseDateLookupStatus;
}

const defaultNow = (): Date => new Date();

/**
 * What the field shows for the CURRENT pair, and which pair last resolved. A
 * searching/exhausted hint makes no sense once a date has been set by hand
 * (typing one closes the gate, so a run cut off mid-flight would otherwise
 * read "searching" forever).
 */
const deriveLookupResult = (
  view: LookupView,
  pairKey: string,
  releasedOn: string
): UseReleaseDateAutoLookupResult => {
  const currentStatus = view.key === pairKey ? view.status : 'idle';
  const status = releasedOn.trim() && currentStatus !== 'found' ? 'idle' : currentStatus;
  const resolvedKey = view.status === 'found' || view.status === 'exhausted' ? view.key : null;
  return { status, resolvedKey };
};

const getPairState = (pairs: Map<string, PairState>, key: string): PairState => {
  const existing = pairs.get(key);
  if (existing) return existing;
  const created: PairState = { budget: createLookupBudget(), inFlight: null, resolved: false };
  pairs.set(key, created);
  return created;
};

interface LookupRunDeps {
  key: string;
  state: PairState;
  scheduler: Scheduler;
  now: () => Date;
  refetch: () => Promise<{ data?: { releasedOn: string } | null }>;
  getValues: UseFormReturn<VideoFormData>['getValues'];
  setValue: UseFormReturn<VideoFormData>['setValue'];
  setView: (view: LookupView) => void;
}

/**
 * Drive one pair's attempt loop: schedule the next attempt per the budget,
 * fire it (an attempt is counted only when a fetch actually starts, so a
 * StrictMode double-run that cancels before firing spends nothing), classify
 * the result, fill an empty field on a find, or loop on a miss until the
 * budget is spent. Returns a cancel: any later result is discarded.
 */
const startLookupRun = (deps: LookupRunDeps): (() => void) => {
  const { key, state, scheduler, now, refetch, getValues, setValue, setView } = deps;
  let cancelled = false;
  let cancelTimer: (() => void) | null = null;

  const fill = (releasedOn: string): void => {
    state.resolved = true;
    // Re-read the live value: a date typed while the fetch was in flight wins.
    if (getValues('releasedOn')?.trim()) {
      setView({ key, status: 'idle' });
      return;
    }
    setValue('releasedOn', releasedOn, { shouldDirty: true, shouldValidate: true });
    setView({ key, status: 'found' });
  };

  const settle = (outcome: LookupOutcome): void => {
    if (cancelled) return;
    if (outcome.kind === 'found') {
      fill(outcome.releasedOn);
      return;
    }
    attempt();
  };

  const fire = (): void => {
    state.budget = recordLookupAttempt(state.budget);
    setView({ key, status: 'searching' });
    const promise = refetch()
      .then((result) => classifyLookupResult(result.data, now()))
      .catch((): LookupOutcome => ({ kind: 'miss' }));
    state.inFlight = promise;
    void promise.then((outcome) => {
      state.inFlight = null;
      settle(outcome);
    });
  };

  const attempt = (): void => {
    const delayMs = nextAttemptDelayMs(state.budget);
    if (delayMs === null) {
      state.resolved = true;
      setView({ key, status: 'exhausted' });
      return;
    }
    cancelTimer = scheduler.schedule(fire, delayMs);
  };

  if (state.inFlight) {
    void state.inFlight.then(settle);
  } else {
    attempt();
  }

  return () => {
    cancelled = true;
    cancelTimer?.();
  };
};

/**
 * Automatic release-date lookup for the admin video form. Replaces the old
 * "Find release date" button: once the gate opens (see
 * `shouldLookupReleaseDate`) it searches the debounced (title, artist) pair
 * with a fixed budget — three attempts, immediate then +20s then +60s — and
 * fills the field on the first real find (dirty, so the edit-mode reset and
 * the enrichment guard both leave it alone; the autosave persists it). A
 * result equal to today's UTC day is a miss, mirroring the server rule. The
 * budget is keyed per pair: editing the title or artist cancels the timer,
 * discards any in-flight result, and starts a fresh budget for the new pair.
 * Every attempt is an explicit `refetch()` on a disabled query, so a cached
 * null never short-circuits an attempt and nothing refetches on focus.
 */
export const useReleaseDateAutoLookup = ({
  form,
  uploadStatus,
  hasPersistedRow,
  category,
  scheduler = timeoutScheduler,
  now = defaultNow,
  debounceMs = RELEASE_DATE_LOOKUP_DEBOUNCE_MS,
}: UseReleaseDateAutoLookupArgs): UseReleaseDateAutoLookupResult => {
  const { control, getValues, setValue } = form;
  // No `defaultValue` on these watches: with one, RHF reports it (not the
  // form's defaults) until the field first changes, and the gate would miss a
  // title/artist that was already there on mount.
  const title = useWatch({ control, name: 'title' }) ?? '';
  const artist = useWatch({ control, name: 'artist' }) ?? '';
  const releasedOn = useWatch({ control, name: 'releasedOn' }) ?? '';
  const debouncedTitle = useDebounce(title, debounceMs).trim();
  const debouncedArtist = useDebounce(artist, debounceMs).trim();
  const pairKey = lookupPairKey(debouncedTitle, debouncedArtist);
  const gateOpen = shouldLookupReleaseDate({
    uploadStatus,
    hasPersistedRow,
    category,
    title: debouncedTitle,
    artist: debouncedArtist,
    releasedOn,
  });

  const queryClient = useQueryClient();
  const { refetch } = useReleaseDateLookupQuery(debouncedTitle, debouncedArtist);
  const pairs = useRef<Map<string, PairState>>(new Map());
  const [view, setView] = useState<LookupView>({ key: '', status: 'idle' });

  useEffect(() => {
    if (!gateOpen) return;
    const state = getPairState(pairs.current, pairKey);
    if (state.resolved) return;
    const cancelRun = startLookupRun({
      key: pairKey,
      state,
      scheduler,
      now,
      refetch,
      getValues,
      setValue,
      setView,
    });
    const queryKey = queryKeys.videos.releaseDateLookup(debouncedTitle, debouncedArtist);
    return () => {
      cancelRun();
      void queryClient.cancelQueries({ queryKey }).catch(() => undefined);
    };
  }, [
    gateOpen,
    pairKey,
    debouncedTitle,
    debouncedArtist,
    scheduler,
    now,
    refetch,
    getValues,
    setValue,
    queryClient,
  ]);

  return deriveLookupResult(view, pairKey, releasedOn);
};
