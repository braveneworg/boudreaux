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

import type { VideoUploadStatus } from './use-video-upload';
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
  uploadStatus: VideoUploadStatus;
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
}

/** Per-pair progress, kept across renders in a ref and read only by effects. */
interface PairState {
  budget: LookupBudget;
  /** The attempt currently on the wire, shared across effect re-runs. */
  inFlight: Promise<LookupOutcome> | null;
  /** Found, exhausted, or beaten by a typed date — never searched again this mount. */
  resolved: boolean;
}

/**
 * What one pair shows. Kept in state PER pair (not one slot for the latest
 * pair) so editing the title away and back restores that pair's hint.
 */
interface PairView {
  status: ReleaseDateLookupStatus;
}

type ShowPairView = (key: string, view: PairView) => void;

const defaultNow = (): Date => new Date();

/**
 * What the field shows for the CURRENT pair. A run only lives while the gate
 * is open, so `searching` with a closed gate (upload failed before a row
 * existed, category changed, a date typed while the fetch was in flight)
 * means the run was cancelled — read it as idle rather than announcing a
 * search that is not happening. Likewise "No release date found" makes no
 * sense once a date has been set by hand.
 */
const deriveLookupResult = (
  view: PairView | undefined,
  releasedOn: string,
  gateOpen: boolean
): UseReleaseDateAutoLookupResult => {
  const shown = view?.status ?? 'idle';
  const cutOff = shown === 'searching' && !gateOpen;
  const hiddenByDate = shown === 'exhausted' && Boolean(releasedOn.trim());
  return { status: cutOff || hiddenByDate ? 'idle' : shown };
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
  show: ShowPairView;
}

/**
 * Drive one pair's attempt loop: schedule the next attempt per the budget,
 * fire it (an attempt is counted only when a fetch actually starts, so a
 * StrictMode double-run that cancels before firing spends nothing), classify
 * the result, fill an empty field on a find, or loop on a miss until the
 * budget is spent. Returns a cancel: any later result is discarded.
 */
const startLookupRun = (deps: LookupRunDeps): (() => void) => {
  const { key, state, scheduler, now, refetch, getValues, setValue, show } = deps;
  let cancelled = false;
  let cancelTimer: (() => void) | null = null;

  const fill = (releasedOn: string): void => {
    state.resolved = true;
    // Re-read the live value: a date typed while the fetch was in flight wins —
    // the pair still counts as resolved, with the admin's date as the one to
    // describe.
    if (getValues('releasedOn')?.trim()) {
      show(key, { status: 'idle' });
      return;
    }
    setValue('releasedOn', releasedOn, { shouldDirty: true, shouldValidate: true });
    show(key, { status: 'found' });
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
    show(key, { status: 'searching' });
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
      show(key, { status: 'exhausted' });
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
  const [views, setViews] = useState<ReadonlyMap<string, PairView>>(() => new Map());

  useEffect(() => {
    if (!gateOpen) return;
    const state = getPairState(pairs.current, pairKey);
    if (state.resolved) return;
    const show: ShowPairView = (key, view) => {
      setViews((previous) => new Map(previous).set(key, view));
    };
    const cancelRun = startLookupRun({
      key: pairKey,
      state,
      scheduler,
      now,
      refetch,
      getValues,
      setValue,
      show,
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

  return deriveLookupResult(views.get(pairKey), releasedOn, gateOpen);
};
