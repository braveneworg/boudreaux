/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useSelectVideoPosterMutation } from '@/hooks/mutations/use-video-mutations';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';

import { usePosterCandidateUploads } from './use-poster-candidate-uploads';
import { bestPosterCandidateIndex, type PosterCandidate } from './video-metadata';

import type { DraftPosterFields } from './use-video-draft';
import type { UseFormReturn } from 'react-hook-form';

/** One strip thumb: a fresh captured frame (blob) or a stored candidate (url). */
export type StripCandidate = PosterCandidate | VideoPosterCandidate;

export interface UseVideoPosterStripArgs {
  form: UseFormReturn<VideoFormData>;
  video: VideoRow | null | undefined;
  isPersisted: boolean;
  effectiveVideoId: string | undefined;
  preGeneratedId: string;
  /**
   * Candidate URLs a draft create wrote onto the row this session (empty in
   * edit mode, where the row's own `posterCandidates` cover it).
   * `selectVideoPosterAction` accepts only the row's own candidates, so a
   * fresh pick must stay local until one of these URLs is what it points at —
   * otherwise the server refuses it and the pick visibly snaps back. Tracked
   * as URLs rather than a per-session flag because a SECOND file replace
   * captures frames the row has never seen while the draft still exists.
   */
  draftCandidateUrls: string[];
  /**
   * Called only after a pick has actually persisted. `VideoForm` uses it to
   * forget a poster uploaded this session, whose display precedence would
   * otherwise keep the preview on the manual image the pick just replaced.
   */
  onPosterPersisted?: () => void;
  /**
   * Called when a replacement file drops the outgoing one's poster. Clearing
   * the form field is not enough on its own — a poster uploaded this session
   * out-ranks it in both the preview and the submit payload — so `VideoForm`
   * uses this to forget that upload too.
   */
  onPosterDropped?: () => void;
}

export interface UseVideoPosterStripResult {
  /** Wire to useVideoUpload's onPosterCandidates. */
  handlePosterCandidates: (candidates: PosterCandidate[]) => void;
  /**
   * Thumbs for the section — fresh blobs this session, else stored candidates,
   * followed by every "Next 5 frames" batch appended this session.
   */
  stripCandidates: StripCandidate[];
  /** Highlighted index; -1 = none (e.g. a manual poster is live). */
  selectedIndex: number;
  /** Click handler — local pre-persist, instant server persist after. */
  handleSelectCandidate: (index: number) => void;
  /** Selected fresh blob for the legacy Save-time fallback (null when stored/hydrated). */
  selectedPosterBlob: Blob | null;
  /** Poster fields for the draft payload (the draft hook's `getPosterFields`). */
  getPosterDraftFields: () => Promise<DraftPosterFields>;
  /**
   * Add a "Next 5 frames" batch — frames already uploaded AND persisted on the
   * row — after the current thumbs. The current pick stays where it is.
   */
  appendCandidates: (candidates: VideoPosterCandidate[]) => void;
  /** Timestamp of the latest frame on the strip; null when it is empty. */
  latestAtSeconds: number | null;
}

type SelectVideoPosterAsync = ReturnType<
  typeof useSelectVideoPosterMutation
>['selectVideoPosterAsync'];

/** The CDN URL of a stored thumb; `undefined` for a fresh blob or an absent index. */
const storedUrlOf = (candidate: StripCandidate | undefined): string | undefined =>
  candidate && 'url' in candidate ? candidate.url : undefined;

/**
 * Which stored candidate the live poster URL points at — `-1` when none does
 * (a manually uploaded poster, or a row whose poster predates the candidates).
 */
const resolveStoredSelectedIndex = (
  candidates: StripCandidate[],
  posterUrl: string | undefined
): number => candidates.findIndex((candidate) => storedUrlOf(candidate) === posterUrl);

/**
 * Run the persist call and report only whether the poster stuck. A rejected
 * mutation (a transport failure reaching the Server Action) is a failure like
 * any resolved `success: false` — never an unhandled rejection out of a click.
 */
const didPersistPoster = async (
  selectVideoPosterAsync: SelectVideoPosterAsync,
  videoId: string,
  candidateUrl: string
): Promise<boolean> => {
  try {
    const result = await selectVideoPosterAsync({ videoId, candidateUrl });
    return result.success;
  } catch {
    return false;
  }
};

interface UsePersistPosterPickArgs {
  form: UseFormReturn<VideoFormData>;
  effectiveVideoId: string | undefined;
  onPosterPersisted?: () => void;
}

/**
 * One pick's optimistic write + instant persist, latest-pick-wins. A newer
 * click always owns `posterUrl`, so an older attempt's outcome neither writes
 * nor toasts: without that guard a first pick failing AFTER a second one
 * succeeded reverts the preview to a value two picks old (until the video
 * refetch lands) and reports an error for a poster that is in fact set. Same
 * generation guard `usePosterCandidateUploads` uses for its upload fan-out.
 */
const usePersistPosterPick = ({
  form,
  effectiveVideoId,
  onPosterPersisted,
}: UsePersistPosterPickArgs): ((candidateUrl: string) => Promise<void>) => {
  const { selectVideoPosterAsync } = useSelectVideoPosterMutation();
  const pickGenerationRef = useRef(0);

  return useCallback(
    async (candidateUrl: string): Promise<void> => {
      if (!effectiveVideoId) return;
      const generation = (pickGenerationRef.current += 1);
      const previousPosterUrl = form.getValues('posterUrl') ?? '';
      form.setValue('posterUrl', candidateUrl, { shouldDirty: false });
      const persisted = await didPersistPoster(
        selectVideoPosterAsync,
        effectiveVideoId,
        candidateUrl
      );
      if (pickGenerationRef.current !== generation) return;
      if (persisted) {
        onPosterPersisted?.();
        toast.success('Poster updated.');
        return;
      }
      form.setValue('posterUrl', previousPosterUrl, { shouldDirty: false });
      toast.error('Could not set the poster — try again.');
    },
    [effectiveVideoId, form, selectVideoPosterAsync, onPosterPersisted]
  );
};

/**
 * A capture that replaces a file already in play forces a fresh poster
 * choice: the outgoing capture's frames, the row's stored frames, and an
 * image the admin uploaded by hand all go, since cover art of a file that is
 * no longer there must never ride along (Save would otherwise hand file A's
 * poster to file B, and nothing in the UI would flag it). `s3Key` still holds
 * the OUTGOING key at capture time — the upload rewrites it only on success —
 * so it tells a replacement from a new video's first file, where there is
 * nothing to drop. `shouldDirty` so `VideoForm`'s `keepDirtyValues` reset
 * cannot restore the row's value over the clear.
 */
const dropOutgoingPoster = (
  form: UseFormReturn<VideoFormData>,
  onPosterDropped: (() => void) | undefined
): void => {
  if (!form.getValues('s3Key')) return;
  if (form.getValues('posterUrl')) form.setValue('posterUrl', '', { shouldDirty: true });
  onPosterDropped?.();
};

interface PickableUrlArgs {
  index: number;
  /** How many thumbs at the front are this session's capture (0 on a stored strip). */
  freshCount: number;
  alignedNow: (VideoPosterCandidate | null)[];
  stripCandidates: StripCandidate[];
}

/**
 * The URL a click on thumb `index` may persist, or `undefined` while it has
 * none. A fresh frame needs its own upload to have landed (`alignedNow`), and
 * the caller still checks the row carries it. An appended frame (past the
 * fresh set) or any stored thumb always has its URL: it reached the row
 * before it reached the strip.
 */
const pickableUrlAt = ({
  index,
  freshCount,
  alignedNow,
  stripCandidates,
}: PickableUrlArgs): string | undefined =>
  index < freshCount ? alignedNow.at(index)?.url : storedUrlOf(stripCandidates.at(index));

interface UseSelectCandidateArgs {
  /** How many thumbs at the front are this session's capture (0 on a stored strip). */
  freshCount: number;
  setFreshSelectedIndex: (index: number) => void;
  alignedNow: (VideoPosterCandidate | null)[];
  stripCandidates: StripCandidate[];
  isPersisted: boolean;
  rowCandidateUrls: Set<string>;
  persistPick: (candidateUrl: string) => Promise<void>;
}

/**
 * A click on thumb `index`: moves the local highlight on a fresh strip, then
 * persists the pick when a row exists AND carries the thumb's URL. Otherwise
 * the pick stays local and the draft/save payload carries it.
 */
const useSelectCandidate = ({
  freshCount,
  setFreshSelectedIndex,
  alignedNow,
  stripCandidates,
  isPersisted,
  rowCandidateUrls,
  persistPick,
}: UseSelectCandidateArgs): ((index: number) => void) =>
  useCallback(
    (index: number): void => {
      if (freshCount > 0) setFreshSelectedIndex(index);
      const candidateUrl = pickableUrlAt({ index, freshCount, alignedNow, stripCandidates });
      if (isPersisted && candidateUrl && rowCandidateUrls.has(candidateUrl)) {
        void persistPick(candidateUrl);
      }
    },
    [
      freshCount,
      setFreshSelectedIndex,
      alignedNow,
      stripCandidates,
      isPersisted,
      rowCandidateUrls,
      persistPick,
    ]
  );

interface UseStripRowsArgs {
  isFreshMode: boolean;
  freshCandidates: PosterCandidate[];
  stored: VideoPosterCandidate[];
  draftCandidateUrls: string[];
  appendedCandidates: VideoPosterCandidate[];
}

interface StripRows {
  /** Every candidate URL the row is known to carry — the only persistable picks. */
  rowCandidateUrls: Set<string>;
  stripCandidates: StripCandidate[];
  latestAtSeconds: number | null;
}

/**
 * The thumbs the strip shows and the URLs a pick may persist: this session's
 * capture (else the row's stored frames), then every appended batch — each
 * shown once even after the refetched row carries it too.
 */
const useStripRows = ({
  isFreshMode,
  freshCandidates,
  stored,
  draftCandidateUrls,
  appendedCandidates,
}: UseStripRowsArgs): StripRows => {
  const rowCandidateUrls = useMemo(
    () =>
      new Set([
        ...stored.map(({ url }) => url),
        ...draftCandidateUrls,
        ...appendedCandidates.map(({ url }) => url),
      ]),
    [stored, draftCandidateUrls, appendedCandidates]
  );
  const stripCandidates = useMemo<StripCandidate[]>(() => {
    const base: StripCandidate[] = isFreshMode ? freshCandidates : stored;
    const baseUrls = new Set(stored.map(({ url }) => url));
    return [...base, ...appendedCandidates.filter(({ url }) => !baseUrls.has(url))];
  }, [isFreshMode, freshCandidates, stored, appendedCandidates]);
  const latestAtSeconds =
    stripCandidates.length > 0 ? Math.max(...stripCandidates.map((c) => c.atSeconds)) : null;
  return { rowCandidateUrls, stripCandidates, latestAtSeconds };
};

/**
 * Owns the poster candidate strip: what it shows, which thumb is highlighted,
 * and what a click does.
 *
 * Two modes. A capture this session puts the hook in *fresh* mode — the strip
 * shows the captured blobs and the highlight is local index state, pre-set to
 * the sharpest frame. With no capture, it *hydrates* from the row's stored
 * candidates and the highlight follows the live `posterUrl`, so revisiting an
 * edit page still offers the frames (and highlights none when a manual poster
 * is live).
 *
 * A click is local-only until a row exists AND holds the clicked candidate —
 * the row's stored set, plus whatever a draft create wrote this session; then
 * the pick is written into the form optimistically and persisted instantly,
 * reverting with an error toast if the server refuses it. Otherwise the
 * selection stays local and rides along into the draft/save payload via
 * {@link UseVideoPosterStripResult.getPosterDraftFields}.
 */
export const useVideoPosterStrip = ({
  form,
  video,
  isPersisted,
  effectiveVideoId,
  preGeneratedId,
  draftCandidateUrls,
  onPosterPersisted,
  onPosterDropped,
}: UseVideoPosterStripArgs): UseVideoPosterStripResult => {
  const [freshCandidates, setFreshCandidates] = useState<PosterCandidate[]>([]);
  const [freshSelectedIndex, setFreshSelectedIndex] = useState(0);
  // Later windows' frames, already on the row. Kept locally because a create
  // session never refetches its draft row, and because the refetch an append
  // triggers in edit mode lands later than the strip should grow.
  const [appendedCandidates, setAppendedCandidates] = useState<VideoPosterCandidate[]>([]);
  const { startUploads, alignedNow, getSettledAligned } = usePosterCandidateUploads({
    preGeneratedId,
  });
  const persistPick = usePersistPosterPick({ form, effectiveVideoId, onPosterPersisted });
  const watchedPosterUrl = useWatch({ control: form.control, name: 'posterUrl' });

  const isFreshMode = freshCandidates.length > 0;
  const stored = useMemo<VideoPosterCandidate[]>(() => video?.posterCandidates ?? [], [video]);
  const { rowCandidateUrls, stripCandidates, latestAtSeconds } = useStripRows({
    isFreshMode,
    freshCandidates,
    stored,
    draftCandidateUrls,
    appendedCandidates,
  });
  const selectedIndex = isFreshMode
    ? freshSelectedIndex
    : resolveStoredSelectedIndex(stripCandidates, watchedPosterUrl);

  const handlePosterCandidates = useCallback(
    (candidates: PosterCandidate[]): void => {
      dropOutgoingPoster(form, onPosterDropped);
      setFreshCandidates(candidates);
      setFreshSelectedIndex(bestPosterCandidateIndex(candidates));
      // Later windows belong to the outgoing file as much as its first frames do.
      setAppendedCandidates([]);
      startUploads(candidates);
    },
    [startUploads, form, onPosterDropped]
  );

  const appendCandidates = useCallback((candidates: VideoPosterCandidate[]): void => {
    setAppendedCandidates((previous) => [...previous, ...candidates]);
  }, []);

  const handleSelectCandidate = useSelectCandidate({
    freshCount: isFreshMode ? freshCandidates.length : 0,
    setFreshSelectedIndex,
    alignedNow,
    stripCandidates,
    isPersisted,
    rowCandidateUrls,
    persistPick,
  });

  const getPosterDraftFields = useCallback(async (): Promise<DraftPosterFields> => {
    const aligned = await getSettledAligned();
    const survivors = aligned.filter((entry): entry is VideoPosterCandidate => entry !== null);
    if (survivors.length === 0) return {};
    // Index-aligned: the selected frame is absent when its own upload failed,
    // and the draft then persists the survivors without a chosen poster.
    const selectedUrl = aligned.at(freshSelectedIndex)?.url;
    return { posterCandidates: survivors, ...(selectedUrl ? { posterUrl: selectedUrl } : {}) };
  }, [getSettledAligned, freshSelectedIndex]);

  const selectedPosterBlob = isFreshMode
    ? (freshCandidates.at(freshSelectedIndex)?.blob ?? null)
    : null;

  return {
    handlePosterCandidates,
    stripCandidates,
    selectedIndex,
    handleSelectCandidate,
    selectedPosterBlob,
    getPosterDraftFields,
    appendCandidates,
    latestAtSeconds,
  };
};
