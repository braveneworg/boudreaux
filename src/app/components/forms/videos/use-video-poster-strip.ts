/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useMemo, useState } from 'react';

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
   * Whether THIS session's captured frames already reached the row — true in a
   * draft session (the draft create persisted them), false during an edit-mode
   * file replace, where they only land at Save. `selectVideoPosterAction`
   * accepts only the row's own candidates, so a fresh pick must stay local
   * until then or the server refuses it and the pick snaps back.
   */
  freshCandidatesPersisted: boolean;
  /**
   * Called only after a pick has actually persisted. `VideoForm` uses it to
   * forget a poster uploaded this session, whose display precedence would
   * otherwise keep the preview on the manual image the pick just replaced.
   */
  onPosterPersisted?: () => void;
}

export interface UseVideoPosterStripResult {
  /** Wire to useVideoUpload's onPosterCandidates. */
  handlePosterCandidates: (candidates: PosterCandidate[]) => void;
  /** Thumbs for the section — fresh blobs this session, else stored candidates. */
  stripCandidates: StripCandidate[];
  /** Highlighted index; -1 = none (e.g. a manual poster is live). */
  selectedIndex: number;
  /** Click handler — local pre-persist, instant server persist after. */
  handleSelectCandidate: (index: number) => void;
  /** Selected fresh blob for the legacy Save-time fallback (null when stored/hydrated). */
  selectedPosterBlob: Blob | null;
  /** Poster fields for the draft payload (the draft hook's `getPosterFields`). */
  getPosterDraftFields: () => Promise<DraftPosterFields>;
}

type SelectVideoPosterAsync = ReturnType<
  typeof useSelectVideoPosterMutation
>['selectVideoPosterAsync'];

/**
 * Which stored candidate the live poster URL points at — `-1` when none does
 * (a manually uploaded poster, or a row whose poster predates the candidates).
 */
const resolveStoredSelectedIndex = (
  stored: VideoPosterCandidate[],
  posterUrl: string | undefined
): number => stored.findIndex((candidate) => candidate.url === posterUrl);

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
 * A click is local-only until a row exists AND holds the clicked candidate;
 * then the pick is written into the form optimistically and persisted
 * instantly, reverting with an error toast if the server refuses it. A stored
 * pick qualifies as soon as a row exists; a fresh one needs
 * `freshCandidatesPersisted`. Otherwise the selection stays local and rides
 * along into the draft/save payload via
 * {@link UseVideoPosterStripResult.getPosterDraftFields}.
 */
export const useVideoPosterStrip = ({
  form,
  video,
  isPersisted,
  effectiveVideoId,
  preGeneratedId,
  freshCandidatesPersisted,
  onPosterPersisted,
}: UseVideoPosterStripArgs): UseVideoPosterStripResult => {
  const [freshCandidates, setFreshCandidates] = useState<PosterCandidate[]>([]);
  const [freshSelectedIndex, setFreshSelectedIndex] = useState(0);
  const { startUploads, alignedNow, getSettledAligned } = usePosterCandidateUploads({
    preGeneratedId,
  });
  const { selectVideoPosterAsync } = useSelectVideoPosterMutation();
  const watchedPosterUrl = useWatch({ control: form.control, name: 'posterUrl' });

  const isFreshMode = freshCandidates.length > 0;
  const stored = useMemo<VideoPosterCandidate[]>(() => video?.posterCandidates ?? [], [video]);
  const stripCandidates: StripCandidate[] = isFreshMode ? freshCandidates : stored;
  const selectedIndex = isFreshMode
    ? freshSelectedIndex
    : resolveStoredSelectedIndex(stored, watchedPosterUrl);

  // Capturing a fresh candidate set pre-selects the sharpest frame and kicks
  // the upload fan-out, so the selection has a URL to persist by the time the
  // draft lands (and Save can still commit the blob if every upload failed).
  // Every capture goes to the fan-out, including an empty one: it owns the
  // settled/aligned state, so only it can forget the previous file's frames
  // (it skips the pointless presign for an empty set itself).
  const handlePosterCandidates = useCallback(
    (candidates: PosterCandidate[]): void => {
      setFreshCandidates(candidates);
      setFreshSelectedIndex(bestPosterCandidateIndex(candidates));
      startUploads(candidates);
    },
    [startUploads]
  );

  const persistPick = useCallback(
    async (candidateUrl: string): Promise<void> => {
      if (!effectiveVideoId) return;
      const previousPosterUrl = form.getValues('posterUrl') ?? '';
      form.setValue('posterUrl', candidateUrl, { shouldDirty: false });
      if (await didPersistPoster(selectVideoPosterAsync, effectiveVideoId, candidateUrl)) {
        onPosterPersisted?.();
        toast.success('Poster updated.');
        return;
      }
      form.setValue('posterUrl', previousPosterUrl, { shouldDirty: false });
      toast.error('Could not set the poster — try again.');
    },
    [effectiveVideoId, form, selectVideoPosterAsync, onPosterPersisted]
  );

  const handleSelectCandidate = useCallback(
    (index: number): void => {
      if (isFreshMode) setFreshSelectedIndex(index);
      // A fresh frame is only persistable once its own upload has landed AND
      // the row already carries this session's candidates; until then the pick
      // stays local and the draft/save payload carries it.
      const candidateUrl = isFreshMode ? alignedNow.at(index)?.url : stored.at(index)?.url;
      const isPersistable = isPersisted && (isFreshMode ? freshCandidatesPersisted : true);
      if (isPersistable && candidateUrl) void persistPick(candidateUrl);
    },
    [isFreshMode, alignedNow, stored, isPersisted, freshCandidatesPersisted, persistPick]
  );

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
  };
};
