/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import { toast } from 'sonner';

import { useAppendVideoPosterCandidatesMutation } from '@/hooks/mutations/use-video-mutations';
import { VIDEO_POSTER_CANDIDATE_CAP } from '@/lib/constants/video-uploads';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';

import { uploadPosterCandidates } from './use-poster-candidate-uploads';
import {
  capturePosterCandidatesFromSource,
  nextPosterWindowStart,
  POSTER_CANDIDATE_COUNT,
} from './video-metadata';

/**
 * Why the "Next 5 frames" button is disabled, in priority order:
 * `uploading` — no row yet, or the file is still streaming to S3;
 * `cap` — another batch would exceed {@link VIDEO_POSTER_CANDIDATE_CAP};
 * `end` — the next sample window would start at or past the end;
 * `no-source` — nothing to decode from (no local file and no stream URL).
 */
export type NextFramesBlocker = 'uploading' | 'cap' | 'end' | 'no-source';

export interface UseNextPosterFramesArgs {
  /** The file picked this session, else the row's signed stream URL, else null. */
  source: File | string | null;
  /** The video's duration, or null while unknown. */
  durationSeconds: number | null;
  /** Timestamp of the latest frame on the strip; null when it is empty. */
  latestAtSeconds: number | null;
  /** How many candidates the strip holds now — the cap counts from here. */
  candidateCount: number;
  preGeneratedId: string;
  effectiveVideoId: string | undefined;
  isPersisted: boolean;
  /** True while the video file itself is being prepared or uploaded. */
  isUploadBusy: boolean;
  /** Receives the batch once it is on the row — the strip appends it. */
  onAppended: (candidates: VideoPosterCandidate[]) => void;
}

export interface UseNextPosterFramesResult {
  /** Capture, upload and persist the next sample window; a no-op while blocked. */
  requestNextFrames: () => Promise<void>;
  /** True from the press until the batch is on the row (or the press failed). */
  isCapturing: boolean;
  /** Null when a press is possible. */
  blocker: NextFramesBlocker | null;
  /** Where the next sample window starts; null when none fits. */
  nextWindowStart: number | null;
}

const NO_FRAMES_MESSAGE = 'Could not read more frames from this video.';
const STORE_FAILED_MESSAGE = 'Could not store the new frames.';

interface ResolveBlockerArgs {
  isReady: boolean;
  candidateCount: number;
  nextWindowStart: number | null;
  hasSource: boolean;
}

/** The highest-priority reason a press is impossible, or null. */
const resolveBlocker = ({
  isReady,
  candidateCount,
  nextWindowStart,
  hasSource,
}: ResolveBlockerArgs): NextFramesBlocker | null => {
  if (!isReady) return 'uploading';
  if (candidateCount + POSTER_CANDIDATE_COUNT > VIDEO_POSTER_CANDIDATE_CAP) return 'cap';
  if (nextWindowStart === null) return 'end';
  if (!hasSource) return 'no-source';
  return null;
};

interface RunNextFramesPressArgs {
  source: File | string;
  windowStart: number;
  preGeneratedId: string;
  /** How many frames the video already holds — the new files are numbered after them. */
  ordinalOffset: number;
  videoId: string;
  persist: ReturnType<
    typeof useAppendVideoPosterCandidatesMutation
  >['appendVideoPosterCandidatesAsync'];
}

type NextFramesOutcome =
  { ok: true; candidates: VideoPosterCandidate[] } | { ok: false; error: string };

/**
 * The press itself: capture the window, upload what it yielded, persist the
 * survivors. Each stage's empty result is a distinct refusal so the admin
 * learns whether the video or the storage was the problem.
 */
const runNextFramesPress = async ({
  source,
  windowStart,
  preGeneratedId,
  ordinalOffset,
  videoId,
  persist,
}: RunNextFramesPressArgs): Promise<NextFramesOutcome> => {
  const frames = await capturePosterCandidatesFromSource({ src: source, windowStart });
  if (frames.length === 0) return { ok: false, error: NO_FRAMES_MESSAGE };
  const aligned = await uploadPosterCandidates(frames, preGeneratedId, ordinalOffset);
  const survivors = aligned.filter((entry): entry is VideoPosterCandidate => entry !== null);
  if (survivors.length === 0) return { ok: false, error: STORE_FAILED_MESSAGE };
  const result = await persist({ videoId, candidates: survivors });
  if (!result.success) return { ok: false, error: result.error ?? STORE_FAILED_MESSAGE };
  return { ok: true, candidates: survivors };
};

/**
 * Owns a "Next 5 frames" press: decode the next sample window from the local
 * file (create session) or the signed stream URL (edit visit), upload the
 * frames numbered after the ones the video already holds, persist them onto
 * the row, and only then hand them to the strip — so a pick on any of them is
 * instant like every other pick. Every failure toasts and leaves the strip as
 * it was; a batch that uploaded but failed to persist stays in S3 as an
 * orphan (the row never names it, so the delete cascade never sees it).
 */
export const useNextPosterFrames = ({
  source,
  durationSeconds,
  latestAtSeconds,
  candidateCount,
  preGeneratedId,
  effectiveVideoId,
  isPersisted,
  isUploadBusy,
  onAppended,
}: UseNextPosterFramesArgs): UseNextPosterFramesResult => {
  const [isCapturing, setIsCapturing] = useState(false);
  const { appendVideoPosterCandidatesAsync } = useAppendVideoPosterCandidatesMutation();

  const nextWindowStart = nextPosterWindowStart(latestAtSeconds, durationSeconds);
  const blocker = resolveBlocker({
    isReady: isPersisted && effectiveVideoId !== undefined && !isUploadBusy,
    candidateCount,
    nextWindowStart,
    hasSource: source !== null,
  });

  const requestNextFrames = useCallback(async (): Promise<void> => {
    if (blocker !== null || isCapturing) return;
    // Narrowed by `blocker === null`: the source and the window are both there.
    if (source === null || nextWindowStart === null || effectiveVideoId === undefined) return;
    setIsCapturing(true);
    try {
      const outcome = await runNextFramesPress({
        source,
        windowStart: nextWindowStart,
        preGeneratedId,
        ordinalOffset: candidateCount,
        videoId: effectiveVideoId,
        persist: appendVideoPosterCandidatesAsync,
      });
      if (outcome.ok) {
        onAppended(outcome.candidates);
      } else {
        toast.error(outcome.error);
      }
    } catch {
      toast.error(STORE_FAILED_MESSAGE);
    } finally {
      setIsCapturing(false);
    }
  }, [
    blocker,
    isCapturing,
    source,
    nextWindowStart,
    effectiveVideoId,
    preGeneratedId,
    candidateCount,
    appendVideoPosterCandidatesAsync,
    onAppended,
  ]);

  return { requestNextFrames, isCapturing, blocker, nextWindowStart };
};
